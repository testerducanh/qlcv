jest.mock("@nestjs/common", () => {
  class HttpError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }
  return {
    BadRequestException: class extends HttpError {
      constructor(message = "Bad request") {
        super(message, 400);
      }
    },
    ConflictException: class extends HttpError {
      constructor(message = "Conflict") {
        super(message, 409);
      }
    },
    ForbiddenException: class extends HttpError {
      constructor(message = "Forbidden") {
        super(message, 403);
      }
    },
    Injectable: () => () => {},
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
import { ApprovalsService } from "./approvals.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import type { PrismaService } from "../infra/infra.module";

const prisma = new PrismaClient();

class Rollback extends Error {}

async function inRollback(fn: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await prisma.$transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

afterAll(async () => prisma.$disconnect());

describe("ApprovalsService database workflows", () => {
  it("runs a two-step approval in order and notifies the step owners", async () => {
    await inRollback(async (tx) => {
      const suffix = randomUUID();
      const org = await tx.organization.create({ data: { name: suffix } });
      const branch = await tx.branch.create({
        data: { organizationId: org.id, name: suffix },
      });
      const users = await Promise.all(
        ["requester", "first", "second"].map((name) =>
          tx.user.create({
            data: {
              organizationId: org.id,
              branchId: branch.id,
              email: `${name}-${suffix}@example.test`,
              name,
              status: "active",
            },
          }),
        ),
      );
      const [requester, first, second] = users;
      const project = await tx.project.create({
        data: {
          branchId: branch.id,
          ownerId: requester.id,
          name: suffix,
        },
      });
      await tx.projectMember.createMany({
        data: [
          {
            projectId: project.id,
            userId: requester.id,
            role: ProjectRole.owner,
          },
          { projectId: project.id, userId: first.id, role: ProjectRole.member },
          {
            projectId: project.id,
            userId: second.id,
            role: ProjectRole.member,
          },
        ],
      });
      const actor: AuthenticatedUser = {
        id: requester.id,
        organizationId: org.id,
        systemRole: "member",
        branchId: branch.id,
        managedDepartmentIds: [],
        email: requester.email,
        name: requester.name,
      };
      const txClient = {
        project: tx.project,
        projectMember: tx.projectMember,
        approvalFlow: tx.approvalFlow,
        approvalRequest: tx.approvalRequest,
        approvalStepResult: tx.approvalStepResult,
        approvalDelegation: tx.approvalDelegation,
        notification: tx.notification,
        user: tx.user,
        task: tx.task,
        $transaction: async (
          work: (client: Prisma.TransactionClient) => Promise<unknown>,
        ) => work(tx),
      } as unknown as PrismaService;
      const service = new ApprovalsService(txClient);
      const flow = await service.createFlow(actor, project.id, {
        name: "Two steps",
        requestType: "task_result",
        steps: [
          {
            userId: first.id,
            slaHours: 24,
            canForward: false,
            important: false,
          },
          {
            userId: second.id,
            slaHours: 48,
            canForward: false,
            important: false,
          },
        ],
      });
      const request = await service.createRequest(actor, project.id, {
        flowId: flow.id,
        subjectType: "project",
        subjectId: project.id,
      });
      await expect(
        service.act(actor, project.id, request.id, { action: "approve" }),
      ).rejects.toThrow("Người tạo phiếu không thể tự duyệt");
      await service.act(
        { ...actor, id: first.id, email: first.email, name: first.name },
        project.id,
        request.id,
        { action: "approve" },
      );
      await service.act(
        { ...actor, id: second.id, email: second.email, name: second.name },
        project.id,
        request.id,
        { action: "approve" },
      );
      await expect(
        tx.approvalRequest.findUniqueOrThrow({ where: { id: request.id } }),
      ).resolves.toMatchObject({ status: "approved", currentStep: 1 });
      await expect(
        tx.approvalStepResult.findMany({
          where: { requestId: request.id },
          orderBy: { stepIndex: "asc" },
          select: { actorId: true, stepIndex: true },
        }),
      ).resolves.toEqual([
        { actorId: first.id, stepIndex: 0 },
        { actorId: second.id, stepIndex: 1 },
      ]);
      await expect(
        tx.notification.findMany({
          where: {
            type: "approval.requested",
            payload: { path: ["requestId"], equals: request.id },
          },
          select: { userId: true },
          orderBy: { userId: "asc" },
        }),
      ).resolves.toEqual(
        [{ userId: first.id }, { userId: second.id }].sort((a, b) =>
          a.userId.localeCompare(b.userId),
        ),
      );
    });
  });

  it("publishes a branch template only after its assigned approver approves", async () => {
    await inRollback(async (tx) => {
      const suffix = randomUUID();
      const organization = await tx.organization.create({
        data: { name: `Template approval ${suffix}` },
      });
      const branch = await tx.branch.create({
        data: { organizationId: organization.id, name: `Branch ${suffix}` },
      });
      const requester = await tx.user.create({
        data: {
          organizationId: organization.id,
          branchId: branch.id,
          email: `requester-${suffix}@example.test`,
          name: "Template requester",
          status: "active",
        },
      });
      const approver = await tx.user.create({
        data: {
          organizationId: organization.id,
          branchId: branch.id,
          email: `approver-${suffix}@example.test`,
          name: "Template approver",
          status: "active",
        },
      });
      const project = await tx.project.create({
        data: {
          branchId: branch.id,
          ownerId: requester.id,
          name: `Template approval project ${suffix}`,
        },
      });
      await tx.projectMember.createMany({
        data: [
          {
            projectId: project.id,
            userId: requester.id,
            role: ProjectRole.owner,
          },
          {
            projectId: project.id,
            userId: approver.id,
            role: ProjectRole.manager,
          },
        ],
      });
      const template = await tx.template.create({
        data: {
          organizationId: organization.id,
          createdById: requester.id,
          branchId: branch.id,
          name: `Branch template ${suffix}`,
          kind: "project",
          ownership: "branch",
          status: "draft",
        },
      });
      const requesterActor: AuthenticatedUser = {
        id: requester.id,
        organizationId: organization.id,
        systemRole: "member",
        branchId: branch.id,
        managedDepartmentIds: [],
        email: requester.email,
        name: requester.name,
      };
      const approverActor: AuthenticatedUser = {
        ...requesterActor,
        id: approver.id,
        email: approver.email,
        name: approver.name,
      };
      const txClient = {
        project: tx.project,
        projectMember: tx.projectMember,
        approvalFlow: tx.approvalFlow,
        approvalRequest: tx.approvalRequest,
        approvalStepResult: tx.approvalStepResult,
        approvalDelegation: tx.approvalDelegation,
        notification: tx.notification,
        user: tx.user,
        task: tx.task,
        template: tx.template,
        $transaction: async (
          work: (client: Prisma.TransactionClient) => Promise<unknown>,
        ) => work(tx),
      } as unknown as PrismaService;
      const service = new ApprovalsService(txClient);
      const flow = await service.createFlow(requesterActor, project.id, {
        name: "Branch template review",
        requestType: "template_publish",
        steps: [
          {
            userId: approver.id,
            slaHours: 24,
            canForward: false,
            important: false,
          },
        ],
      });
      const request = await service.createTemplateRequest(
        requesterActor,
        project.id,
        flow.id,
        template.id,
      );
      await expect(
        tx.template.findUniqueOrThrow({ where: { id: template.id } }),
      ).resolves.toMatchObject({ status: "pending_approval" });
      await expect(
        service.act(requesterActor, project.id, request.id, {
          action: "approve",
        }),
      ).rejects.toMatchObject({ status: 403 });
      await service.act(approverActor, project.id, request.id, {
        action: "approve",
      });
      await expect(
        tx.template.findUniqueOrThrow({ where: { id: template.id } }),
      ).resolves.toMatchObject({ status: "published" });
      await expect(
        tx.approvalRequest.findUniqueOrThrow({ where: { id: request.id } }),
      ).resolves.toMatchObject({ status: "approved" });
    });
  });

  it("rejects expired delegation and flow steps without eligible approvers", async () => {
    await inRollback(async (tx) => {
      const suffix = randomUUID();
      const org = await tx.organization.create({ data: { name: suffix } });
      const branch = await tx.branch.create({
        data: { organizationId: org.id, name: suffix },
      });
      const users = await Promise.all(
        ["owner", "grantor", "grantee"].map((name) =>
          tx.user.create({
            data: {
              organizationId: org.id,
              branchId: branch.id,
              email: `${name}-${suffix}@example.test`,
              name,
              status: "active",
            },
          }),
        ),
      );
      const [owner, grantor, grantee] = users;
      const project = await tx.project.create({
        data: { branchId: branch.id, ownerId: owner.id, name: suffix },
      });
      await tx.projectMember.createMany({
        data: [
          { projectId: project.id, userId: owner.id, role: ProjectRole.owner },
          {
            projectId: project.id,
            userId: grantor.id,
            role: ProjectRole.manager,
          },
          {
            projectId: project.id,
            userId: grantee.id,
            role: ProjectRole.member,
          },
        ],
      });
      const actor: AuthenticatedUser = {
        id: owner.id,
        organizationId: org.id,
        systemRole: "member",
        branchId: branch.id,
        managedDepartmentIds: [],
        email: owner.email,
        name: owner.name,
      };
      const service = new ApprovalsService({
        project: tx.project,
        projectMember: tx.projectMember,
        approvalFlow: tx.approvalFlow,
        approvalRequest: tx.approvalRequest,
        approvalStepResult: tx.approvalStepResult,
        approvalDelegation: tx.approvalDelegation,
        notification: tx.notification,
        user: tx.user,
        task: tx.task,
        $transaction: async (
          work: (client: Prisma.TransactionClient) => Promise<unknown>,
        ) => work(tx),
      } as unknown as PrismaService);
      await expect(
        service.createFlow(actor, project.id, {
          name: "Invalid",
          requestType: "task_result",
          steps: [
            {
              slaHours: 24,
              canForward: false,
              important: false,
            },
          ],
        }),
      ).rejects.toThrow(
        "Mỗi bước phải chỉ định duy nhất người duyệt hoặc vai trò",
      );
      const flow = await service.createFlow(actor, project.id, {
        name: "Delegated",
        requestType: "task_result",
        steps: [
          {
            userId: grantor.id,
            slaHours: 24,
            canForward: false,
            important: false,
          },
        ],
      });
      const request = await service.createRequest(actor, project.id, {
        flowId: flow.id,
        subjectType: "project",
        subjectId: project.id,
      });
      await tx.approvalDelegation.create({
        data: {
          grantorId: grantor.id,
          granteeId: grantee.id,
          projectId: project.id,
          startsAt: new Date(Date.now() - 2 * 86400000),
          endsAt: new Date(Date.now() - 86400000),
        },
      });
      await expect(
        service.act(
          {
            ...actor,
            id: grantee.id,
            email: grantee.email,
            name: grantee.name,
          },
          project.id,
          request.id,
          { action: "approve" },
        ),
      ).rejects.toMatchObject({ status: 403 });
    });
  });
});
