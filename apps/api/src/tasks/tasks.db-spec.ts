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
    ConflictException: class extends HttpError {
      constructor(message = "Conflict") {
        super(
          typeof message === "string" ? message : JSON.stringify(message),
          409,
        );
      }
    },
    Global: decorator,
    Inject: decorator,
    Injectable: decorator,
    Logger: class {
      error = jest.fn();
    },
    NotFoundException: class extends HttpError {
      constructor(message = "Not found") {
        super(message, 404);
      }
    },
    Module: decorator,
  };
});

jest.mock("@aws-sdk/client-s3", () => ({
  CopyObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
  DeleteObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
}));

jest.mock("../attachments/attachments.service", () => ({
  AttachmentsService: class AttachmentsService {},
}));

import { randomUUID } from "node:crypto";
import {
  Confidentiality,
  Prisma,
  PrismaClient,
  ProjectRole,
  DependencyType,
  TaskStatus,
} from "@prisma/client";
import Redis from "ioredis";
import type { S3Client } from "@aws-sdk/client-s3";
import type { Env } from "../config/env";
import type { AuthenticatedUser } from "../auth/auth.service";
import type { PrismaService } from "../infra/infra.module";
import { TasksService } from "./tasks.service";
import { positionAt } from "./fractional-position";
import { P16Service } from "../p16/p16.service";
import { EventEmitter } from "node:events";
import type { AttachmentsService } from "../attachments/attachments.service";

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});
const env = {
  S3_BUCKET: "test",
} as Env;

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

function serviceFor(
  tx: Prisma.TransactionClient,
  redisClient: Redis = redis,
  s3Client: S3Client = {
    send: jest.fn().mockResolvedValue({}),
  } as unknown as S3Client,
): TasksService {
  const txPrisma = {
    project: tx.project,
    task: tx.task,
    projectMember: tx.projectMember,
    checklistItem: tx.checklistItem,
    taskDependency: tx.taskDependency,
    taskLabel: tx.taskLabel,
    label: tx.label,
    attachment: tx.attachment,
    comment: tx.comment,
    activityLog: tx.activityLog,
    $queryRaw: tx.$queryRaw.bind(tx),
    $executeRaw: tx.$executeRaw.bind(tx),
    $executeRawUnsafe: tx.$executeRawUnsafe.bind(tx),
    $transaction: async (
      work: (client: Prisma.TransactionClient) => Promise<unknown>,
    ) => work(tx),
  } as unknown as PrismaService;
  return new TasksService(txPrisma, redisClient, env, s3Client);
}

async function fixtures(tx: Prisma.TransactionClient) {
  const suffix = randomUUID();
  const organization = await tx.organization.create({
    data: { name: `Task integration ${suffix}` },
  });
  const branch = await tx.branch.create({
    data: { organizationId: organization.id, name: `Branch ${suffix}` },
  });
  const user = await tx.user.create({
    data: {
      organizationId: organization.id,
      branchId: branch.id,
      email: `task-${suffix}@example.test`,
      name: "Task integration user",
      status: "active",
    },
  });
  const project = await tx.project.create({
    data: {
      branchId: branch.id,
      ownerId: user.id,
      name: `Project ${suffix}`,
      confidentiality: Confidentiality.normal,
    },
  });
  await tx.projectMember.create({
    data: { projectId: project.id, userId: user.id, role: ProjectRole.owner },
  });
  const actor: AuthenticatedUser = {
    id: user.id,
    organizationId: organization.id,
    systemRole: "member",
    branchId: branch.id,
    managedDepartmentIds: [],
    email: user.email,
    name: user.name,
  };
  return { actor, project, user };
}

async function createTask(
  tx: Prisma.TransactionClient,
  projectId: string,
  creatorId: string,
  title: string,
  parentId: string | null = null,
) {
  const index = await tx.task.count({
    where: { projectId, parentId, deletedAt: null },
  });
  return tx.task.create({
    data: {
      projectId,
      creatorId,
      parentId,
      title,
      position: positionAt(index),
    },
  });
}

afterAll(async () => {
  await Promise.all([prisma.$disconnect(), redis.quit()]);
});

describe("TasksService database workflows", () => {
  it("previews and pastes a 20-line task tree with the correct depths", async () => {
    await inRollback(async (tx) => {
      const { actor, project } = await fixtures(tx);
      const service = serviceFor(tx);
      const text = [
        "Root 1",
        "  Child 1.1",
        "    Grandchild 1.1.1",
        "  Child 1.2",
        ...Array.from({ length: 16 }, (_, index) => `Root ${index + 2}`),
      ].join("\n");
      const preview = await service.pasteTasks(actor, project.id, text, true);
      expect(preview).toHaveLength(17);
      expect(await tx.task.count({ where: { projectId: project.id } })).toBe(0);

      const created = await service.pasteTasks(actor, project.id, text, false);
      expect(created).toHaveLength(20);
      const depths = await tx.task.findMany({
        where: { projectId: project.id },
        orderBy: [{ depth: "asc" }, { title: "asc" }],
        select: { title: true, depth: true },
      });
      expect(depths.find((task) => task.title === "Root 1")?.depth).toBe(1);
      expect(depths.find((task) => task.title === "Child 1.1")?.depth).toBe(2);
      expect(
        depths.find((task) => task.title === "Grandchild 1.1.1")?.depth,
      ).toBe(3);
    });
  });

  it("rejects a sixth level, task-tree cycles, dependency cycles, and stale versions", async () => {
    await inRollback(async (tx) => {
      const { actor, project, user } = await fixtures(tx);
      const service = serviceFor(tx);
      await expect(
        service.pasteTasks(
          actor,
          project.id,
          "A\n B\n  C\n   D\n    E\n     F",
          false,
        ),
      ).rejects.toMatchObject({ status: 400 });

      const first = await createTask(tx, project.id, user.id, "First");
      const second = await createTask(tx, project.id, user.id, "Second");
      await service.moveTask(actor, project.id, second.id, {
        version: second.version,
        parentId: first.id,
      });
      await tx.$executeRawUnsafe("SAVEPOINT task_move_cycle");
      await expect(
        service.moveTask(actor, project.id, first.id, {
          version: first.version,
          parentId: second.id,
        }),
      ).rejects.toMatchObject({ status: 400 });
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT task_move_cycle");

      await service.createDependency(actor, project.id, second.id, {
        predecessorId: first.id,
      });
      await expect(
        service.createDependency(actor, project.id, first.id, {
          predecessorId: second.id,
        }),
      ).rejects.toMatchObject({ status: 400 });

      const update = {
        version: first.version,
        title: "Updated",
      };
      await service.updateTask(actor, project.id, first.id, update);
      await expect(
        service.updateTask(actor, project.id, first.id, update),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        await tx.task.findUniqueOrThrow({ where: { id: first.id } }),
      ).toMatchObject({
        title: "Updated",
        status: TaskStatus.todo,
      });
    });
  });

  it("lists 2,000 tasks within the P1.4 latency target", async () => {
    await inRollback(async (tx) => {
      const { actor, project, user } = await fixtures(tx);
      await tx.task.createMany({
        data: Array.from({ length: 2000 }, (_, index) => ({
          projectId: project.id,
          creatorId: user.id,
          title: `Task ${index}`,
          position: positionAt(index),
        })),
      });
      const service = serviceFor(tx);
      const started = performance.now();
      const result = await service.listTasks(actor, project.id, {
        page: 1,
        pageSize: 200,
      });
      const elapsedMs = performance.now() - started;
      expect(result.total).toBe(2000);
      expect(result.items).toHaveLength(200);
      expect(elapsedMs).toBeLessThan(500);
    });
  });

  it("restores a bulk update once and keeps the undo token actor-scoped", async () => {
    await inRollback(async (tx) => {
      const { actor, project, user } = await fixtures(tx);
      const service = serviceFor(tx);
      const task = await createTask(tx, project.id, user.id, "Bulk task");
      const result = await service.bulkUpdateTasks(actor, project.id, {
        taskIds: [task.id],
        status: TaskStatus.done,
        dueDate: "2027-01-20",
      });

      try {
        expect(result).toMatchObject({ updated: 1, expiresIn: 60 });
        expect(
          await tx.task.findUniqueOrThrow({ where: { id: task.id } }),
        ).toMatchObject({
          status: TaskStatus.done,
          dueDate: new Date("2027-01-20T00:00:00.000Z"),
        });
        await expect(
          service.undoBulkUpdate(
            { ...actor, id: randomUUID() },
            result.undoToken,
          ),
        ).rejects.toMatchObject({ status: 404 });
        await expect(
          service.undoBulkUpdate(actor, result.undoToken),
        ).resolves.toEqual({
          restored: 1,
        });
        expect(
          await tx.task.findUniqueOrThrow({ where: { id: task.id } }),
        ).toMatchObject({
          status: TaskStatus.todo,
          dueDate: null,
        });
        await expect(
          service.undoBulkUpdate(actor, result.undoToken),
        ).rejects.toMatchObject({ status: 404 });
      } finally {
        await redis.del(`task-bulk-undo:${actor.id}:${result.undoToken}`);
      }
    });
  });

  it("rejects a bulk undo token after its 60-second lifetime", async () => {
    await inRollback(async (tx) => {
      const { actor, project, user } = await fixtures(tx);
      const service = serviceFor(tx);
      const task = await createTask(
        tx,
        project.id,
        user.id,
        "Expiring undo task",
      );
      const result = await service.bulkUpdateTasks(actor, project.id, {
        taskIds: [task.id],
        status: TaskStatus.done,
      });
      const key = `task-bulk-undo:${actor.id}:${result.undoToken}`;
      try {
        expect(await redis.expire(key, 1)).toBe(1);
        await new Promise((resolve) => setTimeout(resolve, 1100));
        await expect(
          service.undoBulkUpdate(actor, result.undoToken),
        ).rejects.toMatchObject({ status: 404 });
      } finally {
        await redis.del(key);
      }
    });
  });

  it("restores a soft-deleted task parent and its deleted descendants", async () => {
    await inRollback(async (tx) => {
      const { actor, project, user } = await fixtures(tx);
      const parent = await createTask(
        tx,
        project.id,
        user.id,
        "Deleted parent",
      );
      const child = await createTask(
        tx,
        project.id,
        user.id,
        "Deleted child",
        parent.id,
      );
      const deletedAt = new Date();
      await tx.task.updateMany({
        where: { id: { in: [parent.id, child.id] } },
        data: { deletedAt },
      });
      const p16 = new P16Service(
        tx as unknown as PrismaService,
        env,
        { send: jest.fn().mockResolvedValue({}) } as unknown as S3Client,
        new EventEmitter(),
        {} as AttachmentsService,
      );

      await expect(
        p16.restoreTrash(actor, project.id, "task", parent.id),
      ).resolves.toMatchObject({ id: parent.id, restored: 2 });
      const restored = await tx.task.findMany({
        where: { id: { in: [parent.id, child.id] } },
        select: { id: true, deletedAt: true },
      });
      expect(restored).toEqual(
        expect.arrayContaining([
          { id: parent.id, deletedAt: null },
          { id: child.id, deletedAt: null },
        ]),
      );
    });
  });

  it("limits confidential-task reads to placeholders and hides checklist details", async () => {
    await inRollback(async (tx) => {
      const { actor, project, user } = await fixtures(tx);
      const service = serviceFor(tx);
      await tx.project.update({
        where: { id: project.id },
        data: { confidentiality: Confidentiality.restricted },
      });
      await tx.projectMember.update({
        where: { projectId_userId: { projectId: project.id, userId: user.id } },
        data: { role: ProjectRole.restricted },
      });
      const confidentialTask = await createTask(
        tx,
        project.id,
        user.id,
        "Secret title",
      );
      await tx.checklistItem.create({
        data: {
          taskId: confidentialTask.id,
          title: "Secret checklist",
          position: positionAt(0),
        },
      });
      const branchDirector: AuthenticatedUser = {
        ...actor,
        id: randomUUID(),
        systemRole: "branch_director",
      };
      await tx.user.create({
        data: {
          id: branchDirector.id,
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          email: `director-${randomUUID()}@example.test`,
          name: "Branch Director",
          status: "active",
          systemRole: "branch_director",
        },
      });

      await expect(
        service.getTask(actor, project.id, confidentialTask.id),
      ).resolves.toMatchObject({ title: "Secret title" });
      await expect(
        service.getTask(branchDirector, project.id, confidentialTask.id),
      ).resolves.toEqual({ title: "Việc hạn chế", progress: 0 });
      await expect(
        service.listChecklist(branchDirector, project.id, confidentialTask.id),
      ).resolves.toEqual([]);
      await expect(
        service.updateTask(branchDirector, project.id, confidentialTask.id, {
          version: confidentialTask.version,
          title: "Changed",
        }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  it("clones a task subtree, resets checklist completion and copies attached objects", async () => {
    await inRollback(async (tx) => {
      const { actor, project, user } = await fixtures(tx);
      const s3 = {
        send: jest.fn().mockResolvedValue({}),
      } as unknown as S3Client;
      const service = serviceFor(tx, redis, s3);
      const root = await createTask(tx, project.id, user.id, "Clone root");
      const child = await createTask(
        tx,
        project.id,
        user.id,
        "Clone child",
        root.id,
      );
      const checklistItem = await tx.checklistItem.create({
        data: {
          taskId: child.id,
          title: "Checklist to copy",
          done: true,
          position: positionAt(0),
        },
      });
      await tx.attachment.createMany({
        data: [
          {
            projectId: project.id,
            taskId: root.id,
            uploaderId: user.id,
            fileName: "task.jpg",
            mime: "image/jpeg",
            size: 123,
            storageKey: "source/task.jpg",
          },
          {
            projectId: project.id,
            checklistItemId: checklistItem.id,
            uploaderId: user.id,
            fileName: "checklist.jpg",
            mime: "image/jpeg",
            size: 456,
            storageKey: "source/checklist.jpg",
          },
        ],
      });

      const clone = await service.cloneTask(actor, project.id, root.id, {
        includeFiles: true,
      });
      const clonedChild = await tx.task.findFirstOrThrow({
        where: { projectId: project.id, parentId: clone.id },
      });
      const clonedItem = await tx.checklistItem.findFirstOrThrow({
        where: { taskId: clonedChild.id },
      });
      expect(clonedItem).toMatchObject({
        title: "Checklist to copy",
        done: false,
        assigneeId: null,
      });
      expect(
        await tx.attachment.count({
          where: { taskId: clone.id, projectId: project.id },
        }),
      ).toBe(1);
      expect(
        await tx.attachment.count({
          where: { checklistItemId: clonedItem.id, projectId: project.id },
        }),
      ).toBe(1);
      expect(s3.send).toHaveBeenCalledTimes(2);
    });
  });

  it("supports checklist completion, ordering and task conversions", async () => {
    await inRollback(async (tx) => {
      const { actor, project, user } = await fixtures(tx);
      await tx.project.update({
        where: { id: project.id },
        data: { progressMode: "by_count" },
      });
      const service = serviceFor(tx);
      const parent = await createTask(
        tx,
        project.id,
        user.id,
        "Checklist parent",
      );
      const first = await service.createChecklistItem(
        actor,
        project.id,
        parent.id,
        { title: "First item" },
      );
      const second = await service.createChecklistItem(
        actor,
        project.id,
        parent.id,
        { title: "Second item" },
      );
      await service.moveChecklistItem(
        actor,
        project.id,
        parent.id,
        second.id,
        first.id,
      );
      await service.updateChecklistItem(
        actor,
        project.id,
        parent.id,
        second.id,
        {
          done: true,
        },
      );
      expect(await service.getTask(actor, project.id, parent.id)).toMatchObject(
        {
          progress: 50,
        },
      );

      const child = await service.convertChecklistItemToTask(
        actor,
        project.id,
        parent.id,
        first.id,
      );
      const convertedBack = await service.convertTaskToChecklistItem(
        actor,
        project.id,
        parent.id,
        child.id,
      );
      expect(convertedBack).toMatchObject({
        title: "First item",
        done: false,
      });
      expect(
        await tx.task.findUniqueOrThrow({ where: { id: child.id } }),
      ).toMatchObject({
        deletedAt: expect.any(Date),
      });
      expect(
        await service.listChecklist(actor, project.id, parent.id),
      ).toHaveLength(2);
    });
  });

  it("auto-reschedules finish_start on workdays only when explicitly requested", async () => {
    await inRollback(async (tx) => {
      const { actor, project, user } = await fixtures(tx);
      await tx.project.update({
        where: { id: project.id },
        data: {
          workCalendar: { weeklyOff: [0, 6], holidays: [] },
        },
      });
      const service = serviceFor(tx);
      const predecessor = await createTask(
        tx,
        project.id,
        user.id,
        "Predecessor",
      );
      await tx.task.update({
        where: { id: predecessor.id },
        data: {
          startDate: new Date("2027-01-07T00:00:00.000Z"),
          dueDate: new Date("2027-01-08T00:00:00.000Z"),
        },
      });
      const successor = await createTask(tx, project.id, user.id, "Successor");
      await tx.task.update({
        where: { id: successor.id },
        data: {
          startDate: new Date("2027-01-04T00:00:00.000Z"),
          dueDate: new Date("2027-01-06T00:00:00.000Z"),
          durationDays: 3,
        },
      });
      await service.createDependency(actor, project.id, successor.id, {
        predecessorId: predecessor.id,
        type: DependencyType.finish_start,
        lagDays: 1,
        autoReschedule: true,
      });
      expect(
        await tx.task.findUniqueOrThrow({ where: { id: successor.id } }),
      ).toMatchObject({
        startDate: new Date("2027-01-12T00:00:00.000Z"),
        dueDate: new Date("2027-01-14T00:00:00.000Z"),
        durationDays: 3,
        version: successor.version + 1,
      });

      const noShift = await createTask(
        tx,
        project.id,
        user.id,
        "No automatic shift",
      );
      await tx.task.update({
        where: { id: noShift.id },
        data: { startDate: new Date("2027-01-04T00:00:00.000Z") },
      });
      await service.createDependency(actor, project.id, noShift.id, {
        predecessorId: predecessor.id,
      });
      expect(
        await tx.task.findUniqueOrThrow({ where: { id: noShift.id } }),
      ).toMatchObject({
        startDate: new Date("2027-01-04T00:00:00.000Z"),
      });
      await expect(
        service.createDependency(actor, project.id, noShift.id, {
          predecessorId: successor.id,
          type: DependencyType.overlap,
          autoReschedule: true,
        }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });
});
