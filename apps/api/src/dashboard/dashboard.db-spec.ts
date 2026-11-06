jest.mock("@nestjs/common", () => ({
  ForbiddenException: class ForbiddenException extends Error {},
  Injectable: () => () => {},
}));
jest.mock("../infra/infra.module", () => ({
  PrismaService: class PrismaService {},
}));

import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.service";
import type { PrismaService } from "../infra/infra.module";
import { DashboardService } from "./dashboard.service";

const prisma = new PrismaClient();

class Rollback extends Error {}

async function inRollback(
  fn: (tx: Prisma.TransactionClient) => Promise<void>,
  timeout = 20000,
) {
  try {
    await prisma.$transaction(
      async (tx) => {
        await fn(tx);
        throw new Rollback();
      },
      { timeout, maxWait: 10000 },
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
  return new DashboardService(client);
}

function dateOffset(days: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

async function createOrg(tx: Prisma.TransactionClient) {
  const suffix = randomUUID();
  const organization = await tx.organization.create({
    data: { name: `Dashboard ${suffix}` },
  });
  const branch = await tx.branch.create({
    data: { organizationId: organization.id, name: `Branch ${suffix}` },
  });
  const departmentA = await tx.department.create({
    data: {
      organizationId: organization.id,
      branchId: branch.id,
      name: `Department A ${suffix}`,
    },
  });
  const departmentB = await tx.department.create({
    data: {
      organizationId: organization.id,
      branchId: branch.id,
      name: `Department B ${suffix}`,
    },
  });
  const admin = await tx.user.create({
    data: {
      organizationId: organization.id,
      branchId: branch.id,
      departmentId: departmentA.id,
      email: `dashboard-${suffix}@example.test`,
      name: "Dashboard Admin",
      status: "active",
      systemRole: "system_admin",
      lastLoginAt: new Date(),
    },
  });
  const memberA = await tx.user.create({
    data: {
      organizationId: organization.id,
      branchId: branch.id,
      departmentId: departmentA.id,
      email: `dashboard-a-${suffix}@example.test`,
      name: "Department A Member",
      status: "active",
    },
  });
  const memberB = await tx.user.create({
    data: {
      organizationId: organization.id,
      branchId: branch.id,
      departmentId: departmentB.id,
      email: `dashboard-b-${suffix}@example.test`,
      name: "Department B Private Member",
      status: "active",
    },
  });
  const projectA = await tx.project.create({
    data: {
      branchId: branch.id,
      ownerId: admin.id,
      name: `Project A ${suffix}`,
    },
  });
  const projectB = await tx.project.create({
    data: {
      branchId: branch.id,
      ownerId: memberB.id,
      name: `Project B ${suffix}`,
    },
  });
  const actor: AuthenticatedUser = {
    id: admin.id,
    organizationId: organization.id,
    systemRole: "system_admin",
    branchId: branch.id,
    managedDepartmentIds: [],
    email: admin.email,
    name: admin.name,
  };
  return {
    actor,
    admin,
    branch,
    departmentA,
    departmentB,
    memberA,
    memberB,
    projectA,
    projectB,
    organization,
  };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("DashboardService database workflows", () => {
  it("matches hand-calculated task and assignment KPIs and records access", async () => {
    await inRollback(async (tx) => {
      const fixture = await createOrg(tx);
      const onTimeDueDate = dateOffset(-1);
      const completedOnDueDate = new Date(onTimeDueDate);
      completedOnDueDate.setUTCHours(16, 0, 0, 0);
      const overdue = await tx.task.create({
        data: {
          projectId: fixture.projectA.id,
          creatorId: fixture.admin.id,
          assigneeId: fixture.memberA.id,
          title: "Overdue open task",
          position: "000000000001",
          status: "todo",
          dueDate: dateOffset(-1),
        },
      });
      await tx.task.create({
        data: {
          projectId: fixture.projectA.id,
          creatorId: fixture.admin.id,
          assigneeId: fixture.memberA.id,
          title: "Due soon task",
          position: "000000000002",
          status: "doing",
          dueDate: dateOffset(2),
        },
      });
      const onTime = await tx.task.create({
        data: {
          projectId: fixture.projectA.id,
          creatorId: fixture.admin.id,
          assigneeId: fixture.memberA.id,
          title: "Completed on time",
          position: "000000000003",
          status: "done",
          dueDate: onTimeDueDate,
          completedAt: completedOnDueDate,
        },
      });
      await tx.task.create({
        data: {
          projectId: fixture.projectA.id,
          creatorId: fixture.admin.id,
          assigneeId: fixture.memberA.id,
          title: "Completed late",
          position: "000000000004",
          status: "done",
          dueDate: dateOffset(-2),
          completedAt: new Date(Date.now() - 86_400_000),
        },
      });
      const assignedAt = new Date(Date.now() - 90 * 60_000);
      const acceptedAt = new Date(Date.now() - 60 * 60_000);
      await tx.taskAssignmentEvent.createMany({
        data: [
          {
            projectId: fixture.projectA.id,
            taskId: overdue.id,
            actorId: fixture.admin.id,
            action: "assign",
            createdAt: assignedAt,
          },
          {
            projectId: fixture.projectA.id,
            taskId: overdue.id,
            actorId: fixture.memberA.id,
            action: "accept",
            createdAt: acceptedAt,
          },
          {
            projectId: fixture.projectA.id,
            taskId: onTime.id,
            actorId: fixture.admin.id,
            action: "submit",
            createdAt: new Date(Date.now() - 50 * 60_000),
          },
          {
            projectId: fixture.projectA.id,
            taskId: onTime.id,
            actorId: fixture.admin.id,
            action: "return",
            createdAt: new Date(Date.now() - 40 * 60_000),
          },
          {
            projectId: fixture.projectA.id,
            taskId: onTime.id,
            actorId: fixture.admin.id,
            action: "submit",
            createdAt: new Date(Date.now() - 30 * 60_000),
          },
        ],
      });

      const result = await serviceFor(tx).getDashboard(fixture.actor, {
        from: new Date(Date.now() - 7 * 86_400_000),
        to: new Date(Date.now() + 1000),
      });

      expect(result.tasks.overdue).toBe(1);
      expect(result.tasks.dueSoon).toBe(1);
      expect(result.tasks.completedOnTime).toBe(1);
      expect(result.tasks.completedWithDueDate).toBe(2);
      expect(result.tasks.onTimeCompletionRate).toBe(0.5);
      expect(result.assignment.averageResponseMinutes).toBeCloseTo(30, 0);
      expect(result.assignment.responses).toBe(1);
      expect(result.assignment.returnRate).toBe(0.5);
      expect(result.projects.health).toEqual({ red: 1, yellow: 0, green: 1 });
      expect(
        await tx.activityLog.count({
          where: {
            actorId: fixture.admin.id,
            action: "dashboard.individual_kpi_viewed",
          },
        }),
      ).toBe(1);
    });
  });

  it("limits department heads to their managed department and rejects other filters", async () => {
    await inRollback(async (tx) => {
      const fixture = await createOrg(tx);
      await tx.task.create({
        data: {
          projectId: fixture.projectA.id,
          creatorId: fixture.admin.id,
          assigneeId: fixture.memberA.id,
          title: "Department A task",
          position: "000000000001",
        },
      });
      await tx.task.create({
        data: {
          projectId: fixture.projectB.id,
          creatorId: fixture.memberB.id,
          assigneeId: fixture.memberB.id,
          title: "Department B task",
          position: "000000000001",
        },
      });
      const departmentHead: AuthenticatedUser = {
        ...fixture.actor,
        systemRole: "department_head",
        managedDepartmentIds: [fixture.departmentA.id],
      };

      const result = await serviceFor(tx).getDashboard(departmentHead, {
        from: new Date(Date.now() - 7 * 86_400_000),
        to: new Date(Date.now() + 1000),
      });

      expect(result.projectsList.map(({ id }) => id)).toEqual([
        fixture.projectA.id,
      ]);
      expect(result.workload.people.map(({ userId }) => userId)).toEqual(
        expect.arrayContaining([fixture.admin.id, fixture.memberA.id]),
      );
      await expect(
        serviceFor(tx).getDashboard(departmentHead, {
          from: new Date(Date.now() - 7 * 86_400_000),
          to: new Date(Date.now() + 1000),
          departmentId: fixture.departmentB.id,
        }),
      ).rejects.toThrow("Không có quyền xem phòng ban này");
    });
  });

  it("limits organization-level individual rows to the selected branch", async () => {
    await inRollback(async (tx) => {
      const fixture = await createOrg(tx);
      const otherBranch = await tx.branch.create({
        data: {
          organizationId: fixture.organization.id,
          name: `Other branch ${randomUUID()}`,
        },
      });
      const otherDepartment = await tx.department.create({
        data: {
          organizationId: fixture.organization.id,
          branchId: otherBranch.id,
          name: `Other department ${randomUUID()}`,
        },
      });
      const otherUser = await tx.user.create({
        data: {
          organizationId: fixture.organization.id,
          branchId: otherBranch.id,
          departmentId: otherDepartment.id,
          email: `other-branch-${randomUUID()}@example.test`,
          name: "Other Branch Private User",
          status: "active",
        },
      });

      const result = await serviceFor(tx).getDashboard(fixture.actor, {
        from: new Date(Date.now() - 7 * 86_400_000),
        to: new Date(Date.now() + 1000),
        branchId: fixture.branch.id,
      });

      expect(result.workload.people.map(({ userId }) => userId)).not.toContain(
        otherUser.id,
      );
      expect(result.filters.branches.map(({ id }) => id)).toEqual([
        fixture.branch.id,
      ]);
    });
  });

  it("shows a project owner's scoped team workload and audits individual access", async () => {
    await inRollback(async (tx) => {
      const fixture = await createOrg(tx);
      const project = await tx.project.create({
        data: {
          branchId: fixture.branch.id,
          ownerId: fixture.memberA.id,
          name: `Member-owned project ${randomUUID()}`,
        },
      });
      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId: fixture.memberA.id,
          role: "owner",
        },
      });
      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId: fixture.memberB.id,
          role: "member",
        },
      });
      await tx.task.create({
        data: {
          projectId: project.id,
          creatorId: fixture.memberA.id,
          assigneeId: fixture.memberB.id,
          title: "Team workload",
          position: "000000000001",
        },
      });
      const projectOwner: AuthenticatedUser = {
        ...fixture.actor,
        id: fixture.memberA.id,
        systemRole: "member",
        email: fixture.memberA.email,
        name: fixture.memberA.name,
      };

      const result = await serviceFor(tx).getDashboard(projectOwner, {
        from: new Date(Date.now() - 7 * 86_400_000),
        to: new Date(Date.now() + 1000),
      });

      expect(result.workload.people).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ userId: fixture.memberB.id, total: 1 }),
        ]),
      );
      expect(
        await tx.activityLog.count({
          where: {
            actorId: fixture.memberA.id,
            action: "dashboard.individual_kpi_viewed",
          },
        }),
      ).toBe(1);
    });
  });

  const benchmark = process.env.RUN_DASHBOARD_BENCHMARK === "1" ? it : it.skip;
  benchmark(
    "keeps dashboard aggregation within the configured 100,000-task budget",
    async () => {
      const taskCount = 100_000;
      const budgetMs = Number(process.env.DASHBOARD_BENCHMARK_MAX_MS ?? 5000);
      await inRollback(async (tx) => {
        const fixture = await createOrg(tx);
        for (let start = 0; start < taskCount; start += 2000) {
          const batch = Array.from(
            { length: Math.min(2000, taskCount - start) },
            (_, offset) => {
              const index = start + offset;
              return {
                projectId: fixture.projectA.id,
                creatorId: fixture.admin.id,
                assigneeId: fixture.memberA.id,
                title: `Benchmark ${index}`,
                position: index.toString(36).padStart(12, "0"),
                status: "todo" as const,
              };
            },
          );
          await tx.task.createMany({ data: batch });
        }

        const startedAt = performance.now();
        const result = await serviceFor(tx).getDashboard(fixture.actor, {
          from: new Date(Date.now() - 7 * 86_400_000),
          to: new Date(),
        });
        const elapsedMs = performance.now() - startedAt;
        console.info(
          `Dashboard benchmark: ${taskCount} tasks, ${elapsedMs.toFixed(0)}ms (budget ${budgetMs}ms)`,
        );
        expect(
          result.tasks.byStatus.find(({ status }) => status === "todo")?.count,
        ).toBe(taskCount);
        expect(elapsedMs).toBeLessThan(budgetMs);
      }, 180000);
    },
    180000,
  );
});
