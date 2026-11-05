jest.mock("@nestjs/common", () => {
  class HttpError extends Error {}
  return {
    ConflictException: HttpError,
    BadRequestException: HttpError,
    Inject: () => () => {},
    Injectable: () => () => {},
    Logger: class {
      error = jest.fn();
    },
    NotFoundException: HttpError,
  };
});

jest.mock("../infra/infra.module", () => ({
  ENV: "ENV",
  PrismaService: class PrismaService {},
  S3: "S3",
}));

jest.mock("../attachments/attachments.service", () => ({
  AttachmentsService: class AttachmentsService {},
}));

jest.mock("./internal-events.module", () => ({
  INTERNAL_EVENTS: "INTERNAL_EVENTS",
}));

import { ConflictException } from "@nestjs/common";
import { EventEmitter } from "node:events";
import type { AuthenticatedUser } from "../auth/auth.service";
import type { Env } from "../config/env";
import { PrismaService } from "../infra/infra.module";
import { AttachmentsService } from "../attachments/attachments.service";
import { P16Service } from "./p16.service";

const actor = {
  id: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000010",
  systemRole: "member",
  branchId: null,
  managedDepartmentIds: [],
  email: "actor@example.test",
  name: "Actor",
} as AuthenticatedUser;

const task = {
  id: "00000000-0000-4000-8000-000000000020",
  projectId: "00000000-0000-4000-8000-000000000030",
  creatorId: actor.id,
  assigneeId: actor.id,
  project: {
    id: "00000000-0000-4000-8000-000000000030",
    branchId: "00000000-0000-4000-8000-000000000040",
    confidentiality: "normal",
    branch: {
      id: "00000000-0000-4000-8000-000000000040",
      organizationId: actor.organizationId,
    },
    members: [{ userId: actor.id, role: "member" }],
  },
  creator: { departmentId: null },
  assignee: { departmentId: null },
};

describe("P16Service", () => {
  it("notifies project-member mentions and warns for mentioned non-members", async () => {
    const memberId = "00000000-0000-4000-8000-000000000051";
    const outsiderId = "00000000-0000-4000-8000-000000000052";
    const createMany = jest.fn().mockResolvedValue(undefined);
    const createdComment = {
      id: "00000000-0000-4000-8000-000000000053",
      taskId: task.id,
      authorId: actor.id,
      body: "Please review",
      mentions: [],
    };
    const tx = {
      comment: { create: jest.fn().mockResolvedValue(createdComment) },
      activityLog: { create: jest.fn().mockResolvedValue(undefined) },
      taskCollaborator: { findMany: jest.fn().mockResolvedValue([]) },
      notification: { createMany },
    };
    const prisma = {
      task: {
        findFirst: jest.fn().mockResolvedValue({
          ...task,
          project: {
            ...task.project,
            members: [
              ...task.project.members,
              { userId: memberId, role: "member" },
            ],
          },
        }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: memberId, name: "Member" },
          { id: outsiderId, name: "Outside" },
        ]),
      },
      $transaction: jest.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };
    const service = new P16Service(
      prisma as unknown as PrismaService,
      {} as Env,
      {} as never,
      new EventEmitter(),
      {} as AttachmentsService,
    );

    const result = await service.createComment(actor, task.projectId, task.id, {
      body: "Please review",
      isQuestion: false,
      mentionIds: [memberId, outsiderId],
      attachmentIds: [],
    });

    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: memberId,
          type: "mentioned",
          payload: {
            projectId: task.projectId,
            taskId: task.id,
            commentId: createdComment.id,
          },
        },
      ],
    });
    expect(result.mentionWarnings).toEqual([
      {
        userId: outsiderId,
        name: "Outside",
        warning: expect.any(String),
        canInvite: true,
      },
    ]);
  });

  it("rejects edits after the 15-minute window", async () => {
    const prisma = {
      task: { findFirst: jest.fn().mockResolvedValue(task) },
      comment: {
        findFirst: jest.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000050",
          taskId: task.id,
          authorId: actor.id,
          body: "old",
          isQuestion: false,
          createdAt: new Date(Date.now() - 16 * 60 * 1000),
        }),
      },
    };
    const service = new P16Service(
      prisma as unknown as PrismaService,
      {} as Env,
      {} as never,
      new EventEmitter(),
      {} as AttachmentsService,
    );

    await expect(
      service.editComment(
        actor,
        task.projectId,
        task.id,
        "00000000-0000-4000-8000-000000000050",
        { body: "new" },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("persists event notifications without task content", async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const service = new P16Service(
      { notification: { create } } as unknown as PrismaService,
      {} as Env,
      {} as never,
      new EventEmitter(),
      {} as AttachmentsService,
    );
    service.onModuleInit();
    const emitter = (service as unknown as { events: EventEmitter }).events;
    emitter.emit("domain", {
      type: "task.assigned",
      projectId: task.projectId,
      taskId: task.id,
      taskTitle: "Confidential task title",
      userId: actor.id,
    });
    await new Promise((resolve) => setImmediate(resolve));
    service.onModuleDestroy();

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: actor.id,
        type: "task.assigned",
        payload: { projectId: task.projectId, taskId: task.id },
      },
    });
    expect(JSON.stringify(create.mock.calls)).not.toContain(
      "Confidential task title",
    );
  });
});
