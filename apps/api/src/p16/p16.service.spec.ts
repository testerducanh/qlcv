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

import { BadRequestException, ConflictException } from "@nestjs/common";
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
    const findUnique = jest.fn().mockResolvedValue({ priority: "urgent" });
    const service = new P16Service(
      {
        task: { findUnique },
        notification: { create },
      } as unknown as PrismaService,
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
        payload: { projectId: task.projectId, taskId: task.id, urgent: true },
      },
    });
    expect(JSON.stringify(create.mock.calls)).not.toContain(
      "Confidential task title",
    );
  });

  it("validates notification time zones and releases staged digest items when disabled", async () => {
    const upsert = jest.fn().mockResolvedValue({ userId: actor.id });
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const tx = {
      notificationPreference: { upsert },
      notification: { updateMany },
    };
    const prisma = {
      notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
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

    await expect(
      service.updateNotificationPreferences(actor, { timeZone: "Not/AZone" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await service.updateNotificationPreferences(actor, {
      digestEnabled: false,
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: actor.id, digestOnly: true, readAt: null },
      data: { digestOnly: false },
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ timeZone: "Asia/Bangkok" }),
      }),
    );
  });

  it("saves per-event external notification channels and rejects duplicates", async () => {
    const upsert = jest.fn().mockResolvedValue({ userId: actor.id });
    const tx = {
      notificationPreference: { upsert },
      notification: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma = {
      notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
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

    await expect(
      service.updateNotificationPreferences(actor, {
        channels: { "task.assigned": ["email", "email"] },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await service.updateNotificationPreferences(actor, {
      channels: { "task.assigned": ["email", "sms"] },
      phoneNumber: "+84901234567",
      zaloUserId: "zalo-user-1",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          channels: { "task.assigned": ["email", "sms"] },
          phoneNumber: "+84901234567",
          zaloUserId: "zalo-user-1",
        }),
      }),
    );
  });

  it("lists only the current user's notification deliveries", async () => {
    const items = [
      {
        id: "00000000-0000-4000-8000-000000000060",
        channel: "email",
        status: "sent",
        attempts: 1,
        sentAt: new Date("2026-11-06T12:00:00Z"),
        lastError: null,
        createdAt: new Date("2026-11-06T11:59:00Z"),
        notification: { type: "task.assigned" },
      },
    ];
    const findMany = jest.fn().mockResolvedValue(items);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = {
      notificationDelivery: { findMany, count },
    };
    const service = new P16Service(
      prisma as unknown as PrismaService,
      {} as Env,
      {} as never,
      new EventEmitter(),
      {} as AttachmentsService,
    );

    await expect(
      service.listNotificationDeliveries(actor, { page: 1, pageSize: 20 }),
    ).resolves.toEqual({
      items,
      page: 1,
      pageSize: 20,
      total: 1,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { notification: { userId: actor.id } },
        skip: 0,
        take: 20,
      }),
    );
    expect(count).toHaveBeenCalledWith({
      where: { notification: { userId: actor.id } },
    });
  });
});
