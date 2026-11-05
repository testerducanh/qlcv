jest.mock("@nestjs/common", () => {
  class HttpError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }
  const decorator = () => () => {};
  return {
    BadRequestException: class extends HttpError {
      constructor(message = "Bad request") {
        super(
          typeof message === "string" ? message : JSON.stringify(message),
          400,
        );
      }
    },
    Inject: decorator,
    Injectable: decorator,
    NotFoundException: class extends HttpError {
      constructor(message = "Not found") {
        super(message, 404);
      }
    },
  };
});
jest.mock("../infra/infra.module", () => ({
  PrismaService: class PrismaService {},
}));

import { randomUUID } from "node:crypto";
import {
  CollaboratorRole,
  Confidentiality,
  Prisma,
  PrismaClient,
  ProjectRole,
  TaskPriority,
  TaskStatus,
  ViewMode,
} from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.service";
import type { PrismaService } from "../infra/infra.module";
import { MyWorkService } from "./my-work.service";

const prisma = new PrismaClient();

class Rollback extends Error {}

async function inRollback(fn: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await prisma.$transaction(
      async (tx) => {
        await fn(tx);
        throw new Rollback();
      },
      { timeout: 20000, maxWait: 10000 },
    );
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

function serviceFor(tx: Prisma.TransactionClient) {
  const client = new Proxy(tx, {
    get(target, property, receiver) {
      return Reflect.get(target, property, receiver);
    },
  }) as unknown as PrismaService;
  return new MyWorkService(client);
}

async function fixtures(tx: Prisma.TransactionClient) {
  const suffix = randomUUID();
  const organization = await tx.organization.create({
    data: { name: `My work ${suffix}` },
  });
  const branch = await tx.branch.create({
    data: { organizationId: organization.id, name: `Branch ${suffix}` },
  });
  const owner = await tx.user.create({
    data: {
      organizationId: organization.id,
      branchId: branch.id,
      email: `mywork-${suffix}@example.test`,
      name: "My Work Owner",
      status: "active",
    },
  });
  const outsider = await tx.user.create({
    data: {
      organizationId: organization.id,
      branchId: branch.id,
      email: `mywork-outsider-${suffix}@example.test`,
      name: "My Work Outsider",
      status: "active",
    },
  });
  const project = await tx.project.create({
    data: {
      branchId: branch.id,
      ownerId: owner.id,
      name: `Project ${suffix}`,
    },
  });
  const restrictedProject = await tx.project.create({
    data: {
      branchId: branch.id,
      ownerId: owner.id,
      name: `Restricted ${suffix}`,
      confidentiality: Confidentiality.restricted,
    },
  });
  await tx.projectMember.create({
    data: { projectId: project.id, userId: owner.id, role: ProjectRole.owner },
  });
  const actor: AuthenticatedUser = {
    id: owner.id,
    organizationId: organization.id,
    systemRole: "member",
    branchId: branch.id,
    managedDepartmentIds: [],
    email: owner.email,
    name: owner.name,
  };
  const outsiderActor: AuthenticatedUser = {
    ...actor,
    id: outsider.id,
    email: outsider.email,
    name: outsider.name,
  };
  return { actor, outsiderActor, owner, project, restrictedProject };
}

function position(index: number) {
  return index.toString(36).toUpperCase().padStart(12, "0");
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("MyWorkService database workflows", () => {
  it("finds Vietnamese text without diacritics across task, comment and attachment names", async () => {
    await inRollback(async (tx) => {
      const { actor, outsiderActor, owner, project, restrictedProject } =
        await fixtures(tx);
      const service = serviceFor(tx);
      const titleTask = await tx.task.create({
        data: {
          projectId: project.id,
          creatorId: owner.id,
          title: "Báo cáo tuần",
          description: "<script>alert(1)</script>",
          position: position(0),
        },
      });
      const commentTask = await tx.task.create({
        data: {
          projectId: project.id,
          creatorId: owner.id,
          title: "Trao đổi",
          position: position(1),
        },
      });
      const comment = await tx.comment.create({
        data: {
          taskId: commentTask.id,
          authorId: owner.id,
          body: "Tổng hợp báo cáo",
        },
      });
      const fileTask = await tx.task.create({
        data: {
          projectId: project.id,
          creatorId: owner.id,
          title: "Hồ sơ",
          position: position(2),
        },
      });
      await tx.attachment.create({
        data: {
          projectId: project.id,
          taskId: fileTask.id,
          uploaderId: owner.id,
          fileName: "Báo cáo tháng.pdf",
          mime: "application/pdf",
          size: 12,
          storageKey: `projects/${project.id}/test.pdf`,
        },
      });
      const secretTask = await tx.task.create({
        data: {
          projectId: restrictedProject.id,
          creatorId: owner.id,
          title: "Báo cáo mật",
          position: position(0),
        },
      });

      const results = await service.search(actor, "bao cao", 1, 20);
      expect(results.total).toBe(3);
      expect(results.items.map(({ id }) => id)).toEqual(
        expect.arrayContaining([titleTask.id, commentTask.id, fileTask.id]),
      );
      expect(
        results.items.find(({ id }) => id === titleTask.id)?.highlight,
      ).toContain("<mark>");
      expect(
        results.items.find(({ id }) => id === titleTask.id)?.highlight,
      ).not.toContain("<script>");
      expect(
        results.items.find(({ id }) => id === commentTask.id)?.highlight,
      ).toContain("<mark>");
      expect(
        results.items.find(({ id }) => id === fileTask.id)?.highlight,
      ).toContain("<mark>");
      expect(
        (await service.search(outsiderActor, "bao cao", 1, 20)).items,
      ).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: secretTask.id }),
        ]),
      );

      await tx.comment.update({
        where: { id: comment.id },
        data: { taskId: fileTask.id },
      });
      const movedCommentResults = await service.search(actor, "bao cao", 1, 20);
      expect(movedCommentResults.items.map(({ id }) => id)).not.toContain(
        commentTask.id,
      );
    });
  });

  it("filters and paginates My Tasks tabs without exposing restricted tasks", async () => {
    await inRollback(async (tx) => {
      const { actor, owner, project, restrictedProject } = await fixtures(tx);
      const service = serviceFor(tx);
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const todayTask = await tx.task.create({
        data: {
          projectId: project.id,
          creatorId: owner.id,
          assigneeId: owner.id,
          title: "Due today",
          dueDate: today,
          priority: TaskPriority.urgent,
          position: position(0),
        },
      });
      const otherTask = await tx.task.create({
        data: {
          projectId: project.id,
          creatorId: owner.id,
          assigneeId: owner.id,
          title: "Assigned, no date",
          position: position(1),
        },
      });
      await tx.task.create({
        data: {
          projectId: restrictedProject.id,
          creatorId: owner.id,
          assigneeId: owner.id,
          title: "Restricted assigned",
          position: position(0),
        },
      });
      const todayResult = await service.listTasks(actor, {
        tab: "today",
        days: 7,
        page: 1,
        pageSize: 10,
      });
      expect(todayResult.total).toBe(1);
      expect(todayResult.items[0]).toMatchObject({
        id: todayTask.id,
        title: "Due today",
        priority: "urgent",
        project: { id: project.id },
      });

      await tx.taskCollaborator.create({
        data: {
          taskId: otherTask.id,
          userId: actor.id,
          role: CollaboratorRole.follower,
        },
      });
      expect(
        await service.listTasks(actor, {
          tab: "following",
          days: 7,
          page: 1,
          pageSize: 1,
        }),
      ).toMatchObject({ total: 1, items: [{ id: otherTask.id }] });

      expect(
        await service.listTasks(actor, {
          tab: "assigned",
          days: 7,
          page: 1,
          pageSize: 10,
          statuses: [TaskStatus.todo],
          priorities: [TaskPriority.urgent],
        }),
      ).toMatchObject({ total: 1, items: [{ id: todayTask.id }] });
    });
  });

  it("manages personal and project-shared saved views with owner-only edits", async () => {
    await inRollback(async (tx) => {
      const { actor, outsiderActor, project } = await fixtures(tx);
      const service = serviceFor(tx);
      const shared = await service.createSavedView(actor, {
        name: "Ưu tiên cao",
        filter: { priorities: [TaskPriority.urgent, TaskPriority.high] },
        viewMode: ViewMode.kanban,
        projectId: project.id,
        isShared: true,
      });
      const personal = await service.createSavedView(actor, {
        name: "Cá nhân",
        filter: {},
        viewMode: ViewMode.list,
        isShared: false,
      });
      expect((await service.listSavedViews(actor)).map(({ id }) => id)).toEqual(
        expect.arrayContaining([shared.id, personal.id]),
      );
      expect(
        (await service.listSavedViews(outsiderActor)).map(({ id }) => id),
      ).not.toContain(shared.id);
      await expect(
        service.updateSavedView(outsiderActor, shared.id, { name: "Tampered" }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        service.updateSavedView(actor, shared.id, { name: "Updated" }),
      ).resolves.toMatchObject({ name: "Updated" });
      await expect(
        service.deleteSavedView(actor, personal.id),
      ).resolves.toMatchObject({ id: personal.id });
    });
  });

  it("measures full-text search against a 2,000-task project seed", async () => {
    await inRollback(async (tx) => {
      const { actor, owner, project } = await fixtures(tx);
      await tx.task.createMany({
        data: Array.from({ length: 2000 }, (_, index) => ({
          projectId: project.id,
          creatorId: owner.id,
          title:
            index === 1999 ? "Báo cáo tuần quan trọng" : `Công việc ${index}`,
          description: index % 20 === 0 ? "Cập nhật tiến độ dự án" : null,
          position: position(index),
        })),
      });
      const service = serviceFor(tx);
      const started = performance.now();
      const result = await service.search(actor, "bao cao", 1, 20);
      const elapsedMs = performance.now() - started;
      console.info(
        `Full-text search: ${elapsedMs.toFixed(1)} ms for 2,000 tasks`,
      );
      expect(result.total).toBe(1);
      expect(result.items[0].title).toBe("Báo cáo tuần quan trọng");
      expect(elapsedMs).toBeLessThan(300);
    });
  });
});
