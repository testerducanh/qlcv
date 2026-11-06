import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Confidentiality,
  Prisma,
  ProjectRole,
  TaskPriority,
  TaskStatus,
  TaskType,
  ViewMode,
} from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.service";
import { PrismaService } from "../infra/infra.module";
import {
  permissionVisibility,
  type TaskPermissionResource,
} from "../permissions/permissions";

type Actor = AuthenticatedUser;
type MyTasksTab =
  "today" | "overdue" | "upcoming" | "all" | "following" | "assigned";
type Filters = {
  assigneeId?: string;
  dueFrom?: string;
  dueTo?: string;
  statuses?: TaskStatus[];
  labelIds?: string[];
  projectId?: string;
  priorities?: TaskPriority[];
  hasAttachment?: boolean;
};

const accessInclude = {
  project: {
    include: {
      branch: { select: { id: true, organizationId: true } },
      members: { select: { userId: true, role: true } },
    },
  },
  creator: { select: { id: true, departmentId: true } },
  assignee: { select: { id: true, name: true, departmentId: true } },
} as const;

const taskInclude = {
  ...accessInclude,
  labels: {
    include: { label: { select: { id: true, name: true, color: true } } },
  },
  attachments: {
    where: { deletedAt: null, confirmedAt: { not: null }, isCurrent: true },
    select: { id: true },
  },
  predecessorLinks: {
    where: {
      predecessor: { deletedAt: null, status: { not: TaskStatus.done } },
    },
    include: {
      predecessor: { include: accessInclude },
    },
  },
  successorLinks: {
    where: {
      successor: { deletedAt: null, type: TaskType.milestone },
    },
    include: {
      successor: { include: accessInclude },
    },
  },
} as const;

type TaskWithContext = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;
type TaskAccessContext = Prisma.TaskGetPayload<{
  include: typeof accessInclude;
}>;

const priorityOrder: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function accessResource(
  actor: Actor,
  task: TaskAccessContext,
): TaskPermissionResource {
  return {
    type: "task",
    organizationId: task.project.branch.organizationId,
    projectId: task.projectId,
    branchId: task.project.branchId,
    confidentiality: task.project.confidentiality,
    projectRole:
      task.project.members.find((member) => member.userId === actor.id)?.role ??
      null,
    creatorId: task.creatorId,
    assigneeId: task.assigneeId,
    departmentIds: [
      task.creator.departmentId,
      task.assignee?.departmentId,
    ].filter((id): id is string => id !== null && id !== undefined),
  };
}

function taskIsVisible(actor: Actor, task: TaskAccessContext): boolean {
  return (
    permissionVisibility(actor, "task.view", accessResource(actor, task)) ===
    "full"
  );
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function safeHighlight(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/__QLCV_HL_START__/g, "<mark>")
    .replace(/__QLCV_HL_END__/g, "</mark>");
}

@Injectable()
export class MyWorkService {
  constructor(private readonly prisma: PrismaService) {}

  async listTasks(
    actor: Actor,
    input: {
      tab: MyTasksTab;
      days: number;
      page: number;
      pageSize: number;
    } & Filters,
  ) {
    const now = new Date();
    const today = dateOnly(now);
    const next = new Date(`${today}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const horizon = new Date(next);
    horizon.setUTCDate(horizon.getUTCDate() + input.days);

    const conditions: Prisma.TaskWhereInput[] = [
      {
        project: {
          branch: { organizationId: actor.organizationId },
          deletedAt: null,
        },
      },
      { deletedAt: null },
    ];
    if (input.tab === "today") {
      conditions.push({
        assigneeId: actor.id,
        dueDate: new Date(`${today}T00:00:00.000Z`),
      });
    } else if (input.tab === "overdue") {
      conditions.push({
        assigneeId: actor.id,
        dueDate: { lt: new Date(`${today}T00:00:00.000Z`) },
        status: { not: TaskStatus.done },
      });
    } else if (input.tab === "upcoming") {
      conditions.push({
        assigneeId: actor.id,
        dueDate: { gte: next, lt: horizon },
        status: { not: TaskStatus.done },
      });
    } else if (input.tab === "all") {
      conditions.push({ assigneeId: actor.id });
    } else if (input.tab === "following") {
      conditions.push({
        collaborators: { some: { userId: actor.id, role: "follower" } },
      });
    } else {
      conditions.push({ creatorId: actor.id });
    }

    const filters = this.taskFilters(input);
    if (filters.length) conditions.push(...filters);

    const tasks = await this.prisma.task.findMany({
      where: { AND: conditions },
      include: taskInclude,
      orderBy: [
        { dueDate: { sort: "asc", nulls: "last" } },
        { priority: "asc" },
        { id: "asc" },
      ],
    });
    const visible = tasks.filter((task) => taskIsVisible(actor, task));
    visible.sort((a, b) => {
      if (a.dueDate && b.dueDate && a.dueDate.getTime() !== b.dueDate.getTime())
        return a.dueDate.getTime() - b.dueDate.getTime();
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      const priorityDifference =
        priorityOrder[a.priority] - priorityOrder[b.priority];
      return priorityDifference || a.id.localeCompare(b.id);
    });
    const start = (input.page - 1) * input.pageSize;
    return {
      items: visible
        .slice(start, start + input.pageSize)
        .map((task) => this.toListItem(actor, task)),
      page: input.page,
      pageSize: input.pageSize,
      total: visible.length,
    };
  }

  async listAssignmentQueue(actor: Actor, page: number, pageSize: number) {
    const tasks = await this.prisma.task.findMany({
      where: {
        isGroupAssignment: true,
        assignmentStatus: "assigned",
        assigneeId: null,
        deletedAt: null,
        project: {
          deletedAt: null,
          branch: { organizationId: actor.organizationId },
          members: { some: { userId: actor.id } },
        },
      },
      include: taskInclude,
      orderBy: [
        { dueDate: { sort: "asc", nulls: "last" } },
        { priority: "asc" },
        { id: "asc" },
      ],
    });
    const visible = tasks.filter((task) => taskIsVisible(actor, task));
    const start = (page - 1) * pageSize;
    return {
      items: visible.slice(start, start + pageSize).map((task) => ({
        ...this.toListItem(actor, task),
        version: task.version,
        assignmentLevel: task.assignmentLevel,
        canClaim:
          permissionVisibility(
            actor,
            "task.progress",
            accessResource(actor, task),
          ) === "full",
      })),
      page,
      pageSize,
      total: visible.length,
    };
  }

  async search(actor: Actor, query: string, page: number, pageSize: number) {
    const normalized = query.trim();
    if (!normalized || normalized.length > 100)
      throw new BadRequestException("Từ khóa cần có 1 đến 100 ký tự");
    const branchVisibility =
      actor.systemRole === "branch_director" && actor.branchId
        ? Prisma.sql`OR (
            project."confidentiality" = 'normal'
            AND branch."id" = ${actor.branchId}::uuid
          )`
        : Prisma.empty;
    const departmentVisibility =
      actor.systemRole === "department_head" &&
      actor.managedDepartmentIds.length
        ? Prisma.sql`OR (
            project."confidentiality" = 'normal'
            AND (
              EXISTS (
                SELECT 1 FROM "app_user" AS creator
                WHERE creator."id" = task."creator_id"
                  AND creator."department_id" IN (
                    ${Prisma.join(actor.managedDepartmentIds.map((id) => Prisma.sql`${id}::uuid`))}
                  )
              )
              OR EXISTS (
                SELECT 1 FROM "app_user" AS assignee
                WHERE assignee."id" = task."assignee_id"
                  AND assignee."department_id" IN (
                    ${Prisma.join(actor.managedDepartmentIds.map((id) => Prisma.sql`${id}::uuid`))}
                  )
              )
            )
          )`
        : Prisma.empty;
    const matches = await this.prisma.$queryRaw<
      Array<{
        id: string | null;
        rank: number | null;
        total: number;
        highlight: string | null;
      }>
    >(Prisma.sql`
      WITH query AS MATERIALIZED (
        SELECT plainto_tsquery('simple', qlcv_immutable_unaccent(${normalized})) AS value
      ),
      visible_matches AS MATERIALIZED (
        SELECT task."id",
          ts_rank_cd(task."search_vector", query.value)::float8 AS "rank"
        FROM "task" AS task
        JOIN "project" AS project ON project."id" = task."project_id"
        JOIN "branch" AS branch ON branch."id" = project."branch_id"
        CROSS JOIN query
        WHERE branch."organization_id" = ${actor.organizationId}::uuid
          AND project."deleted_at" IS NULL
          AND task."deleted_at" IS NULL
          AND task."search_vector" @@ query.value
          AND (
            EXISTS (
              SELECT 1 FROM "project_member" AS membership
              WHERE membership."project_id" = project."id"
                AND membership."user_id" = ${actor.id}::uuid
                AND (
                  membership."role" <> 'restricted'
                  OR task."assignee_id" = ${actor.id}::uuid
                  OR task."creator_id" = ${actor.id}::uuid
                )
            )
            ${branchVisibility}
            ${departmentVisibility}
          )
      ),
      page AS MATERIALIZED (
        SELECT "id", "rank"
        FROM visible_matches
        ORDER BY "rank" DESC, "id"
        OFFSET ${(page - 1) * pageSize}
        LIMIT ${pageSize}
      ),
      total AS (
        SELECT count(*)::int AS "count"
        FROM visible_matches
      )
      SELECT page."id"::text AS "id",
        page."rank",
        total."count" AS "total",
        ts_headline(
          'simple',
          qlcv_immutable_unaccent(
            concat_ws(
              ' ',
              task."title",
              task."description",
              (
                SELECT string_agg(comment."body", ' ')
                FROM "comment" AS comment
                WHERE comment."task_id" = task."id"
                  AND comment."hidden_at" IS NULL
              ),
              (
                SELECT string_agg(attachment."file_name", ' ')
                FROM "attachment" AS attachment
                LEFT JOIN "checklist_item" AS checklist
                  ON checklist."id" = attachment."checklist_item_id"
                LEFT JOIN "comment" AS linked_comment
                  ON linked_comment."id" = attachment."comment_id"
                WHERE coalesce(
                  attachment."task_id",
                  checklist."task_id",
                  linked_comment."task_id"
                ) = task."id"
                  AND attachment."deleted_at" IS NULL
                  AND attachment."confirmed_at" IS NOT NULL
              )
            )
          ),
          query.value,
          'StartSel=__QLCV_HL_START__, StopSel=__QLCV_HL_END__, MaxWords=18, MinWords=5, ShortWord=2'
        ) AS "highlight"
      FROM total
      LEFT JOIN page ON TRUE
      LEFT JOIN "task" AS task ON task."id" = page."id"
      CROSS JOIN query
      ORDER BY page."rank" DESC NULLS LAST, page."id"
    `);
    const total = matches[0]?.total ?? 0;
    const pageMatches = matches.filter(
      (
        match,
      ): match is {
        id: string;
        rank: number;
        total: number;
        highlight: string;
      } => match.id !== null && match.rank !== null && match.highlight !== null,
    );
    if (!pageMatches.length) return { items: [], page, pageSize, total };
    const byId = new Map(pageMatches.map((match) => [match.id, match]));
    const tasks = await this.prisma.task.findMany({
      where: {
        id: { in: pageMatches.map((match) => match.id) },
        deletedAt: null,
        project: {
          deletedAt: null,
          branch: { organizationId: actor.organizationId },
        },
      },
      include: taskInclude,
    });
    const visible = tasks
      .filter((task) => taskIsVisible(actor, task))
      .sort(
        (a, b) => (byId.get(b.id)?.rank ?? 0) - (byId.get(a.id)?.rank ?? 0),
      );
    const start = (page - 1) * pageSize;
    return {
      items: visible.slice(start, start + pageSize).map((task) => ({
        ...this.toListItem(actor, task),
        rank: byId.get(task.id)?.rank ?? 0,
        highlight: safeHighlight(byId.get(task.id)?.highlight ?? ""),
      })),
      page,
      pageSize,
      total,
    };
  }

  async listSavedViews(actor: Actor) {
    const views = await this.prisma.savedView.findMany({
      where: {
        OR: [
          { userId: actor.id },
          {
            isShared: true,
            project: {
              deletedAt: null,
              branch: { organizationId: actor.organizationId },
              members: { some: { userId: actor.id } },
            },
          },
        ],
      },
      include: {
        project: {
          include: {
            branch: { select: { id: true, organizationId: true } },
            members: { select: { userId: true, role: true } },
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    return views
      .filter(
        (view) =>
          view.userId === actor.id ||
          (view.project !== null && this.canReadProject(actor, view.project)),
      )
      .map(({ project, ...view }) => ({
        ...view,
        project: project ? { id: project.id, name: project.name } : null,
      }));
  }

  async createSavedView(
    actor: Actor,
    input: {
      name: string;
      filter: Prisma.InputJsonValue;
      viewMode: ViewMode;
      projectId?: string;
      isShared: boolean;
    },
  ) {
    if (input.isShared && !input.projectId)
      throw new BadRequestException("Bộ lọc chia sẻ cần thuộc về một dự án");
    if (input.projectId) {
      const project = await this.findProject(actor, input.projectId);
      if (!this.canReadProject(actor, project)) throw new NotFoundException();
      if (input.isShared && !this.canManageSharedViews(actor, project))
        throw new NotFoundException();
    }
    return this.prisma.savedView.create({
      data: {
        userId: actor.id,
        projectId: input.projectId ?? null,
        name: input.name,
        filter: input.filter,
        viewMode: input.viewMode,
        isShared: input.isShared,
      },
      select: {
        id: true,
        userId: true,
        projectId: true,
        name: true,
        filter: true,
        viewMode: true,
        isShared: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async updateSavedView(
    actor: Actor,
    id: string,
    input: {
      name?: string;
      filter?: Prisma.InputJsonValue;
      viewMode?: ViewMode;
      isShared?: boolean;
    },
  ) {
    const view = await this.prisma.savedView.findUnique({
      where: { id },
      include: { project: { include: accessInclude.project.include } },
    });
    if (!view || view.userId !== actor.id) throw new NotFoundException();
    if (view.project && !this.canReadProject(actor, view.project))
      throw new NotFoundException();
    if (input.isShared === true && !view.projectId)
      throw new BadRequestException("Bộ lọc chia sẻ cần thuộc về một dự án");
    if (
      input.isShared === true &&
      view.project &&
      !this.canManageSharedViews(actor, view.project)
    )
      throw new NotFoundException();
    return this.prisma.savedView.update({
      where: { id },
      data: input,
      select: {
        id: true,
        userId: true,
        projectId: true,
        name: true,
        filter: true,
        viewMode: true,
        isShared: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deleteSavedView(actor: Actor, id: string) {
    const view = await this.prisma.savedView.findUnique({ where: { id } });
    if (!view || view.userId !== actor.id) throw new NotFoundException();
    await this.prisma.savedView.delete({ where: { id } });
    return { id };
  }

  private taskFilters(input: Filters): Prisma.TaskWhereInput[] {
    const filters: Prisma.TaskWhereInput[] = [];
    if (input.assigneeId) filters.push({ assigneeId: input.assigneeId });
    if (input.dueFrom || input.dueTo) {
      filters.push({
        dueDate: {
          ...(input.dueFrom
            ? { gte: new Date(`${input.dueFrom}T00:00:00.000Z`) }
            : {}),
          ...(input.dueTo
            ? { lte: new Date(`${input.dueTo}T23:59:59.999Z`) }
            : {}),
        },
      });
    }
    if (input.statuses?.length)
      filters.push({ status: { in: input.statuses } });
    if (input.projectId) filters.push({ projectId: input.projectId });
    if (input.priorities?.length)
      filters.push({ priority: { in: input.priorities } });
    if (input.labelIds?.length) {
      filters.push({
        labels: { some: { labelId: { in: input.labelIds } } },
      });
    }
    if (input.hasAttachment !== undefined) {
      const hasAttachment: Prisma.TaskWhereInput = {
        OR: [
          {
            attachments: {
              some: { deletedAt: null, confirmedAt: { not: null } },
            },
          },
          {
            checklistItems: {
              some: {
                attachments: {
                  some: { deletedAt: null, confirmedAt: { not: null } },
                },
              },
            },
          },
          {
            comments: {
              some: {
                hiddenAt: null,
                attachments: {
                  some: { deletedAt: null, confirmedAt: { not: null } },
                },
              },
            },
          },
        ],
      };
      filters.push(
        input.hasAttachment ? hasAttachment : { NOT: hasAttachment },
      );
    }
    return filters;
  }

  private toListItem(actor: Actor, task: TaskWithContext) {
    const blockedOn = task.predecessorLinks
      .map(({ predecessor }) => predecessor)
      .filter((predecessor) => taskIsVisible(actor, predecessor))
      .map((predecessor) => ({
        id: predecessor.id,
        title: predecessor.title,
        status: predecessor.status,
      }));
    const affectedMilestones = task.successorLinks
      .map(({ successor }) => successor)
      .filter((successor) => taskIsVisible(actor, successor))
      .map((successor) => ({ id: successor.id, title: successor.title }));
    return {
      id: task.id,
      version: task.version,
      title: task.title,
      project: { id: task.project.id, name: task.project.name },
      dueDate: task.dueDate,
      status: task.status,
      blockedReason: task.blockedReason,
      priority: task.priority,
      assignee: task.assignee
        ? { id: task.assignee.id, name: task.assignee.name }
        : null,
      creator: task.creatorId === actor.id ? "me" : undefined,
      labels: task.labels.map(({ label }) => label),
      hasAttachments: task.attachments.length > 0,
      blockedOn,
      affectedMilestones,
      updatedAt: task.updatedAt,
    };
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
        members: { select: { userId: true, role: true } },
      },
    });
    if (!project) throw new NotFoundException();
    return project;
  }

  private canReadProject(
    actor: Actor,
    project: {
      id: string;
      branchId: string;
      confidentiality: Confidentiality;
      branch: { organizationId: string };
      members: Array<{ userId: string; role: ProjectRole }>;
    },
  ) {
    return (
      permissionVisibility(actor, "project.view", {
        type: "project",
        organizationId: project.branch.organizationId,
        projectId: project.id,
        branchId: project.branchId,
        confidentiality: project.confidentiality,
        projectRole:
          project.members.find((member) => member.userId === actor.id)?.role ??
          null,
      }) === "full"
    );
  }

  private canManageSharedViews(
    actor: Actor,
    project: {
      id: string;
      branchId: string;
      confidentiality: Confidentiality;
      branch: { organizationId: string };
      members: Array<{ userId: string; role: ProjectRole }>;
    },
  ) {
    const role = project.members.find(
      (member) => member.userId === actor.id,
    )?.role;
    if (role === ProjectRole.owner || role === ProjectRole.manager) return true;
    return (
      actor.systemRole === "branch_director" &&
      actor.branchId === project.branchId &&
      project.confidentiality === Confidentiality.normal
    );
  }
}
