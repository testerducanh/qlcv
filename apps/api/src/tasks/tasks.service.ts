import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  AssignmentEvidenceRequirement,
  AssignmentLevel,
  AssignmentStatus,
  Confidentiality,
  DependencyType,
  Prisma,
  ProjectRole,
  TaskPriority,
  TaskStatus,
  TaskType,
} from "@prisma/client";
import type Redis from "ioredis";
import {
  addWorkingDays,
  calculateCountProgress,
  calculateWorkdayProgress,
  countWorkingDays,
  type ProgressMode,
  type WorkCalendar,
} from "@qlcv/shared";
import type { AuthenticatedUser } from "../auth/auth.service";
import type { Env } from "../config/env";
import { ENV, PrismaService, REDIS, S3 } from "../infra/infra.module";
import {
  permissionVisibility,
  type PermissionVisibility,
  type TaskPermissionResource,
} from "../permissions/permissions";
import {
  positionAt,
  positionBetween,
  PositionSpaceExhaustedError,
} from "./fractional-position";
import {
  parsePastedTaskTree,
  PastedTaskTreeError,
  type PastedTask,
} from "./task-paste";
import { INTERNAL_EVENTS } from "../p16/internal-events.module";
import {
  AssignmentTransitionError,
  assignmentStatusFromTaskStatus,
  taskStatusFromAssignmentStatus,
  transitionAssignment,
  type AssignmentAction,
  type AssignmentActorRole,
} from "../assignments/assignment.machine";

type Actor = AuthenticatedUser;
type PermissionAction =
  "task.view" | "task.write" | "task.assign" | "task.progress" | "task.approve";

const taskContextInclude = {
  project: {
    include: {
      branch: { select: { organizationId: true, id: true } },
      members: { select: { userId: true, role: true } },
      assignmentLevel: true,
      strictEvidenceRequirement: true,
    },
  },
  creator: { select: { departmentId: true } },
  assignee: { select: { departmentId: true } },
  checklistItems: { orderBy: { position: "asc" as const } },
  predecessorLinks: {
    include: {
      predecessor: { select: { id: true, title: true, status: true } },
    },
  },
};

type TaskContext = Prisma.TaskGetPayload<{
  include: typeof taskContextInclude;
}>;

interface TaskPermissionContext {
  creatorId: string;
  assigneeId: string | null;
  reviewerId: string | null;
  creator: { departmentId: string | null };
  assignee: { departmentId: string | null } | null;
  project: {
    id: string;
    branchId: string;
    confidentiality: Confidentiality;
    branch: { organizationId: string };
    members: Array<{ userId: string; role: ProjectRole }>;
  };
}

interface TaskRow {
  id: string;
  projectId: string;
  parentId: string | null;
  type: TaskType;
  position: string;
  depth: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  blockedReason: string | null;
  priority: TaskPriority;
  startDate: Date | null;
  durationDays: number | null;
  dueDate: Date | null;
  completedAt: Date | null;
  progress: number;
  assigneeId: string | null;
  creatorId: string;
  customFields: Prisma.JsonValue;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  childCount: number;
  childProgressSum: number;
  childStartDate: Date | null;
  childDueDate: Date | null;
  checklistTotal: number;
  checklistDone: number;
  blockedByIncomplete: boolean;
  creatorDepartmentId: string | null;
  assigneeDepartmentId: string | null;
  totalCount: number;
}

interface TaskListItem {
  title: string;
  progress: number;
  [key: string]: unknown;
}

function dateValue(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function workCalendar(value: Prisma.JsonValue): WorkCalendar {
  const parsed = value as Partial<WorkCalendar>;
  return {
    weeklyOff: Array.isArray(parsed.weeklyOff) ? parsed.weeklyOff : [0],
    holidays: Array.isArray(parsed.holidays) ? parsed.holidays : [],
  };
}

function snapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function taskResource(
  actor: Actor,
  project: {
    id: string;
    branchId: string;
    confidentiality: Confidentiality;
    branch: { organizationId: string };
    members: Array<{ userId: string; role: ProjectRole }>;
  },
  task: {
    creatorId: string;
    assigneeId: string | null;
    reviewerId?: string | null;
    creatorDepartmentId?: string | null;
    assigneeDepartmentId?: string | null;
  },
): TaskPermissionResource {
  return {
    type: "task",
    organizationId: project.branch.organizationId,
    projectId: project.id,
    branchId: project.branchId,
    confidentiality: project.confidentiality,
    projectRole: project.members.find((member) => member.userId === actor.id)
      ?.role,
    creatorId: task.creatorId,
    assigneeId: task.assigneeId,
    reviewerId: task.reviewerId,
    departmentIds: [task.creatorDepartmentId, task.assigneeDepartmentId].filter(
      (id): id is string => id !== null && id !== undefined,
    ),
  };
}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
    @Inject(S3) private readonly s3: S3Client,
    @Inject(INTERNAL_EVENTS) private readonly events?: EventEmitter,
  ) {}

  async listTasks(
    actor: Actor,
    projectId: string,
    input: { page: number; pageSize: number; parentId?: string },
  ) {
    const project = await this.findProject(actor, projectId);
    const membershipRole = project.members[0]?.role;
    if (input.parentId) {
      const parent = await this.findTask(actor, projectId, input.parentId);
      if (this.requirePermission(actor, "task.view", parent) === "limited") {
        return {
          items: [],
          page: input.page,
          pageSize: input.pageSize,
          total: 0,
          role: membershipRole,
        };
      }
    }
    if (
      !membershipRole &&
      !(
        actor.systemRole === "branch_director" &&
        actor.branchId === project.branchId
      ) &&
      !(
        actor.systemRole === "department_head" &&
        actor.managedDepartmentIds.length
      )
    ) {
      throw new NotFoundException();
    }
    const visibilityFilter = this.listVisibilityFilter(actor, project);
    const childVisibilityFilter = this.taskVisibilityFilter(
      actor,
      project,
      "child",
    );
    const predecessorVisibilityFilter = this.taskVisibilityFilter(
      actor,
      project,
      "predecessor",
    );
    const rows = await this.prisma.$queryRaw<TaskRow[]>(Prisma.sql`
      WITH RECURSIVE task_tree AS (
        SELECT
          task.id, task.project_id, task.parent_id, task.type, task.position,
          task.depth, task.title, task.description, task.status, task.blocked_reason,
          task.priority, task.start_date, task.duration_days, task.due_date,
          task.completed_at, task.progress, task.assignee_id, task.creator_id,
          task.custom_fields, task.version, task.created_at, task.updated_at,
          task.deleted_at, ARRAY[task.position]::text[] AS path
        FROM "task" AS task
        WHERE task."project_id" = ${projectId}::uuid
          AND task."parent_id" IS NOT DISTINCT FROM ${input.parentId ?? null}::uuid
          AND task."deleted_at" IS NULL
        UNION ALL
        SELECT
          child.id, child.project_id, child.parent_id, child.type, child.position,
          child.depth, child.title, child.description, child.status, child.blocked_reason,
          child.priority, child.start_date, child.duration_days, child.due_date,
          child.completed_at, child.progress, child.assignee_id, child.creator_id,
          child.custom_fields, child.version, child.created_at, child.updated_at,
          child.deleted_at, tree.path || child."position"
        FROM "task" AS child
        INNER JOIN task_tree AS tree ON child."parent_id" = tree."id"
        WHERE child."deleted_at" IS NULL
      ),
      visible_candidates AS (
        SELECT tree.*,
          creator."department_id" AS "creatorDepartmentId",
          assignee."department_id" AS "assigneeDepartmentId"
        FROM task_tree AS tree
        JOIN "app_user" AS creator ON creator."id" = tree."creator_id"
        LEFT JOIN "app_user" AS assignee ON assignee."id" = tree."assignee_id"
      ),
      eligible AS (
        SELECT enriched.*, count(*) OVER()::int AS "totalCount"
        FROM visible_candidates AS enriched
        WHERE ${visibilityFilter}
      ),
      paged AS (
        SELECT * FROM eligible
        ORDER BY path
        LIMIT ${input.pageSize}
        OFFSET ${(input.page - 1) * input.pageSize}
      ),
      enriched AS (
        SELECT paged.*,
          (SELECT count(*)::int FROM "task" AS child
           WHERE child."parent_id" = paged."id" AND child."deleted_at" IS NULL
             AND ${childVisibilityFilter}) AS "childCount",
          (SELECT coalesce(sum(
             CASE WHEN child."status" = 'done' THEN 100
                  WHEN checklist.total > 0 THEN round(checklist.done * 100.0 / checklist.total)::int
                  ELSE child."progress" END
           ), 0)::int
           FROM "task" AS child
           LEFT JOIN LATERAL (
             SELECT count(*)::int AS total,
                    count(*) FILTER (WHERE item."done")::int AS done
             FROM "checklist_item" AS item WHERE item."task_id" = child."id"
           ) AS checklist ON true
           WHERE child."parent_id" = paged."id" AND child."deleted_at" IS NULL
             AND ${childVisibilityFilter}
          ) AS "childProgressSum",
          (SELECT min(child."start_date")
           FROM "task" AS child
           WHERE child."parent_id" = paged."id" AND child."deleted_at" IS NULL
             AND ${childVisibilityFilter}
          ) AS "childStartDate",
          (SELECT max(child."due_date")
           FROM "task" AS child
           WHERE child."parent_id" = paged."id" AND child."deleted_at" IS NULL
             AND ${childVisibilityFilter}
          ) AS "childDueDate",
          (SELECT count(*)::int FROM "checklist_item" AS item
           WHERE item."task_id" = paged."id") AS "checklistTotal",
          (SELECT count(*) FILTER (WHERE item."done")::int
           FROM "checklist_item" AS item
           WHERE item."task_id" = paged."id") AS "checklistDone",
          EXISTS (
            SELECT 1 FROM "task_dependency" AS dependency
            JOIN "task" AS predecessor ON predecessor."id" = dependency."predecessor_id"
            WHERE dependency."successor_id" = paged."id"
              AND predecessor."status" <> 'done'
              AND predecessor."deleted_at" IS NULL
              AND ${predecessorVisibilityFilter}
          ) AS "blockedByIncomplete"
        FROM paged
      )
      SELECT * FROM enriched
      ORDER BY path
    `);
    const total =
      rows[0]?.totalCount ??
      (await this.countVisibleTree(
        projectId,
        input.parentId,
        visibilityFilter,
      ));
    const role = membershipRole;
    const calendar = workCalendar(project.workCalendar);
    const labels = project.statusLabels as Record<string, string>;
    const items = rows.flatMap((row): TaskListItem[] => {
      const visibility = permissionVisibility(
        actor,
        "task.view",
        taskResource(actor, project, {
          creatorId: row.creatorId,
          assigneeId: row.assigneeId,
          creatorDepartmentId: row.creatorDepartmentId,
          assigneeDepartmentId: row.assigneeDepartmentId,
        }),
      );
      if (visibility === "none") return [];
      const progress = this.calculateProgress(
        project.progressMode,
        calendar,
        row,
      );
      const dueDate = row.childDueDate ?? row.dueDate;
      if (visibility === "limited") {
        return [{ title: "Việc hạn chế" as const, progress }];
      }
      return [
        {
          id: row.id,
          projectId: row.projectId,
          parentId: row.parentId,
          type: row.type,
          position: row.position,
          depth: row.depth,
          title: row.title,
          description: row.description,
          status: row.status,
          blockedReason: row.blockedReason,
          priority: row.priority,
          startDate: row.childStartDate ?? row.startDate,
          durationDays: row.durationDays,
          dueDate,
          completedAt: row.completedAt,
          assigneeId: row.assigneeId,
          creatorId: row.creatorId,
          customFields: row.customFields,
          version: row.version,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          childCount: row.childCount,
          blockedByIncomplete: row.blockedByIncomplete,
          statusLabel: labels[row.status] ?? row.status,
          progress,
          isOverdue:
            dueDate !== null &&
            row.status !== TaskStatus.done &&
            dueDate < new Date(new Date().setUTCHours(0, 0, 0, 0)),
        },
      ];
    });
    return { items, page: input.page, pageSize: input.pageSize, total, role };
  }

  async getTask(actor: Actor, projectId: string, taskId: string) {
    const task = await this.findTask(actor, projectId, taskId);
    const visibility = this.requirePermission(actor, "task.view", task);
    const project = task.project;
    const children = await this.prisma.task.findMany({
      where: {
        parentId: task.id,
        deletedAt: null,
        ...this.taskVisibilityWhere(actor, project),
      },
      select: {
        id: true,
        status: true,
        progress: true,
        startDate: true,
        dueDate: true,
        checklistItems: { select: { done: true } },
      },
    });
    const childProgressSum = children.reduce((sum, child) => {
      if (child.status === TaskStatus.done) return sum + 100;
      if (child.checklistItems.length) {
        return (
          sum +
          Math.round(
            (child.checklistItems.filter((item) => item.done).length * 100) /
              child.checklistItems.length,
          )
        );
      }
      return sum + child.progress;
    }, 0);
    const progress = this.calculateProgress(
      project.progressMode,
      workCalendar(project.workCalendar),
      {
        ...task,
        childCount: children.length,
        childProgressSum,
        childStartDate: children.reduce<Date | null>(
          (earliest, child) =>
            child.startDate && (!earliest || child.startDate < earliest)
              ? child.startDate
              : earliest,
          null,
        ),
        childDueDate: children.reduce<Date | null>(
          (latest, child) =>
            child.dueDate && (!latest || child.dueDate > latest)
              ? child.dueDate
              : latest,
          null,
        ),
        checklistTotal: task.checklistItems.length,
        checklistDone: task.checklistItems.filter((item) => item.done).length,
      },
    );
    if (visibility === "limited") {
      return { title: "Việc hạn chế" as const, progress };
    }
    const startDate =
      children.reduce<Date | null>(
        (earliest, child) =>
          child.startDate && (!earliest || child.startDate < earliest)
            ? child.startDate
            : earliest,
        null,
      ) ?? task.startDate;
    const dueDate =
      children.reduce<Date | null>(
        (latest, child) =>
          child.dueDate && (!latest || child.dueDate > latest)
            ? child.dueDate
            : latest,
        null,
      ) ?? task.dueDate;
    const predecessorLinks = (
      await Promise.all(
        task.predecessorLinks.map(async (link) => {
          const visible = await this.findVisibleTask(
            actor,
            projectId,
            link.predecessor.id,
          );
          if (!visible) return null;
          if (visible.visibility === "limited") {
            return {
              predecessor: { title: "Việc hạn chế" as const, progress: 0 },
            };
          }
          return link;
        }),
      )
    ).filter((link) => link !== null);
    return {
      id: task.id,
      projectId: task.projectId,
      parentId: task.parentId,
      type: task.type,
      position: task.position,
      depth: task.depth,
      title: task.title,
      description: task.description,
      status: task.status,
      blockedReason: task.blockedReason,
      priority: task.priority,
      durationDays: task.durationDays,
      completedAt: task.completedAt,
      assigneeId: task.assigneeId,
      creatorId: task.creatorId,
      customFields: task.customFields,
      version: task.version,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      deletedAt: task.deletedAt,
      checklistItems: task.checklistItems,
      predecessorLinks,
      progress,
      startDate,
      dueDate,
      statusLabel:
        (project.statusLabels as Record<string, string>)[task.status] ??
        task.status,
      isOverdue:
        dueDate !== null &&
        task.status !== TaskStatus.done &&
        dueDate < new Date(new Date().setUTCHours(0, 0, 0, 0)),
      blockedByIncomplete: predecessorLinks.some(
        (link) =>
          "status" in link.predecessor &&
          link.predecessor.status !== TaskStatus.done,
      ),
    };
  }

  async createTask(
    actor: Actor,
    projectId: string,
    input: {
      title: string;
      parentId?: string | null;
      type?: TaskType;
      description?: string | null;
      priority?: TaskPriority;
      startDate?: string | null;
      durationDays?: number | null;
      dueDate?: string | null;
      assigneeId?: string | null;
      assignmentLevel?: AssignmentLevel;
      reviewerId?: string | null;
      progress?: number;
      customFields?: Prisma.InputJsonValue;
    },
  ) {
    const project = await this.findProject(actor, projectId);
    this.requireProjectPermission(actor, "task.write", project);
    const parent = input.parentId
      ? await this.findTask(actor, projectId, input.parentId)
      : null;
    if (parent) {
      this.requirePermission(actor, "task.write", parent);
      if (parent.type === TaskType.milestone) {
        throw new BadRequestException("Không thể thêm việc con vào mốc");
      }
    }
    if (input.assigneeId)
      await this.requireActiveProjectMember(projectId, input.assigneeId);
    if (input.reviewerId) {
      await this.requireActiveProjectMember(projectId, input.reviewerId);
    }
    const assignmentLevel = input.assignmentLevel ?? project.assignmentLevel;
    const initialAssignmentStatus =
      assignmentLevel === AssignmentLevel.light
        ? null
        : assignmentStatusFromTaskStatus(
            TaskStatus.todo,
            input.assigneeId,
            input.dueDate,
          );
    const reviewerId =
      assignmentLevel === AssignmentLevel.light
        ? null
        : (input.reviewerId ?? actor.id);
    const task = await this.prisma.$transaction(async (tx) => {
      await this.lockSiblingGroups(tx, [
        `${projectId}:${input.parentId ?? "root"}`,
      ]);
      const siblings = await tx.task.findMany({
        where: { projectId, parentId: input.parentId ?? null, deletedAt: null },
        orderBy: { position: "desc" },
        take: 1,
        select: { position: true },
      });
      const position = positionBetween(siblings[0]?.position ?? null, null);
      const created = await tx.task.create({
        data: {
          projectId,
          parentId: input.parentId ?? null,
          type: input.type ?? TaskType.task,
          position,
          title: input.title.trim(),
          description: input.description ?? null,
          priority: input.priority ?? TaskPriority.normal,
          startDate: dateValue(input.startDate),
          durationDays: input.durationDays ?? null,
          dueDate: dateValue(input.dueDate),
          assigneeId: input.assigneeId ?? null,
          assignmentLevel: input.assignmentLevel ?? null,
          assignmentStatus: initialAssignmentStatus,
          reviewerId,
          assignerId:
            assignmentLevel === AssignmentLevel.light ? null : actor.id,
          creatorId: actor.id,
          progress: input.progress ?? 0,
          customFields: input.customFields ?? {},
        },
      });
      await tx.activityLog.create({
        data: this.activity(
          created.id,
          projectId,
          actor.id,
          "task.created",
          undefined,
          created,
        ),
      });
      if (initialAssignmentStatus) {
        await tx.taskAssignmentEvent.create({
          data: {
            projectId,
            taskId: created.id,
            actorId: actor.id,
            action: "task.created",
            toStatus: initialAssignmentStatus,
          },
        });
      }
      return created;
    });
    if (task.assigneeId) {
      this.events?.emit("domain", {
        type: "task.assigned",
        projectId,
        taskId: task.id,
        taskTitle: task.title,
        userId: task.assigneeId,
      });
    }
    return task;
  }

  async pasteTasks(
    actor: Actor,
    projectId: string,
    text: string,
    preview: boolean,
    parentId?: string,
  ) {
    let tree: PastedTask[];
    try {
      tree = parsePastedTaskTree(text);
    } catch (error) {
      if (error instanceof PastedTaskTreeError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    const project = await this.findProject(actor, projectId);
    this.requireProjectPermission(actor, "task.write", project);
    if (parentId) {
      const parent = await this.findTask(actor, projectId, parentId);
      this.requirePermission(actor, "task.write", parent);
      if (parent.type === TaskType.milestone) {
        throw new BadRequestException("Không thể thêm việc con vào mốc");
      }
    }
    if (preview) return tree;

    return this.prisma.$transaction(async (tx) => {
      await this.lockSiblingGroups(tx, [`${projectId}:${parentId ?? "root"}`]);
      const created: Array<{
        id: string;
        title: string;
        parentId: string | null;
      }> = [];
      const createNodes = async (
        nodes: PastedTask[],
        currentParentId: string | null,
      ): Promise<void> => {
        const existing = await tx.task.findMany({
          where: { projectId, parentId: currentParentId, deletedAt: null },
          orderBy: { position: "desc" },
          take: 1,
          select: { position: true },
        });
        let lastPosition = existing[0]?.position ?? null;
        for (const node of nodes) {
          const position = positionBetween(lastPosition, null);
          const task = await tx.task.create({
            data: {
              projectId,
              parentId: currentParentId,
              type: TaskType.task,
              position,
              title: node.title,
              creatorId: actor.id,
            },
            select: { id: true, title: true, parentId: true },
          });
          lastPosition = position;
          created.push(task);
          await createNodes(node.children, task.id);
        }
      };
      await createNodes(tree, parentId ?? null);
      await tx.activityLog.create({
        data: this.activity(
          created[0].id,
          projectId,
          actor.id,
          "task.pasted",
          undefined,
          { count: created.length },
        ),
      });
      return created;
    });
  }

  async updateTask(
    actor: Actor,
    projectId: string,
    taskId: string,
    input: {
      version: number;
      title?: string;
      description?: string | null;
      type?: TaskType;
      status?: TaskStatus;
      blockedReason?: string | null;
      priority?: TaskPriority;
      startDate?: string | null;
      durationDays?: number | null;
      dueDate?: string | null;
      assigneeId?: string | null;
      assignmentLevel?: AssignmentLevel | null;
      reviewerId?: string | null;
      progress?: number;
      customFields?: Prisma.InputJsonValue;
    },
  ) {
    const before = await this.findTask(actor, projectId, taskId);
    const previousAssignmentLevel =
      before.assignmentLevel ?? before.project.assignmentLevel;
    const assignmentLevel =
      input.assignmentLevel === undefined
        ? (before.assignmentLevel ?? before.project.assignmentLevel)
        : (input.assignmentLevel ?? before.project.assignmentLevel);
    const existingAssignmentStatus =
      before.assignmentStatus ??
      assignmentStatusFromTaskStatus(
        before.status,
        before.assigneeId,
        before.dueDate,
      );
    const action: PermissionAction =
      input.assigneeId !== undefined
        ? "task.assign"
        : input.assignmentLevel !== undefined || input.reviewerId !== undefined
          ? "task.assign"
          : input.status !== undefined || input.progress !== undefined
            ? "task.progress"
            : "task.write";
    this.requirePermission(actor, action, before);
    if (
      assignmentLevel !== AssignmentLevel.light &&
      input.status !== undefined
    ) {
      throw new BadRequestException(
        "Hãy dùng chuyển trạng thái giao việc cho dự án mức Chuẩn hoặc Chặt",
      );
    }
    if (input.status === TaskStatus.blocked && !input.blockedReason?.trim()) {
      throw new BadRequestException(
        "Cần nhập lý do khi tạm dừng hoặc chặn việc",
      );
    }
    if (
      input.status === undefined &&
      before.status === TaskStatus.blocked &&
      input.blockedReason !== undefined &&
      !input.blockedReason?.trim()
    ) {
      throw new BadRequestException("Việc bị chặn cần có lý do");
    }
    if (
      assignmentLevel !== AssignmentLevel.light &&
      input.assigneeId !== undefined &&
      input.assigneeId !== before.assigneeId &&
      existingAssignmentStatus !== "draft"
    ) {
      throw new BadRequestException(
        "Chỉ được đổi người nhận trước khi giao; chuyển người nhận sẽ được xử lý ở P2.2",
      );
    }
    if (input.assigneeId)
      await this.requireActiveProjectMember(projectId, input.assigneeId);
    if (input.reviewerId) {
      await this.requireActiveProjectMember(projectId, input.reviewerId);
    }
    const assignmentStatus =
      assignmentLevel === AssignmentLevel.light
        ? null
        : existingAssignmentStatus;
    const assignerId =
      input.assigneeId !== undefined && input.assigneeId !== before.assigneeId
        ? assignmentLevel === AssignmentLevel.light
          ? (before.assignerId ?? null)
          : actor.id
        : (before.assignerId ??
          (assignmentLevel === AssignmentLevel.light
            ? null
            : before.creatorId));
    const reviewerId =
      input.reviewerId === undefined
        ? (before.reviewerId ??
          (assignmentLevel === AssignmentLevel.light
            ? null
            : (assignerId ?? before.creatorId)))
        : (input.reviewerId ?? assignerId ?? before.creatorId);
    if (
      input.type === TaskType.milestone &&
      (await this.prisma.task.count({
        where: { parentId: taskId, deletedAt: null },
      }))
    ) {
      throw new BadRequestException("Không thể đổi việc có việc con thành mốc");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.task.updateMany({
        where: {
          id: taskId,
          projectId,
          version: input.version,
          deletedAt: null,
        },
        data: {
          ...(input.title === undefined ? {} : { title: input.title.trim() }),
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
          ...(input.type === undefined ? {} : { type: input.type }),
          ...(input.status === undefined
            ? {}
            : {
                status: input.status,
                completedAt:
                  input.status === TaskStatus.done ? new Date() : null,
                blockedReason:
                  input.status === TaskStatus.blocked
                    ? input.blockedReason
                    : null,
              }),
          ...(input.status === TaskStatus.blocked &&
          input.blockedReason !== undefined
            ? { blockedReason: input.blockedReason }
            : {}),
          ...(input.status === undefined && input.blockedReason !== undefined
            ? { blockedReason: input.blockedReason }
            : {}),
          ...(input.priority === undefined ? {} : { priority: input.priority }),
          ...(input.startDate === undefined
            ? {}
            : { startDate: dateValue(input.startDate) }),
          ...(input.durationDays === undefined
            ? {}
            : { durationDays: input.durationDays }),
          ...(input.dueDate === undefined
            ? {}
            : { dueDate: dateValue(input.dueDate) }),
          ...(input.assigneeId === undefined
            ? {}
            : { assigneeId: input.assigneeId }),
          ...(input.assignmentLevel === undefined
            ? {}
            : { assignmentLevel: input.assignmentLevel }),
          ...(assignmentLevel === AssignmentLevel.light
            ? input.assignmentLevel !== undefined
              ? { assignmentStatus: null, reviewerId, assignerId }
              : input.reviewerId === undefined
                ? {}
                : { reviewerId }
            : { assignmentStatus, reviewerId, assignerId }),
          ...(input.progress === undefined ? {} : { progress: input.progress }),
          ...(input.customFields === undefined
            ? {}
            : { customFields: input.customFields }),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1)
        await this.throwVersionConflict(projectId, taskId);
      const current = await tx.task.findUniqueOrThrow({
        where: { id: taskId },
      });
      await tx.activityLog.create({
        data: this.activity(
          taskId,
          projectId,
          actor.id,
          "task.updated",
          before,
          current,
        ),
      });
      if (previousAssignmentLevel !== assignmentLevel) {
        await tx.taskAssignmentEvent.create({
          data: {
            projectId,
            taskId,
            actorId: actor.id,
            action: "task_level_changed",
            fromStatus:
              previousAssignmentLevel === AssignmentLevel.light
                ? null
                : (before.assignmentStatus ??
                  assignmentStatusFromTaskStatus(
                    before.status,
                    before.assigneeId,
                    before.dueDate,
                  )),
            toStatus:
              assignmentLevel === AssignmentLevel.light
                ? null
                : assignmentStatus,
          },
        });
      }
      return current;
    });
    if (
      input.assigneeId !== undefined &&
      input.assigneeId !== before.assigneeId &&
      updated.assigneeId
    ) {
      this.events?.emit("domain", {
        type: "task.assigned",
        projectId,
        taskId,
        taskTitle: updated.title,
        userId: updated.assigneeId,
      });
    }
    if (input.status !== undefined && input.status !== before.status) {
      this.events?.emit("domain", {
        type: "task.status_changed",
        projectId,
        taskId,
        taskTitle: updated.title,
        creatorId: updated.creatorId,
        status: updated.status,
      });
    }
    return updated;
  }

  async transitionAssignment(
    actor: Actor,
    projectId: string,
    taskId: string,
    input: {
      version: number;
      action: AssignmentAction;
      reason?: string;
      evidenceNote?: string;
    },
  ) {
    const task = await this.findTask(actor, projectId, taskId);
    this.requirePermission(actor, "task.view", task);
    const level = task.assignmentLevel ?? task.project.assignmentLevel;
    if (level === AssignmentLevel.light) {
      throw new BadRequestException(
        "Dự án đang dùng mức giao việc Nhẹ; không áp dụng luồng nhận và duyệt",
      );
    }
    const role: AssignmentActorRole =
      input.action === "assign" || input.action === "reassign"
        ? "assigner"
        : input.action === "approve" || input.action === "return"
          ? "reviewer"
          : "assignee";
    const roleUserId =
      role === "assigner"
        ? (task.assignerId ?? task.creatorId)
        : role === "reviewer"
          ? (task.reviewerId ?? task.creatorId)
          : task.assigneeId;
    if (roleUserId !== actor.id) throw new ForbiddenException();

    const permission: PermissionAction =
      role === "assigner"
        ? "task.assign"
        : role === "reviewer"
          ? "task.approve"
          : "task.progress";
    this.requirePermission(actor, permission, task);

    const currentStatus =
      task.assignmentStatus ??
      assignmentStatusFromTaskStatus(
        task.status,
        task.assigneeId,
        task.dueDate,
      );
    const attachmentCount =
      input.action === "submit" && level === AssignmentLevel.strict
        ? await this.prisma.attachment.count({
            where: {
              taskId,
              deletedAt: null,
              confirmedAt: { not: null },
              isCurrent: true,
            },
          })
        : 0;
    let nextStatus: AssignmentStatus;
    try {
      nextStatus = transitionAssignment({
        level,
        from: currentStatus,
        action: input.action,
        actorRole: role,
        reason: input.reason,
        assigneeId: task.assigneeId,
        dueDate: task.dueDate,
        evidenceRequirement: task.project
          .strictEvidenceRequirement as AssignmentEvidenceRequirement,
        attachmentCount,
        evidenceNote: input.evidenceNote,
        actorId: actor.id,
        assigneeUserId: task.assigneeId,
      });
    } catch (error) {
      if (!(error instanceof AssignmentTransitionError)) throw error;
      const messages: Record<AssignmentTransitionError["code"], string> = {
        level_requires_workflow: "Mức Nhẹ không có máy trạng thái giao việc",
        invalid_transition:
          "Không thể thực hiện thao tác ở trạng thái hiện tại",
        reason_required: "Cần nhập lý do cho thao tác này",
        assignment_incomplete: "Cần chọn người nhận và hạn trước khi giao việc",
        evidence_required: "Cần nộp bằng chứng theo cấu hình của dự án",
        self_approval: "Người nhận không thể tự duyệt kết quả của mình",
      };
      if (error.code === "self_approval") {
        throw new ForbiddenException(messages[error.code]);
      }
      throw new BadRequestException(messages[error.code]);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.updateMany({
        where: {
          id: taskId,
          projectId,
          version: input.version,
          deletedAt: null,
        },
        data: {
          assignmentStatus: nextStatus,
          status: taskStatusFromAssignmentStatus(nextStatus),
          completedAt: nextStatus === "done" ? new Date() : null,
          blockedReason: nextStatus === "on_hold" ? input.reason?.trim() : null,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1)
        await this.throwVersionConflict(projectId, taskId);
      const current = await tx.task.findUniqueOrThrow({
        where: { id: taskId },
      });
      await tx.taskAssignmentEvent.create({
        data: {
          projectId,
          taskId,
          actorId: actor.id,
          action: input.action,
          fromStatus: currentStatus,
          toStatus: nextStatus,
          reason: input.reason?.trim() || null,
          evidenceNote: input.evidenceNote?.trim() || null,
        },
      });
      await tx.activityLog.create({
        data: this.activity(
          taskId,
          projectId,
          actor.id,
          `assignment.${input.action}`,
          { status: currentStatus },
          { status: nextStatus, reason: input.reason?.trim() || null },
        ),
      });
      return current;
    });
  }

  async moveChecklistItem(
    actor: Actor,
    projectId: string,
    taskId: string,
    itemId: string,
    beforeItemId?: string,
  ) {
    const task = await this.findTask(actor, projectId, taskId);
    this.requirePermission(actor, "task.write", task);
    return this.prisma.$transaction(async (tx) => {
      await this.lockSiblingGroups(tx, [`checklist:${taskId}`]);
      const items = await tx.checklistItem.findMany({
        where: { taskId },
        orderBy: { position: "asc" },
        select: { id: true, position: true },
      });
      if (!items.some((item) => item.id === itemId))
        throw new NotFoundException();
      const remaining = items.filter((item) => item.id !== itemId);
      const targetIndex = beforeItemId
        ? remaining.findIndex((item) => item.id === beforeItemId)
        : remaining.length;
      if (beforeItemId && targetIndex < 0) {
        throw new BadRequestException("Mục đích không thuộc cùng checklist");
      }
      let position: string;
      try {
        position = positionBetween(
          remaining[targetIndex - 1]?.position ?? null,
          remaining[targetIndex]?.position ?? null,
        );
      } catch (error) {
        if (!(error instanceof PositionSpaceExhaustedError)) throw error;
        const finalPositions = new Set(
          remaining.map((_, index) => positionAt(index)),
        );
        const temporary = this.temporaryPositions(
          remaining.length + 1,
          new Set([...items.map((item) => item.position), ...finalPositions]),
        );
        const before = await tx.checklistItem.findUniqueOrThrow({
          where: { id: itemId },
        });
        await tx.checklistItem.update({
          where: { id: itemId },
          data: { position: temporary[0] },
        });
        for (const [index, item] of remaining.entries()) {
          await tx.checklistItem.update({
            where: { id: item.id },
            data: { position: temporary[index + 1] },
          });
          item.position = temporary[index + 1];
        }
        for (const [index, item] of remaining.entries()) {
          await tx.checklistItem.update({
            where: { id: item.id },
            data: { position: positionAt(index) },
          });
          item.position = positionAt(index);
        }
        position = positionBetween(
          remaining[targetIndex - 1]?.position ?? null,
          remaining[targetIndex]?.position ?? null,
        );
        const updated = await tx.checklistItem.update({
          where: { id: itemId },
          data: { position },
        });
        await tx.activityLog.create({
          data: this.activity(
            taskId,
            projectId,
            actor.id,
            "checklist.moved",
            before,
            updated,
          ),
        });
        return updated;
      }
      const before = await tx.checklistItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      const updated = await tx.checklistItem.update({
        where: { id: itemId },
        data: { position },
      });
      await tx.activityLog.create({
        data: this.activity(
          taskId,
          projectId,
          actor.id,
          "checklist.moved",
          before,
          updated,
        ),
      });
      return updated;
    });
  }

  async moveTask(
    actor: Actor,
    projectId: string,
    taskId: string,
    input: { version: number; parentId: string | null; beforeTaskId?: string },
  ) {
    const task = await this.findTask(actor, projectId, taskId);
    this.requirePermission(actor, "task.write", task);
    if (input.parentId) {
      const parent = await this.findTask(actor, projectId, input.parentId);
      this.requirePermission(actor, "task.write", parent);
      if (parent.id === task.id)
        throw new BadRequestException("Không thể tự làm cha của việc");
      if (parent.type === TaskType.milestone) {
        throw new BadRequestException("Không thể thêm việc con vào mốc");
      }
    }
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        await this.lockSiblingGroups(tx, [
          `${projectId}:${task.parentId ?? "root"}`,
          `${projectId}:${input.parentId ?? "root"}`,
        ]);
        const siblings = await tx.task.findMany({
          where: {
            projectId,
            parentId: input.parentId,
            deletedAt: null,
            id: { not: taskId },
          },
          orderBy: { position: "asc" },
          select: { id: true, position: true },
        });
        const insertionIndex = input.beforeTaskId
          ? siblings.findIndex((sibling) => sibling.id === input.beforeTaskId)
          : siblings.length;
        if (input.beforeTaskId && insertionIndex < 0) {
          throw new BadRequestException("Việc đích không thuộc cùng nhóm");
        }
        let position: string;
        try {
          position = positionBetween(
            siblings[insertionIndex - 1]?.position ?? null,
            siblings[insertionIndex]?.position ?? null,
          );
        } catch (error) {
          if (!(error instanceof PositionSpaceExhaustedError)) throw error;
          const finalPositions = new Set(
            siblings.map((_, index) => positionAt(index)),
          );
          const temporary = this.temporaryPositions(
            siblings.length + 1,
            new Set([
              ...siblings.map((sibling) => sibling.position),
              task.position,
              ...finalPositions,
            ]),
          );
          await tx.task.update({
            where: { id: taskId },
            data: { parentId: input.parentId, position: temporary[0] },
          });
          for (const [index, sibling] of siblings.entries()) {
            await tx.task.update({
              where: { id: sibling.id },
              data: { position: temporary[index + 1] },
            });
            sibling.position = temporary[index + 1];
          }
          for (const [index, sibling] of siblings.entries()) {
            await tx.task.update({
              where: { id: sibling.id },
              data: { position: positionAt(index) },
            });
            sibling.position = positionAt(index);
          }
          position = positionBetween(
            siblings[insertionIndex - 1]?.position ?? null,
            siblings[insertionIndex]?.position ?? null,
          );
        }
        const changed = await tx.task.updateMany({
          where: {
            id: taskId,
            version: input.version,
            projectId,
            deletedAt: null,
          },
          data: {
            parentId: input.parentId,
            position,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1)
          await this.throwVersionConflict(projectId, taskId);
        const current = await tx.task.findUniqueOrThrow({
          where: { id: taskId },
        });
        await tx.activityLog.create({
          data: this.activity(
            taskId,
            projectId,
            actor.id,
            "task.moved",
            task,
            current,
          ),
        });
        return current;
      });
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("QLCV_TASK_CYCLE")) {
        throw new BadRequestException(
          "Không thể chuyển việc vào chính cây con của nó",
        );
      }
      if (message.includes("QLCV_TASK_DEPTH")) {
        throw new BadRequestException("Cây việc không được vượt quá 5 cấp");
      }
      if (message.includes("QLCV_TASK_PROJECT")) {
        throw new BadRequestException("Việc cha phải thuộc cùng dự án");
      }
      throw error;
    }
  }

  async cloneTask(
    actor: Actor,
    projectId: string,
    taskId: string,
    options: { includeFiles?: boolean },
  ) {
    const source = await this.findTask(actor, projectId, taskId);
    this.requirePermission(actor, "task.write", source);
    if (source.parentId) {
      const sourceParent = await this.findTask(
        actor,
        projectId,
        source.parentId,
      );
      this.requirePermission(actor, "task.write", sourceParent);
      if (sourceParent.type === TaskType.milestone) {
        throw new BadRequestException("Không thể nhân bản vào trong mốc");
      }
    }
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH RECURSIVE subtree AS (
        SELECT id FROM "task" WHERE id = ${taskId}::uuid AND project_id = ${projectId}::uuid
        UNION ALL
        SELECT child.id FROM "task" AS child
        JOIN subtree AS parent ON child.parent_id = parent.id
        WHERE child.deleted_at IS NULL
      )
      SELECT id FROM subtree
    `);
    const sourceTasks = await this.prisma.task.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      orderBy: [{ depth: "asc" }, { position: "asc" }],
      include: {
        project: {
          include: {
            branch: { select: { organizationId: true, id: true } },
            members: {
              where: { userId: actor.id },
              select: { userId: true, role: true },
            },
          },
        },
        creator: { select: { departmentId: true } },
        assignee: { select: { departmentId: true } },
        checklistItems: {
          orderBy: { position: "asc" },
          include: {
            attachments: { where: { deletedAt: null, isCurrent: true } },
          },
        },
        attachments: { where: { deletedAt: null, isCurrent: true } },
      },
    });
    for (const original of sourceTasks) {
      this.requirePermission(actor, "task.write", original);
    }

    const copiedKeys: string[] = [];
    try {
      return await this.prisma.$transaction(async (tx) => {
        const idMap = new Map<string, string>();
        await this.lockSiblingGroups(tx, [
          `${projectId}:${source.parentId ?? "root"}`,
        ]);
        const rootSiblings = await tx.task.findMany({
          where: { projectId, parentId: source.parentId, deletedAt: null },
          orderBy: { position: "desc" },
          take: 1,
          select: { position: true },
        });
        const rootPosition = positionBetween(
          rootSiblings[0]?.position ?? null,
          null,
        );
        let root: { id: string } | undefined;
        for (const original of sourceTasks) {
          const parentId =
            original.id === taskId
              ? source.parentId
              : original.parentId
                ? (idMap.get(original.parentId) ?? null)
                : null;
          const clone = await tx.task.create({
            data: {
              projectId,
              parentId,
              type: original.type,
              position:
                original.id === taskId ? rootPosition : original.position,
              title: original.title,
              description: original.description,
              priority: original.priority,
              startDate: original.startDate,
              durationDays: original.durationDays,
              dueDate: original.dueDate,
              assignmentLevel: original.assignmentLevel,
              assignmentStatus:
                (original.assignmentLevel ??
                  original.project.assignmentLevel) === AssignmentLevel.light
                  ? null
                  : AssignmentStatus.draft,
              reviewerId:
                (original.assignmentLevel ??
                  original.project.assignmentLevel) === AssignmentLevel.light
                  ? null
                  : actor.id,
              assignerId:
                (original.assignmentLevel ??
                  original.project.assignmentLevel) === AssignmentLevel.light
                  ? null
                  : actor.id,
              creatorId: actor.id,
              customFields: original.customFields as Prisma.InputJsonValue,
            },
          });
          idMap.set(original.id, clone.id);
          if (original.id === taskId) root = clone;
          for (const item of original.checklistItems) {
            const clonedItem = await tx.checklistItem.create({
              data: {
                taskId: clone.id,
                title: item.title,
                done: false,
                assigneeId: item.assigneeId,
                position: item.position,
              },
            });
            if (options.includeFiles) {
              for (const attachment of item.attachments) {
                await this.copyAttachment(
                  tx,
                  attachment,
                  projectId,
                  actor.id,
                  null,
                  clonedItem.id,
                  copiedKeys,
                );
              }
            }
          }
          if (options.includeFiles) {
            for (const attachment of original.attachments) {
              await this.copyAttachment(
                tx,
                attachment,
                projectId,
                actor.id,
                clone.id,
                null,
                copiedKeys,
              );
            }
          }
        }
        if (!root) throw new NotFoundException();
        await tx.activityLog.create({
          data: this.activity(
            root.id,
            projectId,
            actor.id,
            "task.cloned",
            {
              sourceTaskId: taskId,
              includeFiles: options.includeFiles ?? false,
            },
            root,
          ),
        });
        return root;
      });
    } catch (error) {
      const cleanup = await Promise.allSettled(
        copiedKeys.map((key) =>
          this.s3.send(
            new DeleteObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }),
          ),
        ),
      );
      for (const result of cleanup) {
        if (result.status === "rejected") {
          this.logger.error({
            message: "Failed to clean up cloned task object",
            error: String(result.reason),
          });
        }
      }
      throw error;
    }
  }

  async deleteTask(actor: Actor, projectId: string, taskId: string) {
    const task = await this.findTask(actor, projectId, taskId);
    this.requirePermission(actor, "task.write", task);
    const deletedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        WITH RECURSIVE subtree AS (
          SELECT id FROM "task"
          WHERE id = ${taskId}::uuid AND project_id = ${projectId}::uuid
          UNION ALL
          SELECT child.id FROM "task" AS child
          JOIN subtree AS parent ON child.parent_id = parent.id
          WHERE child.deleted_at IS NULL
        )
        UPDATE "task" SET "deleted_at" = ${deletedAt}
        WHERE id IN (SELECT id FROM subtree)
      `);
      await tx.activityLog.create({
        data: this.activity(taskId, projectId, actor.id, "task.deleted", task, {
          deletedAt,
        }),
      });
    });
    return { id: taskId, deletedAt };
  }

  async listChecklist(actor: Actor, projectId: string, taskId: string) {
    const task = await this.findTask(actor, projectId, taskId);
    if (this.requirePermission(actor, "task.view", task) === "limited")
      return [];
    return task.checklistItems;
  }

  async createChecklistItem(
    actor: Actor,
    projectId: string,
    taskId: string,
    input: { title: string; assigneeId?: string | null },
  ) {
    const task = await this.findTask(actor, projectId, taskId);
    this.requirePermission(actor, "task.write", task);
    if (input.assigneeId) {
      await this.requireActiveProjectMember(projectId, input.assigneeId);
    }
    return this.prisma.$transaction(async (tx) => {
      await this.lockSiblingGroups(tx, [`checklist:${taskId}`]);
      const position = await this.nextChecklistPosition(taskId, tx);
      const item = await tx.checklistItem.create({
        data: {
          taskId,
          title: input.title.trim(),
          position,
          assigneeId: input.assigneeId ?? null,
        },
      });
      await tx.activityLog.create({
        data: this.activity(
          taskId,
          projectId,
          actor.id,
          "checklist.created",
          undefined,
          item,
        ),
      });
      return item;
    });
  }

  async updateChecklistItem(
    actor: Actor,
    projectId: string,
    taskId: string,
    itemId: string,
    input: {
      title?: string;
      done?: boolean;
      assigneeId?: string | null;
      position?: string;
    },
  ) {
    const task = await this.findTask(actor, projectId, taskId);
    this.requirePermission(actor, "task.write", task);
    const item = await this.prisma.checklistItem.findFirst({
      where: { id: itemId, taskId },
    });
    if (!item) throw new NotFoundException();
    if (input.assigneeId) {
      await this.requireActiveProjectMember(projectId, input.assigneeId);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.checklistItem.update({
        where: { id: itemId },
        data: {
          ...(input.title === undefined ? {} : { title: input.title.trim() }),
          ...(input.done === undefined
            ? {}
            : {
                done: input.done,
                doneAt: input.done ? new Date() : null,
              }),
          ...(input.assigneeId === undefined
            ? {}
            : { assigneeId: input.assigneeId }),
          ...(input.position === undefined ? {} : { position: input.position }),
        },
      });
      await tx.activityLog.create({
        data: this.activity(
          taskId,
          projectId,
          actor.id,
          "checklist.updated",
          item,
          current,
        ),
      });
      return current;
    });
    return updated;
  }

  async deleteChecklistItem(
    actor: Actor,
    projectId: string,
    taskId: string,
    itemId: string,
  ) {
    const task = await this.findTask(actor, projectId, taskId);
    this.requirePermission(actor, "task.write", task);
    const item = await this.prisma.checklistItem.findFirst({
      where: { id: itemId, taskId },
    });
    if (!item) throw new NotFoundException();
    await this.prisma.$transaction(async (tx) => {
      await tx.checklistItem.delete({ where: { id: itemId } });
      await tx.activityLog.create({
        data: this.activity(
          taskId,
          projectId,
          actor.id,
          "checklist.deleted",
          item,
        ),
      });
    });
    return { id: itemId };
  }

  async convertChecklistItemToTask(
    actor: Actor,
    projectId: string,
    taskId: string,
    itemId: string,
  ) {
    const parent = await this.findTask(actor, projectId, taskId);
    this.requirePermission(actor, "task.write", parent);
    if (parent.type === TaskType.milestone) {
      throw new BadRequestException("Không thể thêm việc con vào mốc");
    }
    const item = await this.prisma.checklistItem.findFirst({
      where: { id: itemId, taskId },
      include: { attachments: { where: { deletedAt: null } } },
    });
    if (!item) throw new NotFoundException();
    if (item.attachments.length) {
      throw new BadRequestException(
        "Không thể chuyển mục checklist đang có tệp đính kèm",
      );
    }
    return this.prisma.$transaction(async (tx) => {
      await this.lockSiblingGroups(tx, [`${projectId}:${taskId}`]);
      const position = await this.nextPosition(projectId, taskId, tx);
      const child = await tx.task.create({
        data: {
          projectId,
          parentId: taskId,
          type: TaskType.task,
          position,
          title: item.title,
          assigneeId: item.assigneeId,
          creatorId: actor.id,
        },
      });
      await tx.checklistItem.delete({ where: { id: itemId } });
      await tx.activityLog.create({
        data: this.activity(
          taskId,
          projectId,
          actor.id,
          "checklist.converted_to_task",
          item,
          child,
        ),
      });
      return child;
    });
  }

  async convertTaskToChecklistItem(
    actor: Actor,
    projectId: string,
    parentTaskId: string,
    childTaskId: string,
  ) {
    const parent = await this.findTask(actor, projectId, parentTaskId);
    this.requirePermission(actor, "task.write", parent);
    const child = await this.findTask(actor, projectId, childTaskId);
    this.requirePermission(actor, "task.write", child);
    if (child.parentId !== parentTaskId) {
      throw new BadRequestException("Việc cần chuyển phải là con trực tiếp");
    }
    const [
      childTaskCount,
      checklistCount,
      attachmentCount,
      dependencyCount,
      commentCount,
      labelCount,
    ] = await Promise.all([
      this.prisma.task.count({
        where: { parentId: childTaskId, deletedAt: null },
      }),
      this.prisma.checklistItem.count({ where: { taskId: childTaskId } }),
      this.prisma.attachment.count({
        where: {
          deletedAt: null,
          OR: [
            { taskId: childTaskId },
            { checklistItem: { taskId: childTaskId } },
          ],
        },
      }),
      this.prisma.taskDependency.count({
        where: {
          OR: [{ predecessorId: childTaskId }, { successorId: childTaskId }],
        },
      }),
      this.prisma.comment.count({ where: { taskId: childTaskId } }),
      this.prisma.taskLabel.count({ where: { taskId: childTaskId } }),
    ]);
    if (
      childTaskCount ||
      checklistCount ||
      attachmentCount ||
      dependencyCount ||
      commentCount ||
      labelCount
    ) {
      throw new BadRequestException(
        "Chỉ có thể chuyển việc không có việc con, checklist, nhãn, tệp, phụ thuộc hoặc nhận xét",
      );
    }
    return this.prisma.$transaction(async (tx) => {
      await this.lockSiblingGroups(tx, [`checklist:${parentTaskId}`]);
      const position = await this.nextChecklistPosition(parentTaskId, tx);
      const item = await tx.checklistItem.create({
        data: {
          taskId: parentTaskId,
          title: child.title,
          assigneeId: child.assigneeId,
          done: child.status === TaskStatus.done,
          doneAt:
            child.status === TaskStatus.done
              ? (child.completedAt ?? new Date())
              : null,
          position,
        },
      });
      await tx.task.update({
        where: { id: childTaskId },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      await tx.activityLog.create({
        data: this.activity(
          parentTaskId,
          projectId,
          actor.id,
          "task.converted_to_checklist",
          child,
          item,
        ),
      });
      return item;
    });
  }

  async listDependencies(actor: Actor, projectId: string, taskId: string) {
    const task = await this.findTask(actor, projectId, taskId);
    if (this.requirePermission(actor, "task.view", task) === "limited") {
      return { predecessors: [], successors: [] };
    }
    const [predecessorRows, successorRows] = await Promise.all([
      this.prisma.taskDependency.findMany({
        where: { successorId: taskId },
        include: {
          predecessor: {
            select: { id: true, title: true, status: true, dueDate: true },
          },
        },
      }),
      this.prisma.taskDependency.findMany({
        where: { predecessorId: taskId },
        include: {
          successor: {
            select: { id: true, title: true, status: true, dueDate: true },
          },
        },
      }),
    ]);
    const predecessors = (
      await Promise.all(
        predecessorRows.map(async (link) => {
          const visible = await this.findVisibleTask(
            actor,
            projectId,
            link.predecessor.id,
          );
          if (!visible) return null;
          if (visible.visibility === "limited") {
            return {
              type: link.type,
              lagDays: link.lagDays,
              predecessor: { title: "Việc hạn chế" as const, progress: 0 },
            };
          }
          return link;
        }),
      )
    ).filter((link) => link !== null);
    const successors = (
      await Promise.all(
        successorRows.map(async (link) => {
          const visible = await this.findVisibleTask(
            actor,
            projectId,
            link.successor.id,
          );
          if (!visible) return null;
          if (visible.visibility === "limited") {
            return {
              type: link.type,
              lagDays: link.lagDays,
              successor: { title: "Việc hạn chế" as const, progress: 0 },
            };
          }
          return link;
        }),
      )
    ).filter((link) => link !== null);
    return { predecessors, successors };
  }

  async createDependency(
    actor: Actor,
    projectId: string,
    taskId: string,
    input: {
      predecessorId: string;
      type?: DependencyType;
      lagDays?: number;
      autoReschedule?: boolean;
    },
  ) {
    const task = await this.findTask(actor, projectId, taskId);
    this.requirePermission(actor, "task.write", task);
    const predecessor = await this.findTask(
      actor,
      projectId,
      input.predecessorId,
    );
    this.requirePermission(actor, "task.write", predecessor);
    if (input.predecessorId === taskId) {
      throw new BadRequestException(
        "Một việc không thể phụ thuộc vào chính nó",
      );
    }
    if (
      input.lagDays !== undefined &&
      (!Number.isSafeInteger(input.lagDays) ||
        input.lagDays < 0 ||
        input.lagDays > 3650)
    ) {
      throw new BadRequestException("Số ngày trễ phải từ 0 đến 3650");
    }
    const dependencyType = input.type ?? DependencyType.finish_start;
    if (
      input.autoReschedule &&
      dependencyType !== DependencyType.finish_start
    ) {
      throw new BadRequestException(
        "Tự dời lịch hiện chỉ hỗ trợ quan hệ finish_start",
      );
    }
    const rescheduledDates = input.autoReschedule
      ? this.finishStartDates(predecessor, task, input.lagDays ?? 0)
      : null;
    try {
      const dependency = await this.prisma.$transaction(async (tx) => {
        await this.lockSiblingGroups(tx, [`dependency:${projectId}`]);
        const cycle = await tx.$queryRaw<Array<{ cycle: boolean }>>(Prisma.sql`
          WITH RECURSIVE reachable(id) AS (
            SELECT dependency.successor_id
            FROM "task_dependency" AS dependency
            WHERE dependency.predecessor_id = ${taskId}::uuid
            UNION
            SELECT dependency.successor_id
            FROM "task_dependency" AS dependency
            JOIN reachable ON dependency.predecessor_id = reachable.id
          )
          SELECT EXISTS (
            SELECT 1 FROM reachable WHERE id = ${input.predecessorId}::uuid
          ) AS cycle
        `);
        if (cycle[0]?.cycle) {
          throw new BadRequestException("Không thể tạo chu trình phụ thuộc");
        }
        const created = await tx.taskDependency.create({
          data: {
            predecessorId: input.predecessorId,
            successorId: taskId,
            type: dependencyType,
            lagDays: input.lagDays ?? 0,
          },
        });
        if (rescheduledDates) {
          const updated = await tx.task.updateMany({
            where: {
              id: taskId,
              projectId,
              version: task.version,
              deletedAt: null,
            },
            data: {
              startDate: rescheduledDates.startDate,
              dueDate: rescheduledDates.dueDate,
              version: { increment: 1 },
            },
          });
          if (updated.count !== 1) {
            await this.throwVersionConflict(projectId, taskId);
          }
          const current = await tx.task.findUniqueOrThrow({
            where: { id: taskId },
          });
          await tx.activityLog.create({
            data: this.activity(
              taskId,
              projectId,
              actor.id,
              "task.auto_rescheduled",
              task,
              current,
            ),
          });
        }
        await tx.activityLog.create({
          data: this.activity(
            taskId,
            projectId,
            actor.id,
            "dependency.created",
            undefined,
            created,
          ),
        });
        return created;
      });
      return dependency;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2003")
      ) {
        throw new ConflictException("Phụ thuộc đã tồn tại hoặc không hợp lệ");
      }
      if (
        error instanceof Error &&
        /cycle|chu trình|task_dependency/i.test(error.message)
      ) {
        throw new BadRequestException("Không thể tạo chu trình phụ thuộc");
      }
      throw error;
    }
  }

  async updateDependency(
    actor: Actor,
    projectId: string,
    taskId: string,
    dependencyId: string,
    input: { type?: DependencyType; lagDays?: number },
  ) {
    const task = await this.findTask(actor, projectId, taskId);
    this.requirePermission(actor, "task.write", task);
    const dependency = await this.prisma.taskDependency.findFirst({
      where: { id: dependencyId, successorId: taskId },
    });
    if (!dependency) throw new NotFoundException();
    const updated = await this.prisma.taskDependency.update({
      where: { id: dependencyId },
      data: {
        ...(input.type === undefined ? {} : { type: input.type }),
        ...(input.lagDays === undefined ? {} : { lagDays: input.lagDays }),
      },
    });
    await this.prisma.activityLog.create({
      data: this.activity(
        taskId,
        projectId,
        actor.id,
        "dependency.updated",
        dependency,
        updated,
      ),
    });
    return updated;
  }

  async deleteDependency(
    actor: Actor,
    projectId: string,
    taskId: string,
    dependencyId: string,
  ) {
    const task = await this.findTask(actor, projectId, taskId);
    this.requirePermission(actor, "task.write", task);
    const dependency = await this.prisma.taskDependency.findFirst({
      where: { id: dependencyId, successorId: taskId },
    });
    if (!dependency) throw new NotFoundException();
    await this.prisma.$transaction(async (tx) => {
      await tx.taskDependency.delete({ where: { id: dependencyId } });
      await tx.activityLog.create({
        data: this.activity(
          taskId,
          projectId,
          actor.id,
          "dependency.deleted",
          dependency,
        ),
      });
    });
    return { id: dependencyId };
  }

  async bulkUpdateTasks(
    actor: Actor,
    projectId: string,
    input: {
      taskIds: string[];
      assigneeId?: string | null;
      dueDate?: string | null;
      status?: TaskStatus;
      blockedReason?: string | null;
      labelIds?: string[];
    },
  ) {
    if (input.assigneeId) {
      await this.requireActiveProjectMember(projectId, input.assigneeId);
    }
    const tasks = await this.prisma.task.findMany({
      where: { id: { in: input.taskIds }, projectId, deletedAt: null },
      include: {
        project: {
          include: {
            branch: { select: { organizationId: true, id: true } },
            members: {
              where: { userId: actor.id },
              select: { userId: true, role: true },
            },
          },
        },
        creator: { select: { departmentId: true } },
        assignee: { select: { departmentId: true } },
      },
    });
    if (tasks.length !== input.taskIds.length) throw new NotFoundException();
    for (const task of tasks) this.requirePermission(actor, "task.write", task);
    if (
      input.status !== undefined &&
      tasks.some(
        (task) =>
          (task.assignmentLevel ?? task.project.assignmentLevel) !==
          AssignmentLevel.light,
      )
    ) {
      throw new BadRequestException(
        "Hãy dùng chuyển trạng thái giao việc cho dự án mức Chuẩn hoặc Chặt",
      );
    }

    const before = await Promise.all(
      tasks.map(async (task) => ({
        id: task.id,
        version: task.version,
        assigneeId: task.assigneeId,
        dueDate: task.dueDate?.toISOString() ?? null,
        status: task.status,
        completedAt: task.completedAt?.toISOString() ?? null,
        blockedReason: task.blockedReason,
        labels:
          input.labelIds === undefined
            ? undefined
            : await this.prisma.taskLabel.findMany({
                where: { taskId: task.id },
                select: { labelId: true },
              }),
      })),
    );
    const undoToken = randomUUID();
    const afterVersions = Object.fromEntries(
      tasks.map((task) => [task.id, task.version + 1]),
    );
    const undoKey = this.undoKey(actor.id, undoToken);
    const savedUndo = await this.redis.set(
      undoKey,
      JSON.stringify({ projectId, before, afterVersions }),
      "EX",
      60,
      "NX",
    );
    if (savedUndo !== "OK") {
      throw new Error("Không thể tạo mã hoàn tác cho thao tác hàng loạt");
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        if (input.labelIds) {
          const labels = await tx.label.findMany({
            where: {
              id: { in: input.labelIds },
              organizationId: actor.organizationId,
              OR: [{ projectId }, { projectId: null }],
            },
            select: { id: true },
          });
          if (labels.length !== new Set(input.labelIds).size) {
            throw new BadRequestException("Nhãn không thuộc dự án");
          }
        }
        for (const task of tasks) {
          const updated = await tx.task.updateMany({
            where: { id: task.id, version: task.version },
            data: {
              ...(input.assigneeId === undefined
                ? {}
                : { assigneeId: input.assigneeId }),
              ...(input.dueDate === undefined
                ? {}
                : { dueDate: dateValue(input.dueDate) }),
              ...(input.status === undefined
                ? {}
                : {
                    status: input.status,
                    completedAt:
                      input.status === TaskStatus.done ? new Date() : null,
                    blockedReason:
                      input.status === TaskStatus.blocked
                        ? input.blockedReason
                        : null,
                  }),
              ...(input.status === TaskStatus.blocked &&
              input.blockedReason !== undefined
                ? { blockedReason: input.blockedReason }
                : {}),
              version: { increment: 1 },
            },
          });
          if (updated.count !== 1)
            await this.throwVersionConflict(projectId, task.id);
          const current = await tx.task.findUniqueOrThrow({
            where: { id: task.id },
          });
          if (input.labelIds) {
            await tx.taskLabel.deleteMany({ where: { taskId: task.id } });
            if (input.labelIds.length) {
              await tx.taskLabel.createMany({
                data: input.labelIds.map((labelId) => ({
                  taskId: task.id,
                  labelId,
                })),
              });
            }
          }
          await tx.activityLog.create({
            data: this.activity(
              task.id,
              projectId,
              actor.id,
              "task.bulk_updated",
              task,
              current,
            ),
          });
        }
      });
    } catch (error) {
      await this.redis.del(undoKey);
      throw error;
    }
    for (const task of tasks) {
      if (
        input.assigneeId !== undefined &&
        task.assigneeId !== input.assigneeId &&
        input.assigneeId
      ) {
        this.events?.emit("domain", {
          type: "task.assigned",
          projectId,
          taskId: task.id,
          taskTitle: task.title,
          userId: input.assigneeId,
        });
      }
      if (input.status !== undefined && task.status !== input.status) {
        this.events?.emit("domain", {
          type: "task.status_changed",
          projectId,
          taskId: task.id,
          taskTitle: task.title,
          creatorId: task.creatorId,
          status: input.status,
        });
      }
    }
    return { updated: tasks.length, undoToken, expiresIn: 60 };
  }

  async undoBulkUpdate(actor: Actor, undoToken: string) {
    const key = this.undoKey(actor.id, undoToken);
    const remainingTtl = await this.redis.ttl(key);
    const serialized = await this.redis.getdel(key);
    if (!serialized)
      throw new NotFoundException("Mã hoàn tác không hợp lệ hoặc đã hết hạn");
    try {
      const undo = JSON.parse(serialized) as {
        projectId: string;
        before: Array<{
          id: string;
          version: number;
          assigneeId: string | null;
          dueDate: string | null;
          status: TaskStatus;
          completedAt: string | null;
          blockedReason: string | null;
          labels?: Array<{ labelId: string }>;
        }>;
        afterVersions: Record<string, number>;
      };
      const currentTasks = await this.prisma.task.findMany({
        where: {
          id: { in: undo.before.map((item) => item.id) },
          projectId: undo.projectId,
          deletedAt: null,
        },
        include: {
          project: {
            include: {
              branch: { select: { organizationId: true, id: true } },
              members: {
                where: { userId: actor.id },
                select: { userId: true, role: true },
              },
            },
          },
          creator: { select: { departmentId: true } },
          assignee: { select: { departmentId: true } },
        },
      });
      if (currentTasks.length !== undo.before.length)
        throw new NotFoundException();
      for (const task of currentTasks)
        this.requirePermission(actor, "task.write", task);
      await this.prisma.$transaction(async (tx) => {
        for (const item of undo.before) {
          const updated = await tx.task.updateMany({
            where: {
              id: item.id,
              projectId: undo.projectId,
              version: undo.afterVersions[item.id],
            },
            data: {
              assigneeId: item.assigneeId,
              dueDate: item.dueDate ? new Date(item.dueDate) : null,
              status: item.status,
              completedAt: item.completedAt ? new Date(item.completedAt) : null,
              blockedReason: item.blockedReason,
              version: { increment: 1 },
            },
          });
          if (updated.count !== 1) {
            throw new ConflictException(
              "Không thể hoàn tác vì việc đã được sửa sau thao tác hàng loạt",
            );
          }
          if (item.labels) {
            await tx.taskLabel.deleteMany({ where: { taskId: item.id } });
            if (item.labels.length) {
              await tx.taskLabel.createMany({
                data: item.labels.map((label) => ({
                  taskId: item.id,
                  labelId: label.labelId,
                })),
              });
            }
          }
          await tx.activityLog.create({
            data: this.activity(
              item.id,
              undo.projectId,
              actor.id,
              "task.bulk_undone",
              undefined,
              item,
            ),
          });
        }
      });
      return { restored: undo.before.length };
    } catch (error) {
      if (remainingTtl > 0) {
        await this.redis.set(key, serialized, "EX", remainingTtl, "NX");
      }
      throw error;
    }
  }

  private async findProject(actor: Actor, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        deletedAt: null,
        branch: { organizationId: actor.organizationId },
      },
      include: {
        branch: { select: { id: true, organizationId: true } },
        members: {
          where: { userId: actor.id },
          select: { userId: true, role: true },
        },
      },
    });
    if (!project) throw new NotFoundException();
    return project;
  }

  private listVisibilityFilter(
    actor: Actor,
    project: Awaited<ReturnType<TasksService["findProject"]>>,
  ): Prisma.Sql {
    return this.taskVisibilityFilter(actor, project, "enriched");
  }

  private taskVisibilityFilter(
    actor: Actor,
    project: Awaited<ReturnType<TasksService["findProject"]>>,
    alias: "enriched" | "child" | "predecessor",
  ): Prisma.Sql {
    const creatorId = Prisma.raw(`${alias}.creator_id`);
    const assigneeId = Prisma.raw(`${alias}.assignee_id`);
    const creatorDepartmentId = Prisma.raw(`${alias}."creatorDepartmentId"`);
    const assigneeDepartmentId = Prisma.raw(`${alias}."assigneeDepartmentId"`);
    const role = project.members[0]?.role;
    if (role === ProjectRole.restricted) {
      return Prisma.sql`
        (${creatorId} = ${actor.id}::uuid OR ${assigneeId} = ${actor.id}::uuid)
      `;
    }
    if (role) return Prisma.sql`TRUE`;
    const managesBranch =
      actor.systemRole === "branch_director" &&
      actor.branchId === project.branchId;
    const managesDepartment =
      actor.systemRole === "department_head" &&
      actor.managedDepartmentIds.length > 0;
    const departmentFilter = (): Prisma.Sql => {
      const departmentIds = Prisma.join(
        actor.managedDepartmentIds.map((id) => Prisma.sql`${id}::uuid`),
      );
      if (alias !== "enriched") {
        const creatorAlias =
          alias === "child" ? "child_creator" : "predecessor_creator";
        const assigneeAlias =
          alias === "child" ? "child_assignee" : "predecessor_assignee";
        return Prisma.sql`
          EXISTS (
            SELECT 1 FROM "app_user" AS ${Prisma.raw(creatorAlias)}
            WHERE ${Prisma.raw(creatorAlias)}."id" = ${creatorId}
              AND ${Prisma.raw(creatorAlias)}."department_id" IN (${departmentIds})
          )
          OR EXISTS (
            SELECT 1 FROM "app_user" AS ${Prisma.raw(assigneeAlias)}
            WHERE ${Prisma.raw(assigneeAlias)}."id" = ${assigneeId}
              AND ${Prisma.raw(assigneeAlias)}."department_id" IN (${departmentIds})
          )
        `;
      }
      return Prisma.sql`
        ${creatorDepartmentId} IN (${departmentIds})
        OR ${assigneeDepartmentId} IN (${departmentIds})
      `;
    };
    if (project.confidentiality === Confidentiality.restricted) {
      if (managesBranch) return Prisma.sql`TRUE`;
      return managesDepartment ? departmentFilter() : Prisma.sql`FALSE`;
    }
    if (managesBranch) return Prisma.sql`TRUE`;
    if (managesDepartment) return departmentFilter();
    return Prisma.sql`FALSE`;
  }

  private taskVisibilityWhere(
    actor: Actor,
    project: TaskContext["project"],
  ): Prisma.TaskWhereInput {
    const role = project.members.find(
      (member) => member.userId === actor.id,
    )?.role;
    if (role === ProjectRole.restricted) {
      return { OR: [{ creatorId: actor.id }, { assigneeId: actor.id }] };
    }
    if (role) return {};
    const managesBranch =
      actor.systemRole === "branch_director" &&
      actor.branchId === project.branchId;
    const managesDepartment =
      actor.systemRole === "department_head" &&
      actor.managedDepartmentIds.length > 0;
    if (project.confidentiality === Confidentiality.restricted) {
      if (managesBranch) return {};
      if (managesDepartment) {
        return {
          OR: [
            { creator: { departmentId: { in: actor.managedDepartmentIds } } },
            { assignee: { departmentId: { in: actor.managedDepartmentIds } } },
          ],
        };
      }
      return { creatorId: { in: [] } };
    }
    if (managesBranch) return {};
    if (managesDepartment) {
      return {
        OR: [
          { creator: { departmentId: { in: actor.managedDepartmentIds } } },
          { assignee: { departmentId: { in: actor.managedDepartmentIds } } },
        ],
      };
    }
    return { creatorId: { in: [] } };
  }

  private async findTask(
    actor: Actor,
    projectId: string,
    taskId: string,
  ): Promise<TaskContext> {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        projectId,
        deletedAt: null,
        project: {
          deletedAt: null,
          branch: { organizationId: actor.organizationId },
        },
      },
      include: taskContextInclude,
    });
    if (!task) throw new NotFoundException();
    return task;
  }

  private taskVisibility(
    actor: Actor,
    action: PermissionAction,
    task: TaskPermissionContext,
  ): PermissionVisibility {
    return permissionVisibility(
      actor,
      action,
      taskResource(actor, task.project, {
        creatorId: task.creatorId,
        assigneeId: task.assigneeId,
        creatorDepartmentId: task.creator.departmentId,
        assigneeDepartmentId: task.assignee?.departmentId,
      }),
    );
  }

  private requirePermission(
    actor: Actor,
    action: PermissionAction,
    task: TaskPermissionContext,
  ): PermissionVisibility {
    const visibility = this.taskVisibility(actor, action, task);
    if (visibility === "none") throw new NotFoundException();
    if (visibility === "limited" && action !== "task.view") {
      throw new NotFoundException();
    }
    return visibility;
  }

  private async findVisibleTask(
    actor: Actor,
    projectId: string,
    taskId: string,
  ): Promise<{ task: TaskContext; visibility: PermissionVisibility } | null> {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        projectId,
        deletedAt: null,
        project: {
          deletedAt: null,
          branch: { organizationId: actor.organizationId },
        },
      },
      include: taskContextInclude,
    });
    if (!task) return null;
    const visibility = this.taskVisibility(actor, "task.view", task);
    if (visibility === "none") return null;
    return { task, visibility };
  }

  private requireProjectPermission(
    actor: Actor,
    action: PermissionAction,
    project: Awaited<ReturnType<TasksService["findProject"]>>,
  ): void {
    const visibility = permissionVisibility(actor, action, {
      type: "task",
      organizationId: project.branch.organizationId,
      projectId: project.id,
      branchId: project.branchId,
      confidentiality: project.confidentiality,
      projectRole: project.members[0]?.role,
      creatorId: actor.id,
    });
    if (visibility === "none") throw new NotFoundException();
  }

  private async requireActiveProjectMember(
    projectId: string,
    userId: string,
  ): Promise<void> {
    const member = await this.prisma.projectMember.findFirst({
      where: {
        projectId,
        userId,
        user: { status: "active" },
      },
    });
    if (!member) {
      throw new BadRequestException(
        "Người nhận phải là thành viên đang hoạt động của dự án",
      );
    }
  }

  private async nextPosition(
    projectId: string,
    parentId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const siblings = await tx.task.findMany({
      where: { projectId, parentId, deletedAt: null },
      orderBy: { position: "desc" },
      take: 1,
      select: { position: true },
    });
    return positionBetween(siblings[0]?.position ?? null, null);
  }

  private async nextChecklistPosition(
    taskId: string,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const items = await tx.checklistItem.findMany({
      where: { taskId },
      orderBy: { position: "desc" },
      take: 1,
      select: { position: true },
    });
    return positionBetween(items[0]?.position ?? null, null);
  }

  private async lockSiblingGroups(
    tx: Prisma.TransactionClient,
    groups: string[],
  ): Promise<void> {
    for (const group of [...new Set(groups)].sort()) {
      await tx.$queryRaw(Prisma.sql`
        SELECT 1 FROM pg_advisory_xact_lock(hashtext(${group})::bigint)
      `);
    }
  }

  private temporaryPositions(count: number, excluded: Set<string>): string[] {
    const positions: string[] = [];
    const reserved = new Set(excluded);
    while (positions.length < count) {
      const candidate = randomUUID()
        .replace(/-/g, "")
        .slice(0, 12)
        .toUpperCase();
      if (reserved.has(candidate)) continue;
      reserved.add(candidate);
      positions.push(candidate);
    }
    return positions;
  }

  private async copyAttachment(
    tx: Prisma.TransactionClient,
    attachment: {
      storageKey: string;
      thumbKey: string | null;
      previewKey: string | null;
      width: number | null;
      height: number | null;
      fileName: string;
      mime: string;
      size: number;
      note: string | null;
      takenAt: Date | null;
      lat: number | null;
      lng: number | null;
    },
    projectId: string,
    actorId: string,
    taskId: string | null,
    checklistItemId: string | null,
    copiedKeys: string[],
  ): Promise<void> {
    const storageKey = `projects/${projectId}/attachments/${randomUUID()}`;
    await this.s3.send(
      new CopyObjectCommand({
        Bucket: this.env.S3_BUCKET,
        CopySource: `/${this.env.S3_BUCKET}/${attachment.storageKey
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`,
        Key: storageKey,
      }),
    );
    copiedKeys.push(storageKey);

    let thumbKey: string | null = null;
    if (attachment.thumbKey) {
      thumbKey = `projects/${projectId}/attachments/${randomUUID()}-thumb`;
      await this.s3.send(
        new CopyObjectCommand({
          Bucket: this.env.S3_BUCKET,
          CopySource: `/${this.env.S3_BUCKET}/${attachment.thumbKey
            .split("/")
            .map(encodeURIComponent)
            .join("/")}`,
          Key: thumbKey,
        }),
      );
      copiedKeys.push(thumbKey);
    }

    let previewKey: string | null = null;
    if (attachment.previewKey) {
      previewKey = `projects/${projectId}/attachments/${randomUUID()}-preview`;
      await this.s3.send(
        new CopyObjectCommand({
          Bucket: this.env.S3_BUCKET,
          CopySource: `/${this.env.S3_BUCKET}/${attachment.previewKey
            .split("/")
            .map(encodeURIComponent)
            .join("/")}`,
          Key: previewKey,
        }),
      );
      copiedKeys.push(previewKey);
    }

    await tx.attachment.create({
      data: {
        projectId,
        taskId,
        checklistItemId,
        uploaderId: actorId,
        fileName: attachment.fileName,
        mime: attachment.mime,
        size: attachment.size,
        storageKey,
        thumbKey,
        previewKey,
        width: attachment.width,
        height: attachment.height,
        confirmedAt: new Date(),
        note: attachment.note,
        takenAt: attachment.takenAt,
        lat: attachment.lat,
        lng: attachment.lng,
      },
    });
  }

  private undoKey(actorId: string, token: string): string {
    return `task-bulk-undo:${actorId}:${token}`;
  }

  private async countVisibleTree(
    projectId: string,
    parentId: string | undefined,
    visibilityFilter: Prisma.Sql,
  ) {
    return this.prisma
      .$queryRaw<Array<{ count: number }>>(
        Prisma.sql`
      WITH RECURSIVE task_tree AS (
        SELECT task.* FROM "task" AS task
        WHERE task.project_id = ${projectId}::uuid
          AND task.parent_id IS NOT DISTINCT FROM ${parentId ?? null}::uuid
          AND task.deleted_at IS NULL
        UNION ALL
        SELECT child.* FROM "task" AS child
        JOIN task_tree AS parent ON child.parent_id = parent.id
        WHERE child.deleted_at IS NULL
      ),
      enriched AS (
        SELECT task.*,
          creator.department_id AS "creatorDepartmentId",
          assignee.department_id AS "assigneeDepartmentId"
        FROM task_tree AS task
        JOIN "app_user" AS creator ON creator.id = task.creator_id
        LEFT JOIN "app_user" AS assignee ON assignee.id = task.assignee_id
      )
      SELECT count(*)::int AS count FROM enriched
      WHERE ${visibilityFilter}
    `,
      )
      .then((rows) => rows[0]?.count ?? 0);
  }

  private calculateProgress(
    mode: ProgressMode,
    calendar: WorkCalendar,
    task: Pick<
      TaskRow,
      | "status"
      | "progress"
      | "startDate"
      | "dueDate"
      | "durationDays"
      | "childCount"
      | "childProgressSum"
      | "childStartDate"
      | "childDueDate"
      | "checklistTotal"
      | "checklistDone"
    >,
  ): number {
    if (task.status === TaskStatus.done) return 100;
    if (mode === "manual") return task.progress;
    if (mode === "by_count") {
      if (task.childCount)
        return Math.round(task.childProgressSum / task.childCount);
      if (task.checklistTotal) {
        return calculateCountProgress([
          {
            status: task.status,
            checklistDone: task.checklistDone,
            checklistTotal: task.checklistTotal,
          },
        ]);
      }
      return 0;
    }
    const start = task.childStartDate ?? task.startDate;
    const end = task.childDueDate ?? task.dueDate;
    if (!start || (!end && task.durationDays === null)) return task.progress;
    const due =
      end ??
      new Date(
        `${addWorkingDays(start, Math.max(task.durationDays! - 1, 0), calendar)}T00:00:00.000Z`,
      );
    return calculateWorkdayProgress(start, due, new Date(), calendar);
  }

  private finishStartDates(
    predecessor: TaskContext,
    successor: TaskContext,
    lagDays: number,
  ): { startDate: Date; dueDate: Date | null } | null {
    if (!predecessor.dueDate) {
      throw new BadRequestException(
        "Cần đặt hạn cho việc trước khi tự dời việc finish_start",
      );
    }
    if (
      !successor.startDate &&
      successor.dueDate &&
      successor.durationDays === null
    ) {
      throw new BadRequestException(
        "Cần đặt ngày bắt đầu hoặc thời lượng cho việc sau để giữ nguyên thời lượng",
      );
    }
    const calendar = workCalendar(successor.project.workCalendar);
    const newStartDate = dateValue(
      addWorkingDays(predecessor.dueDate, lagDays + 1, calendar),
    );
    if (!newStartDate)
      throw new BadRequestException("Không thể tính ngày bắt đầu");
    if (successor.startDate && successor.startDate >= newStartDate) return null;

    let duration = successor.durationDays;
    if (duration === null && successor.startDate && successor.dueDate) {
      duration = Math.max(
        countWorkingDays(successor.startDate, successor.dueDate, calendar),
        1,
      );
    }
    const dueDate =
      duration === null
        ? successor.dueDate
        : dateValue(
            addWorkingDays(newStartDate, Math.max(duration - 1, 0), calendar),
          );
    return { startDate: newStartDate, dueDate };
  }

  private async throwVersionConflict(
    projectId: string,
    taskId: string,
  ): Promise<never> {
    const current = await this.prisma.task.findFirst({
      where: { id: taskId, projectId, deletedAt: null },
    });
    throw new ConflictException({
      message: "Việc đã được cập nhật bởi người khác",
      details: { current },
    });
  }

  private activity(
    taskId: string,
    projectId: string,
    actorId: string,
    action: string,
    before?: unknown,
    after?: unknown,
  ): Prisma.ActivityLogCreateManyInput {
    return {
      entityType: "task",
      entityId: taskId,
      projectId,
      actorId,
      action,
      ...(before === undefined ? {} : { before: snapshot(before) }),
      ...(after === undefined ? {} : { after: snapshot(after) }),
    };
  }
}
