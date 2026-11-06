import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  ApprovalRequestStatus,
  Prisma,
  ProjectStatus,
  TaskStatus,
  TaskType,
  UserStatus,
} from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.service";
import { PrismaService } from "../infra/infra.module";

type Actor = AuthenticatedUser;
type DashboardFilters = {
  from: Date;
  to: Date;
  branchId?: string;
  departmentId?: string;
};

const MANAGEMENT_ROLES = new Set([
  "system_admin",
  "executive",
  "branch_director",
  "department_head",
]);

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function completedByDueDate(dueDate: Date | null, completedAt: Date | null) {
  if (!dueDate || !completedAt) return false;
  return completedAt.getTime() < dueDate.getTime() + 86_400_000;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(actor: Actor, filters: DashboardFilters) {
    const managementRole = MANAGEMENT_ROLES.has(actor.systemRole);
    if (!managementRole && (filters.branchId || filters.departmentId)) {
      throw new ForbiddenException("Không có quyền lọc dashboard theo đơn vị");
    }

    const departmentWhere: Prisma.DepartmentWhereInput = {
      organizationId: actor.organizationId,
      ...(filters.branchId &&
      (actor.systemRole === "system_admin" || actor.systemRole === "executive")
        ? { branchId: filters.branchId }
        : {}),
      ...(actor.systemRole === "branch_director"
        ? { branchId: actor.branchId ?? "__none__" }
        : {}),
      ...(actor.systemRole === "department_head"
        ? { id: { in: actor.managedDepartmentIds } }
        : {}),
    };
    const departments = managementRole
      ? await this.prisma.department.findMany({
          where: departmentWhere,
          select: { id: true, name: true, branchId: true },
          orderBy: { name: "asc" },
        })
      : [];
    const departmentIds = departments.map(({ id }) => id);

    if (filters.branchId) {
      const branchAllowed =
        (actor.systemRole === "system_admin" ||
          actor.systemRole === "executive" ||
          actor.systemRole === "branch_director" ||
          (actor.systemRole === "department_head" &&
            departments.some(
              ({ branchId }) => branchId === filters.branchId,
            ))) &&
        (actor.systemRole !== "branch_director" ||
          actor.branchId === filters.branchId);
      if (!branchAllowed)
        throw new ForbiddenException("Không có quyền xem chi nhánh này");
    }
    if (filters.departmentId && !departmentIds.includes(filters.departmentId)) {
      throw new ForbiddenException("Không có quyền xem phòng ban này");
    }

    const visibleDepartmentIds =
      actor.systemRole === "department_head"
        ? departments
            .filter(
              ({ branchId }) =>
                !filters.branchId || branchId === filters.branchId,
            )
            .map(({ id }) => id)
        : departmentIds;
    const selectedDepartmentIds = filters.departmentId
      ? [filters.departmentId]
      : actor.systemRole === "department_head"
        ? visibleDepartmentIds
        : undefined;
    if (
      filters.departmentId &&
      filters.branchId &&
      departments.find(({ id }) => id === filters.departmentId)?.branchId !==
        filters.branchId
    ) {
      throw new ForbiddenException("Phòng ban không thuộc chi nhánh đã chọn");
    }
    const departmentUserIds = selectedDepartmentIds
      ? (
          await this.prisma.user.findMany({
            where: {
              organizationId: actor.organizationId,
              OR: [
                { departmentId: { in: selectedDepartmentIds } },
                {
                  departmentLinks: {
                    some: { departmentId: { in: selectedDepartmentIds } },
                  },
                },
              ],
            },
            select: { id: true },
          })
        ).map(({ id }) => id)
      : undefined;
    const departmentTaskScope: Prisma.TaskWhereInput | undefined =
      departmentUserIds ? { assigneeId: { in: departmentUserIds } } : undefined;
    const visibleUsersWhere: Prisma.UserWhereInput = {
      organizationId: actor.organizationId,
      status: UserStatus.active,
      ...(managementRole
        ? selectedDepartmentIds
          ? {
              OR: [
                { departmentId: { in: selectedDepartmentIds } },
                {
                  departmentLinks: {
                    some: { departmentId: { in: selectedDepartmentIds } },
                  },
                },
              ],
            }
          : actor.systemRole === "branch_director"
            ? { branchId: actor.branchId ?? "__none__" }
            : filters.branchId
              ? { branchId: filters.branchId }
              : {}
        : { id: actor.id }),
    };

    const projectScopes: Prisma.ProjectWhereInput[] = [
      {
        OR: [
          { confidentiality: "normal" },
          { members: { some: { userId: actor.id } } },
        ],
      },
    ];
    if (selectedDepartmentIds) {
      projectScopes.push({
        OR: [
          {
            owner: {
              OR: [
                { departmentId: { in: selectedDepartmentIds } },
                {
                  departmentLinks: {
                    some: { departmentId: { in: selectedDepartmentIds } },
                  },
                },
              ],
            },
          },
          {
            tasks: {
              some: {
                deletedAt: null,
                ...departmentTaskScope,
              },
            },
          },
        ],
      });
    }
    if (actor.systemRole === "member") {
      projectScopes.push({
        OR: [
          { ownerId: actor.id },
          { members: { some: { userId: actor.id } } },
          {
            tasks: {
              some: { deletedAt: null, assigneeId: actor.id },
            },
          },
        ],
      });
    }
    const projectWhere: Prisma.ProjectWhereInput = {
      deletedAt: null,
      branch: { organizationId: actor.organizationId },
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
      ...(actor.systemRole === "branch_director"
        ? { branchId: actor.branchId ?? "__none__" }
        : {}),
      AND: projectScopes,
    };
    const projects = await this.prisma.project.findMany({
      where: projectWhere,
      select: {
        id: true,
        name: true,
        branchId: true,
        ownerId: true,
        status: true,
        dueDate: true,
        branch: { select: { name: true } },
      },
    });
    const projectIds = projects.map(({ id }) => id);
    const managedMemberProjects =
      actor.systemRole === "member" && projectIds.length
        ? await this.prisma.projectMember.findMany({
            where: {
              userId: actor.id,
              role: { in: ["owner", "manager"] },
              projectId: { in: projectIds },
            },
            select: { projectId: true },
          })
        : [];
    const managedMemberProjectIds = new Set(
      managedMemberProjects.map(({ projectId }) => projectId),
    );
    const managedProjectIds =
      actor.systemRole === "member"
        ? projects
            .filter(
              (project) =>
                project.ownerId === actor.id ||
                managedMemberProjectIds.has(project.id),
            )
            .map(({ id }) => id)
        : [];
    const managedProjectMembers = managedProjectIds.length
      ? await this.prisma.projectMember.findMany({
          where: { projectId: { in: managedProjectIds } },
          select: { userId: true },
        })
      : [];
    const managedProjectUserIds = [
      ...new Set([
        actor.id,
        ...projects
          .filter(({ id }) => managedProjectIds.includes(id))
          .map(({ ownerId }) => ownerId),
        ...managedProjectMembers.map(({ userId }) => userId),
      ]),
    ];
    const taskWhere: Prisma.TaskWhereInput = {
      projectId: { in: projectIds },
      deletedAt: null,
      type: { in: [TaskType.task, TaskType.milestone] },
      ...(actor.systemRole === "member"
        ? {
            OR: [
              { assigneeId: actor.id },
              ...(managedProjectIds.length
                ? [{ projectId: { in: managedProjectIds } }]
                : []),
            ],
          }
        : {}),
      ...departmentTaskScope,
    };
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const nextWeek = new Date(today);
    nextWeek.setUTCDate(nextWeek.getUTCDate() + 6);
    const openStatuses = [
      TaskStatus.todo,
      TaskStatus.doing,
      TaskStatus.blocked,
    ];
    const [statusGroups, overdueGroups, dueSoonGroups, workloads, completed] =
      projectIds.length
        ? await Promise.all([
            this.prisma.task.groupBy({
              by: ["status"],
              where: taskWhere,
              _count: { _all: true },
            }),
            this.prisma.task.groupBy({
              by: ["projectId"],
              where: {
                ...taskWhere,
                status: { in: openStatuses },
                dueDate: { lt: today },
              },
              _count: { _all: true },
            }),
            this.prisma.task.groupBy({
              by: ["projectId"],
              where: {
                ...taskWhere,
                status: { in: openStatuses },
                dueDate: { gte: today, lte: nextWeek },
              },
              _count: { _all: true },
            }),
            this.prisma.task.groupBy({
              by: ["assigneeId", "status"],
              where: {
                ...taskWhere,
                assigneeId: { not: null },
                status: { in: openStatuses },
              },
              _count: { _all: true },
            }),
            this.prisma.task.findMany({
              where: {
                ...taskWhere,
                status: TaskStatus.done,
                completedAt: { gte: filters.from, lte: filters.to },
                dueDate: { not: null },
              },
              select: { dueDate: true, completedAt: true },
            }),
          ])
        : [[], [], [], [], []];
    const overdueByProject = new Map(
      overdueGroups.map(({ projectId, _count }) => [projectId, _count._all]),
    );
    const dueSoonByProject = new Map(
      dueSoonGroups.map(({ projectId, _count }) => [projectId, _count._all]),
    );
    const activeProjects = projects.filter(
      ({ status }) => status === ProjectStatus.active,
    );
    const projectHealth = {
      red: activeProjects.filter(
        ({ id }) => (overdueByProject.get(id) ?? 0) > 0,
      ).length,
      yellow: activeProjects.filter(
        ({ id }) =>
          (overdueByProject.get(id) ?? 0) === 0 &&
          (dueSoonByProject.get(id) ?? 0) > 0,
      ).length,
      green: activeProjects.filter(
        ({ id }) =>
          (overdueByProject.get(id) ?? 0) === 0 &&
          (dueSoonByProject.get(id) ?? 0) === 0,
      ).length,
    };
    const taskStatuses = ["todo", "doing", "blocked", "done"] as const;
    const tasksByStatus = taskStatuses.map((status) => ({
      status,
      count:
        statusGroups.find((group) => group.status === status)?._count._all ?? 0,
    }));
    const overdueTaskCount = sum(
      overdueGroups.map(({ _count }) => _count._all),
    );

    const allowedBranches = await this.prisma.branch.findMany({
      where: {
        organizationId: actor.organizationId,
        ...(actor.systemRole === "member"
          ? {
              id: {
                in: [...new Set(projects.map(({ branchId }) => branchId))],
              },
            }
          : {}),
        ...(actor.systemRole === "branch_director"
          ? { id: actor.branchId ?? "__none__" }
          : {}),
        ...(filters.branchId ? { id: filters.branchId } : {}),
        ...(selectedDepartmentIds
          ? { departments: { some: { id: { in: selectedDepartmentIds } } } }
          : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const branchCounts = new Map<
      string,
      { projects: number; overdueTasks: number }
    >();
    for (const project of projects) {
      const entry = branchCounts.get(project.branchId) ?? {
        projects: 0,
        overdueTasks: 0,
      };
      if (
        project.status !== ProjectStatus.completed &&
        project.status !== ProjectStatus.archived
      ) {
        entry.projects += 1;
      }
      entry.overdueTasks += overdueByProject.get(project.id) ?? 0;
      branchCounts.set(project.branchId, entry);
    }

    const workloadUsers = await this.prisma.user.findMany({
      where:
        actor.systemRole === "member" && managedProjectIds.length
          ? {
              organizationId: actor.organizationId,
              status: UserStatus.active,
              id: { in: managedProjectUserIds },
            }
          : visibleUsersWhere,
      select: {
        id: true,
        name: true,
        departmentId: true,
        departmentLinks: {
          where: selectedDepartmentIds
            ? { departmentId: { in: selectedDepartmentIds } }
            : {},
          select: { departmentId: true },
          orderBy: { departmentId: "asc" },
        },
      },
    });
    const workloadByPerson = workloadUsers.map((user) => {
      const ownTasks = workloads.filter(
        ({ assigneeId }) => assigneeId === user.id,
      );
      const personDepartmentIds = [
        ...new Set([
          ...(user.departmentId ? [user.departmentId] : []),
          ...user.departmentLinks.map(({ departmentId }) => departmentId),
        ]),
      ].filter(
        (id) => !selectedDepartmentIds || selectedDepartmentIds.includes(id),
      );
      return {
        userId: user.id,
        name: user.name,
        departmentId:
          (user.departmentId && personDepartmentIds.includes(user.departmentId)
            ? user.departmentId
            : personDepartmentIds[0]) ?? null,
        departmentIds: personDepartmentIds,
        total: sum(ownTasks.map(({ _count }) => _count._all)),
        byStatus: Object.fromEntries(
          openStatuses.map((status) => [
            status,
            ownTasks.find((item) => item.status === status)?._count._all ?? 0,
          ]),
        ),
      };
    });
    const workloadByDepartment = departments
      .filter(({ id }) => !filters.departmentId || filters.departmentId === id)
      .map((department) => {
        const people = workloadByPerson.filter(({ departmentIds }) =>
          departmentIds.includes(department.id),
        );
        return {
          departmentId: department.id,
          name: department.name,
          total: sum(people.map(({ total }) => total)),
          byStatus: Object.fromEntries(
            openStatuses.map((status) => [
              status,
              sum(
                people.map(
                  ({ byStatus }) => byStatus[status as keyof typeof byStatus],
                ),
              ),
            ]),
          ),
        };
      });

    const visibleUserIds = (
      await this.prisma.user.findMany({
        where: visibleUsersWhere,
        select: { id: true },
      })
    ).map(({ id }) => id);
    const [
      assignmentEvents,
      extensionRequests,
      commentCount,
      commentedTasks,
      templateGroups,
      activeUsers,
      notificationCounts,
      pendingApprovals,
    ] = projectIds.length
      ? await Promise.all([
          this.prisma.taskAssignmentEvent.groupBy({
            by: ["action"],
            where: {
              projectId: { in: projectIds },
              task: taskWhere,
              createdAt: { gte: filters.from, lte: filters.to },
            },
            _count: { _all: true },
          }),
          this.prisma.assignmentExtensionRequest.count({
            where: {
              projectId: { in: projectIds },
              task: taskWhere,
              createdAt: { gte: filters.from, lte: filters.to },
              ...(actor.systemRole === "member"
                ? { requesterId: actor.id }
                : {}),
            },
          }),
          this.prisma.comment.count({
            where: {
              task: taskWhere,
              hiddenAt: null,
              createdAt: { gte: filters.from, lte: filters.to },
              ...(actor.systemRole === "member" ? { authorId: actor.id } : {}),
            },
          }),
          this.prisma.comment.groupBy({
            by: ["taskId"],
            where: {
              task: taskWhere,
              hiddenAt: null,
              createdAt: { gte: filters.from, lte: filters.to },
              ...(actor.systemRole === "member" ? { authorId: actor.id } : {}),
            },
            _count: { _all: true },
          }),
          this.prisma.templateUsage.groupBy({
            by: ["templateId"],
            where: {
              projectId: { in: projectIds },
              createdAt: { gte: filters.from, lte: filters.to },
              ...(actor.systemRole === "member"
                ? { appliedById: actor.id }
                : {}),
            },
            _count: { _all: true },
          }),
          this.prisma.user.count({
            where: {
              ...visibleUsersWhere,
              lastLoginAt: { gte: filters.from, lte: filters.to },
            },
          }),
          this.prisma.notification
            .aggregate({
              where: {
                userId: { in: visibleUserIds },
                createdAt: { gte: filters.from, lte: filters.to },
              },
              _count: { _all: true },
            })
            .then(async ({ _count }) => ({
              sent: _count._all,
              read: await this.prisma.notification.count({
                where: {
                  userId: { in: visibleUserIds },
                  createdAt: { gte: filters.from, lte: filters.to },
                  readAt: { not: null },
                },
              }),
            })),
          this.prisma.approvalRequest.findMany({
            where: {
              projectId: { in: projectIds },
              status: ApprovalRequestStatus.pending,
              ...(actor.systemRole === "member"
                ? {
                    OR: [
                      { requesterId: actor.id },
                      { currentApproverId: actor.id },
                    ],
                  }
                : {}),
            },
            select: {
              currentStep: true,
              updatedAt: true,
              subjectId: true,
              subjectType: true,
              flow: { select: { steps: true } },
            },
          }),
        ])
      : [[], 0, 0, [], [], 0, { sent: 0, read: 0 }, []];

    const eventCount = (action: string) =>
      assignmentEvents.find((event) => event.action === action)?._count._all ??
      0;
    const assignments = eventCount("assign") + eventCount("reassign");
    const submissions = eventCount("submit");
    const projectIdsSql = Prisma.join(
      projectIds.map((projectId) => Prisma.sql`${projectId}::uuid`),
    );
    const taskScopeSqlParts = [
      Prisma.sql`t.deleted_at IS NULL`,
      Prisma.sql`t.type IN ('task', 'milestone')`,
    ];
    if (actor.systemRole === "member") {
      taskScopeSqlParts.push(
        managedProjectIds.length
          ? Prisma.sql`(
              t.assignee_id = ${actor.id}::uuid
              OR t.project_id IN (${Prisma.join(
                managedProjectIds.map(
                  (projectId) => Prisma.sql`${projectId}::uuid`,
                ),
              )})
            )`
          : Prisma.sql`t.assignee_id = ${actor.id}::uuid`,
      );
    }
    if (departmentUserIds) {
      const departmentUserIdsSql = Prisma.join(
        departmentUserIds.map((userId) => Prisma.sql`${userId}::uuid`),
      );
      taskScopeSqlParts.push(
        Prisma.sql`(
          t.assignee_id IN (${departmentUserIdsSql})
        )`,
      );
    }
    const taskScopeSql = Prisma.join(taskScopeSqlParts, " AND ");
    const averageResponse = projectIds.length
      ? await this.prisma.$queryRaw<
          { average_minutes: number | null; matched_count: number }[]
        >(Prisma.sql`
          WITH matched_responses AS (
            SELECT DISTINCT ON (e.id)
              e.id,
              EXTRACT(EPOCH FROM (e.created_at - a.created_at)) / 60.0 AS minutes
            FROM task_assignment_event e
            JOIN task_assignment_event a
              ON a.task_id = e.task_id
             AND a.project_id IN (${projectIdsSql})
             AND a.action IN ('assign', 'reassign')
             AND a.created_at < e.created_at
             AND a.created_at >= ${filters.from}
             AND a.created_at <= ${filters.to}
            JOIN task t ON t.id = e.task_id
            WHERE e.project_id IN (${projectIdsSql})
              AND e.action IN ('accept', 'reject')
              AND e.created_at >= ${filters.from}
              AND e.created_at <= ${filters.to}
              AND ${taskScopeSql}
            ORDER BY e.id, a.created_at DESC
          )
          SELECT
            AVG(minutes)::float8 AS average_minutes,
            COUNT(*)::int AS matched_count
          FROM matched_responses
        `)
      : [{ average_minutes: null, matched_count: 0 }];
    const templateIds = templateGroups.map(({ templateId }) => templateId);
    const templates = templateIds.length
      ? await this.prisma.template.findMany({
          where: { id: { in: templateIds } },
          select: { id: true, name: true },
        })
      : [];
    const templateUsage = templateGroups.map(({ templateId, _count }) => ({
      templateId,
      name: templates.find(({ id }) => id === templateId)?.name ?? "Mẫu đã xóa",
      count: _count._all,
    }));
    const pendingTaskSubjectIds = pendingApprovals
      .filter(({ subjectType }) => subjectType === "task")
      .map(({ subjectId }) => subjectId);
    const visibleTaskSubjectIds =
      selectedDepartmentIds || actor.systemRole === "member"
        ? new Set(
            pendingTaskSubjectIds.length
              ? (
                  await this.prisma.task.findMany({
                    where: {
                      id: { in: pendingTaskSubjectIds },
                      ...taskWhere,
                    },
                    select: { id: true },
                  })
                ).map(({ id }) => id)
              : [],
          )
        : undefined;
    const currentTime = new Date();
    const approvalStats = pendingApprovals.reduce(
      (stats, request) => {
        if (
          request.subjectType === "task" &&
          visibleTaskSubjectIds &&
          !visibleTaskSubjectIds.has(request.subjectId)
        ) {
          return stats;
        }
        const steps = request.flow.steps;
        const stepValue = Array.isArray(steps)
          ? steps[request.currentStep]
          : null;
        const slaHours =
          stepValue !== null &&
          typeof stepValue === "object" &&
          !Array.isArray(stepValue) &&
          "slaHours" in stepValue &&
          typeof stepValue.slaHours === "number"
            ? stepValue.slaHours
            : null;
        stats.pending += 1;
        if (
          slaHours !== null &&
          request.updatedAt.getTime() + slaHours * 60 * 60 * 1000 <
            currentTime.getTime()
        ) {
          stats.overdue += 1;
        }
        return stats;
      },
      { pending: 0, overdue: 0 },
    );

    if (managementRole || managedProjectIds.length > 0) {
      await this.prisma.activityLog.create({
        data: {
          entityType: "dashboard",
          entityId: actor.id,
          actorId: actor.id,
          action: "dashboard.individual_kpi_viewed",
          after: {
            branchId: filters.branchId ?? null,
            departmentId: filters.departmentId ?? null,
            from: filters.from.toISOString(),
            to: filters.to.toISOString(),
          },
        },
      });
    }

    return {
      period: {
        from: filters.from.toISOString(),
        to: filters.to.toISOString(),
      },
      filters: {
        branches: allowedBranches,
        departments: departments.map(({ id, name, branchId }) => ({
          id,
          name,
          branchId,
        })),
        selectedBranchId: filters.branchId ?? null,
        selectedDepartmentId: filters.departmentId ?? null,
      },
      projects: {
        total: activeProjects.length,
        health: projectHealth,
        byBranch: allowedBranches.map(({ id, name }) => ({
          branchId: id,
          branchName: name,
          ...(branchCounts.get(id) ?? { projects: 0, overdueTasks: 0 }),
        })),
      },
      tasks: {
        byStatus: tasksByStatus,
        overdue: overdueTaskCount,
        dueSoon: sum(dueSoonGroups.map(({ _count }) => _count._all)),
        onTimeCompletionRate:
          completed.length === 0
            ? 0
            : completed.filter(({ dueDate, completedAt }) =>
                completedByDueDate(dueDate, completedAt),
              ).length / completed.length,
        completedOnTime:
          completed.length === 0
            ? 0
            : completed.filter(({ dueDate, completedAt }) =>
                completedByDueDate(dueDate, completedAt),
              ).length,
        completedWithDueDate: completed.length,
      },
      workload: {
        departments: workloadByDepartment,
        people: workloadByPerson,
      },
      approvals: approvalStats,
      assignment: {
        averageResponseMinutes: averageResponse[0]?.average_minutes ?? null,
        responses: averageResponse[0]?.matched_count ?? 0,
        returns: eventCount("return"),
        returnRate: submissions === 0 ? 0 : eventCount("return") / submissions,
        rejections: eventCount("reject"),
        rejectionRate:
          assignments === 0 ? 0 : eventCount("reject") / assignments,
        extensionRequests,
      },
      collaboration: {
        comments: commentCount,
        tasksWithComments: commentedTasks.length,
      },
      templates: { usage: templateUsage },
      system: {
        activeUsers,
        notificationsSent: notificationCounts.sent,
        notificationsRead: notificationCounts.read,
        notificationReadRate:
          notificationCounts.sent === 0
            ? 0
            : notificationCounts.read / notificationCounts.sent,
      },
      projectsList: projects.map(({ id, name, status }) => ({
        id,
        name,
        status,
        overdueTasks: overdueByProject.get(id) ?? 0,
      })),
    };
  }
}
