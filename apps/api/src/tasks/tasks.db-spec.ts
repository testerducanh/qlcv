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
    ForbiddenException: class extends HttpError {
      constructor(message = "Forbidden") {
        super(message, 403);
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
  AssignmentLevel,
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
    taskAssignmentEvent: tx.taskAssignmentEvent,
    taskCollaborator: tx.taskCollaborator,
    assignmentExtensionRequest: tx.assignmentExtensionRequest,
    projectMember: tx.projectMember,
    checklistItem: tx.checklistItem,
    taskDependency: tx.taskDependency,
    taskRecurrence: tx.taskRecurrence,
    taskLabel: tx.taskLabel,
    label: tx.label,
    attachment: tx.attachment,
    comment: tx.comment,
    meetingItem: tx.meetingItem,
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
  it("validates custom task fields against the project definition", async () => {
    await inRollback(async (tx) => {
      const { actor, project } = await fixtures(tx);
      await tx.project.update({
        where: { id: project.id },
        data: {
          customFieldDefinitions: [
            {
              key: "permit_number",
              label: "Số hồ sơ",
              type: "text",
              required: true,
            },
            {
              key: "authority",
              label: "Cơ quan giải quyết",
              type: "select",
              required: false,
              options: ["Cơ quan A", "Cơ quan B"],
            },
            {
              key: "contact_person",
              label: "Người phụ trách",
              type: "user",
              required: false,
            },
            {
              key: "reference_url",
              label: "Đường dẫn",
              type: "url",
              required: false,
            },
            {
              key: "legacy_ref",
              label: "Trường cũ",
              type: "text",
              required: true,
              hidden: true,
            },
          ],
        },
      });
      const service = serviceFor(tx);
      const created = await service.createTask(actor, project.id, {
        title: "Complete field values",
        customFields: {
          permit_number: "HS-001",
          authority: "Cơ quan A",
          contact_person: actor.id,
          reference_url: "https://example.test/record",
        },
      });
      expect(created.customFields).toEqual({
        permit_number: "HS-001",
        authority: "Cơ quan A",
        contact_person: actor.id,
        reference_url: "https://example.test/record",
      });
      for (let index = 0; index < 9; index += 1) {
        await service.createTask(actor, project.id, {
          title: `Field filter task ${index + 1}`,
          customFields: {
            permit_number: `HS-${String(index + 2).padStart(3, "0")}`,
            authority: index < 4 ? "Cơ quan A" : "Cơ quan B",
          },
        });
      }
      const filtered = await service.listTasks(actor, project.id, {
        page: 1,
        pageSize: 50,
        customFieldKey: "authority",
        customFieldValue: "Cơ quan A",
      });
      expect(filtered.total).toBe(5);
      expect(filtered.items).toHaveLength(5);
      await expect(
        service.listTasks(actor, project.id, {
          page: 1,
          pageSize: 50,
          customFieldKey: "authority",
          customFieldValue: "unknown",
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        service.createTask(actor, project.id, {
          title: "Invalid option",
          customFields: {
            permit_number: "HS-002",
            authority: "not-an-option",
          },
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        service.createTask(actor, project.id, {
          title: "Unknown project member",
          customFields: {
            permit_number: "HS-003",
            contact_person: randomUUID(),
          },
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        service.createTask(actor, project.id, {
          title: "Invalid URL",
          customFields: {
            permit_number: "HS-004",
            reference_url: "javascript:alert(1)",
          },
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        service.createTask(actor, project.id, {
          title: "Missing required value",
          customFields: { authority: "Cơ quan A" },
        }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

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
          startDate: new Date(
            `${new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)}T00:00:00.000Z`,
          ),
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
          durationDays: 2,
          progress: 50,
        },
      });
      const successor = await createTask(tx, project.id, user.id, "Successor");
      await tx.task.update({
        where: { id: successor.id },
        data: {
          startDate: new Date("2027-01-04T00:00:00.000Z"),
          dueDate: new Date("2027-01-06T00:00:00.000Z"),
          durationDays: 3,
          progress: 50,
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
      const noShiftLink = await tx.taskDependency.findFirstOrThrow({
        where: { predecessorId: predecessor.id, successorId: noShift.id },
      });
      await expect(
        service.updateDependency(
          actor,
          project.id,
          noShift.id,
          noShiftLink.id,
          { lagDays: -1 },
        ),
      ).resolves.toMatchObject({ lagDays: -1 });
      await expect(
        service.createDependency(actor, project.id, noShift.id, {
          predecessorId: successor.id,
          type: DependencyType.overlap,
          autoReschedule: true,
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        service.createDependency(actor, project.id, noShift.id, {
          predecessorId: predecessor.id,
          lagDays: -1,
          autoReschedule: true,
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        service.criticalPath(actor, project.id),
      ).rejects.toMatchObject({ status: 400 });
      await tx.project.update({
        where: { id: project.id },
        data: { criticalPathEnabled: true },
      });
      await expect(
        service.criticalPath(actor, project.id),
      ).resolves.toMatchObject({
        actualProgressPercent: 50,
        progressForecastFinishDate: expect.any(String),
        progressForecastMethod: expect.stringContaining("thời lượng việc"),
        entries: expect.arrayContaining([
          expect.objectContaining({ title: "Predecessor" }),
          expect.objectContaining({ title: "Successor" }),
        ]),
      });
    });
  });

  it("previews, applies, and safely undoes a chain of automatic schedule changes", async () => {
    await inRollback(async (tx) => {
      const { actor, project, user } = await fixtures(tx);
      await tx.project.update({
        where: { id: project.id },
        data: {
          workCalendar: { weeklyOff: [0, 6], holidays: [] },
          autoRescheduleEnabled: true,
        },
      });
      const service = serviceFor(tx);
      const first = await createTask(tx, project.id, user.id, "First");
      const second = await createTask(tx, project.id, user.id, "Second");
      const third = await createTask(tx, project.id, user.id, "Third");
      await tx.task.update({
        where: { id: first.id },
        data: {
          startDate: new Date("2027-01-04T00:00:00.000Z"),
          dueDate: new Date("2027-01-05T00:00:00.000Z"),
          durationDays: 2,
        },
      });
      await tx.task.update({
        where: { id: second.id },
        data: {
          startDate: new Date("2027-01-06T00:00:00.000Z"),
          dueDate: new Date("2027-01-07T00:00:00.000Z"),
          durationDays: 2,
        },
      });
      await tx.task.update({
        where: { id: third.id },
        data: {
          startDate: new Date("2027-01-08T00:00:00.000Z"),
          dueDate: new Date("2027-01-08T00:00:00.000Z"),
          durationDays: 1,
        },
      });
      await tx.taskDependency.createMany({
        data: [
          {
            predecessorId: first.id,
            successorId: second.id,
            autoReschedule: true,
          },
          {
            predecessorId: second.id,
            successorId: third.id,
            autoReschedule: true,
          },
        ],
      });
      const currentFirst = await tx.task.findUniqueOrThrow({
        where: { id: first.id },
      });
      const preview = await service.previewAutoReschedule(
        actor,
        project.id,
        first.id,
        { version: currentFirst.version, dueDate: "2027-01-08" },
      );
      expect(preview.changes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: "First",
            dueDate: "2027-01-08",
          }),
          expect.objectContaining({
            title: "Second",
            startDate: "2027-01-11",
            dueDate: "2027-01-12",
          }),
          expect.objectContaining({
            title: "Third",
            startDate: "2027-01-13",
            dueDate: "2027-01-13",
          }),
        ]),
      );
      const applied = await service.applyAutoReschedule(
        actor,
        project.id,
        preview.previewToken,
      );
      expect(applied.updated).toBe(3);
      await expect(
        tx.task.findUniqueOrThrow({ where: { id: third.id } }),
      ).resolves.toMatchObject({
        startDate: new Date("2027-01-13T00:00:00.000Z"),
        dueDate: new Date("2027-01-13T00:00:00.000Z"),
      });
      await expect(
        service.undoAutoReschedule(actor, project.id, applied.undoToken),
      ).resolves.toEqual({ restored: 3 });
      await expect(
        tx.task.findUniqueOrThrow({ where: { id: third.id } }),
      ).resolves.toMatchObject({
        startDate: new Date("2027-01-08T00:00:00.000Z"),
        dueDate: new Date("2027-01-08T00:00:00.000Z"),
      });
    });
  });

  it("allows only one project member to claim a group assignment", async () => {
    await inRollback(async (tx) => {
      const { actor, project, user } = await fixtures(tx);
      const secondUser = await tx.user.create({
        data: {
          organizationId: actor.organizationId,
          branchId: actor.branchId!,
          email: `task-claim-${randomUUID()}@example.test`,
          name: "Second claimant",
          status: "active",
        },
      });
      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId: secondUser.id,
          role: ProjectRole.member,
        },
      });
      const secondActor: AuthenticatedUser = {
        ...actor,
        id: secondUser.id,
        email: secondUser.email,
        name: secondUser.name,
      };
      const task = await createTask(tx, project.id, user.id, "Group task");
      await tx.task.update({
        where: { id: task.id },
        data: {
          assignmentLevel: AssignmentLevel.standard,
          assignmentStatus: "draft",
        },
      });
      const service = serviceFor(tx);
      const queued = await service.assignTaskToGroup(
        actor,
        project.id,
        task.id,
        { version: task.version, dueDate: "2027-01-20" },
      );

      const results = await Promise.allSettled([
        service.claimGroupAssignment(actor, project.id, task.id, {
          version: queued.version,
        }),
        service.claimGroupAssignment(secondActor, project.id, task.id, {
          version: queued.version,
        }),
      ]);

      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const failure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      expect(failure?.reason).toMatchObject({
        status: 409,
        message:
          "Thành viên khác đã nhận việc trước bạn; hãy tải lại danh sách",
      });
      const current = await tx.task.findUniqueOrThrow({
        where: { id: task.id },
      });
      expect(current).toMatchObject({
        assignmentStatus: "assigned",
        isGroupAssignment: false,
        assigneeId: expect.any(String),
      });
      await expect(
        tx.taskAssignmentEvent.findMany({
          where: { taskId: task.id },
          select: { action: true },
          orderBy: { createdAt: "asc" },
        }),
      ).resolves.toEqual([
        { action: "assigned_to_group" },
        { action: "claimed_from_group" },
      ]);
    });
  });

  it("keeps the existing assignee until the proposed assignee accepts", async () => {
    await inRollback(async (tx) => {
      const { actor, project, user } = await fixtures(tx);
      const oldAssignee = await tx.user.create({
        data: {
          organizationId: actor.organizationId,
          branchId: actor.branchId!,
          email: `task-old-assignee-${randomUUID()}@example.test`,
          name: "Current assignee",
          status: "active",
        },
      });
      const newAssignee = await tx.user.create({
        data: {
          organizationId: actor.organizationId,
          branchId: actor.branchId!,
          email: `task-new-assignee-${randomUUID()}@example.test`,
          name: "Proposed assignee",
          status: "active",
        },
      });
      await tx.projectMember.createMany({
        data: [oldAssignee, newAssignee].map((member) => ({
          projectId: project.id,
          userId: member.id,
          role: ProjectRole.member,
        })),
      });
      const newActor: AuthenticatedUser = {
        ...actor,
        id: newAssignee.id,
        email: newAssignee.email,
        name: newAssignee.name,
      };
      const task = await createTask(tx, project.id, user.id, "Transfer task");
      const assigned = await tx.task.update({
        where: { id: task.id },
        data: {
          assignmentLevel: AssignmentLevel.standard,
          assignmentStatus: "assigned",
          assigneeId: oldAssignee.id,
          assignerId: actor.id,
          dueDate: new Date("2027-01-20T00:00:00.000Z"),
        },
      });
      const service = serviceFor(tx);
      const requested = await service.requestTaskReassignment(
        actor,
        project.id,
        task.id,
        {
          version: assigned.version,
          assigneeId: newAssignee.id,
          handoffNote: "Đã bàn giao trạng thái và tài liệu",
        },
      );

      expect(requested).toMatchObject({
        assigneeId: oldAssignee.id,
        pendingAssigneeId: newAssignee.id,
      });
      await expect(
        tx.task.findUniqueOrThrow({ where: { id: task.id } }),
      ).resolves.toMatchObject({
        assigneeId: oldAssignee.id,
        pendingAssigneeId: newAssignee.id,
        handoffNote: "Đã bàn giao trạng thái và tài liệu",
      });

      const accepted = await service.acceptTaskReassignment(
        newActor,
        project.id,
        task.id,
        { version: requested.version },
      );
      expect(accepted).toMatchObject({
        assigneeId: newAssignee.id,
        pendingAssigneeId: null,
        handoffNote: null,
      });
    });
  });

  it("applies an extension only after the reviewer approves it", async () => {
    await inRollback(async (tx) => {
      const { actor, project, user } = await fixtures(tx);
      const assignee = await tx.user.create({
        data: {
          organizationId: actor.organizationId,
          branchId: actor.branchId!,
          email: `task-extension-${randomUUID()}@example.test`,
          name: "Extension requester",
          status: "active",
        },
      });
      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId: assignee.id,
          role: ProjectRole.member,
        },
      });
      const assigneeActor: AuthenticatedUser = {
        ...actor,
        id: assignee.id,
        email: assignee.email,
        name: assignee.name,
      };
      const task = await createTask(tx, project.id, user.id, "Extension task");
      const assigned = await tx.task.update({
        where: { id: task.id },
        data: {
          assignmentLevel: AssignmentLevel.standard,
          assignmentStatus: "in_progress",
          status: "doing",
          assigneeId: assignee.id,
          assignerId: actor.id,
          reviewerId: actor.id,
          dueDate: new Date("2027-01-20T00:00:00.000Z"),
        },
      });
      const service = serviceFor(tx);
      const request = await service.requestAssignmentExtension(
        assigneeActor,
        project.id,
        task.id,
        {
          version: assigned.version,
          requestedDueDate: "2027-01-25",
          reason: "Chờ đơn vị phối hợp bàn giao đầu vào",
        },
      );
      await expect(
        tx.task.findUniqueOrThrow({ where: { id: task.id } }),
      ).resolves.toMatchObject({
        dueDate: new Date("2027-01-20T00:00:00.000Z"),
        version: request.taskVersion,
      });

      const decision = await service.decideAssignmentExtension(
        actor,
        project.id,
        task.id,
        request.id,
        { version: request.taskVersion, approved: true },
      );
      expect(decision.status).toBe("approved");
      await expect(
        tx.task.findUniqueOrThrow({ where: { id: task.id } }),
      ).resolves.toMatchObject({
        dueDate: new Date("2027-01-25T00:00:00.000Z"),
        version: request.taskVersion + 1,
      });
    });
  });

  it("imports a task tree only after preview and can undo the unchanged import", async () => {
    await inRollback(async (tx) => {
      const { actor, project } = await fixtures(tx);
      const service = serviceFor(tx);
      const result = await service.importTasks(actor, project.id, [
        {
          title: "Chuẩn bị",
          depth: 0,
          startDate: "2026-11-02",
          durationDays: 3,
          dueDate: "2026-11-04",
          description: "Giai đoạn đầu",
          checklist: [],
        },
        {
          title: "Lập hồ sơ",
          depth: 1,
          startDate: "2026-11-03",
          durationDays: 1,
          dueDate: "2026-11-03",
          description: null,
          checklist: ["Biên bản", "Bản vẽ"],
        },
      ]);
      const imported = await tx.task.findMany({
        where: {
          projectId: project.id,
          title: { in: ["Chuẩn bị", "Lập hồ sơ"] },
        },
        orderBy: { depth: "asc" },
        include: { checklistItems: true },
      });
      expect(result.created).toBe(2);
      expect(imported).toMatchObject([
        { title: "Chuẩn bị", type: "group", depth: 1 },
        {
          title: "Lập hồ sơ",
          type: "task",
          depth: 2,
          checklistItems: [{ title: "Biên bản" }, { title: "Bản vẽ" }],
        },
      ]);

      await expect(
        service.undoImportedTasks(actor, project.id, result.undoToken),
      ).resolves.toEqual({ deleted: 2 });
      await expect(
        tx.task.count({ where: { projectId: project.id } }),
      ).resolves.toBe(0);
    });
  });

  it("denies task imports to project viewers", async () => {
    await inRollback(async (tx) => {
      const { actor, project } = await fixtures(tx);
      const viewer = await tx.user.create({
        data: {
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          email: `viewer-${randomUUID()}@example.test`,
          name: "Read-only viewer",
          status: "active",
        },
      });
      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId: viewer.id,
          role: ProjectRole.viewer,
        },
      });
      const viewerActor: AuthenticatedUser = {
        ...actor,
        id: viewer.id,
        email: viewer.email,
        name: viewer.name,
      };

      await expect(
        serviceFor(tx).importTasks(viewerActor, project.id, [
          { title: "Not allowed", depth: 0, checklist: [] },
        ]),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        tx.task.count({ where: { projectId: project.id } }),
      ).resolves.toBe(0);
    });
  });

  it("creates independent recurring checklists and edits only this and later periods", async () => {
    await inRollback(async (tx) => {
      const { actor, project } = await fixtures(tx);
      await tx.project.update({
        where: { id: project.id },
        data: {
          workCalendar: { weeklyOff: [0, 6], holidays: ["2026-11-09"] },
        },
      });
      const service = serviceFor(tx);
      const result = await service.createRecurringTasks(actor, project.id, {
        title: "Kiểm tra an toàn",
        startDate: "2026-11-02",
        count: 4,
        checklist: ["Kiểm tra thiết bị"],
        rule: { frequency: "weekly", interval: 1, weekdays: [1] },
      });
      expect(
        result.tasks.map((task) => task.dueDate.toISOString().slice(0, 10)),
      ).toEqual(["2026-11-02", "2026-11-10", "2026-11-16", "2026-11-23"]);

      await service.updateRecurrenceFuture(
        actor,
        project.id,
        result.tasks[1].id,
        { title: "Kiểm tra an toàn nâng cấp", checklist: ["Đã hiệu chuẩn"] },
      );
      const occurrences = await tx.task.findMany({
        where: { recurrenceSeriesId: result.seriesId },
        orderBy: { recurrenceIndex: "asc" },
        include: { checklistItems: true },
      });
      expect(occurrences.map((task) => task.title)).toEqual([
        "Kiểm tra an toàn",
        "Kiểm tra an toàn nâng cấp",
        "Kiểm tra an toàn nâng cấp",
        "Kiểm tra an toàn nâng cấp",
      ]);
      expect(occurrences[0].checklistItems[0].title).toBe("Kiểm tra thiết bị");
      expect(occurrences[1].checklistItems[0].title).toBe("Đã hiệu chuẩn");
      expect(occurrences[1].checklistItems[0].id).not.toBe(
        occurrences[2].checklistItems[0].id,
      );
    });
  });
});
