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
    ForbiddenException: class extends HttpError {
      constructor(message = "Forbidden") {
        super(message, 403);
      }
    },
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
import { Prisma, PrismaClient, ProjectRole } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.service";
import type { PrismaService } from "../infra/infra.module";
import { ReportsService } from "./reports.service";

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

afterAll(async () => prisma.$disconnect());

function reportsServiceFor(tx: Prisma.TransactionClient) {
  const client = {
    project: tx.project,
    projectMember: tx.projectMember,
    projectBaseline: tx.projectBaseline,
    task: tx.task,
    approvalRequest: tx.approvalRequest,
    activityLog: tx.activityLog,
    label: tx.label,
    $transaction: <T>(
      callback: (transaction: Prisma.TransactionClient) => Promise<T>,
    ) => callback(tx),
  };
  return new ReportsService(client as unknown as PrismaService);
}

describe("ReportsService (database)", () => {
  it("saves a named baseline and reports task date drift", async () => {
    await inRollback(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: `Reports ${randomUUID()}` },
      });
      const branch = await tx.branch.create({
        data: { organizationId: organization.id, name: "Branch" },
      });
      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: `${randomUUID()}@example.test`,
          name: "Project owner",
        },
      });
      const project = await tx.project.create({
        data: {
          branchId: branch.id,
          ownerId: user.id,
          name: "Report test",
          baselineEnabled: true,
        },
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
      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId: user.id,
          role: ProjectRole.owner,
        },
      });
      const task = await tx.task.create({
        data: {
          projectId: project.id,
          creatorId: user.id,
          position: "a0",
          title: "Baseline task",
          startDate: new Date("2026-11-06T00:00:00.000Z"),
          dueDate: new Date("2026-11-10T00:00:00.000Z"),
          durationDays: 3,
          progress: 10,
        },
      });
      const service = reportsServiceFor(tx);
      await expect(
        service.createBaseline(actor, project.id, "Approved plan"),
      ).resolves.toMatchObject({ name: "Approved plan", taskCount: 1 });
      await tx.task.update({
        where: { id: task.id },
        data: { dueDate: new Date("2026-11-12T00:00:00.000Z"), progress: 25 },
      });
      await expect(service.listBaselines(actor, project.id)).resolves.toEqual([
        expect.objectContaining({
          name: "Approved plan",
          changedCount: 1,
          changes: [
            expect.objectContaining({
              title: "Baseline task",
              baselineDueDate: "2026-11-10",
              currentDueDate: "2026-11-12",
              baselineProgress: 10,
              currentProgress: 25,
            }),
          ],
        }),
      ]);
    });
  });

  it("blocks confidential export without approval and audits both outcomes", async () => {
    await inRollback(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: `Confidential ${randomUUID()}` },
      });
      const branch = await tx.branch.create({
        data: { organizationId: organization.id, name: "Branch" },
      });
      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: `${randomUUID()}@example.test`,
          name: "Project owner",
        },
      });
      const project = await tx.project.create({
        data: {
          branchId: branch.id,
          ownerId: user.id,
          name: "Restricted project",
          confidentiality: "restricted",
        },
      });
      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId: user.id,
          role: ProjectRole.owner,
        },
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
      const service = reportsServiceFor(tx);
      await expect(
        service.exportProjectData(actor, project.id, "json"),
      ).rejects.toMatchObject({ status: 403 });
      await tx.approvalFlow
        .create({
          data: {
            projectId: project.id,
            creatorId: user.id,
            name: "Confidential export",
            requestType: "confidential_export",
            steps: [{ role: "owner", slaHours: 24 }],
          },
        })
        .then(async (flow) => {
          await tx.approvalRequest.create({
            data: {
              projectId: project.id,
              flowId: flow.id,
              requesterId: user.id,
              subjectType: "project",
              subjectId: project.id,
              status: "approved",
            },
          });
        });
      await expect(
        service.exportProjectData(actor, project.id, "json"),
      ).resolves.toMatchObject({
        project: { id: project.id, confidentiality: "restricted" },
        tasks: [],
      });
      await expect(
        tx.activityLog.count({
          where: {
            projectId: project.id,
            action: { in: ["project.export_blocked", "project.data_exported"] },
          },
        }),
      ).resolves.toBe(2);
    });
  });
});
