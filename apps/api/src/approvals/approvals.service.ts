import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ApprovalRequestStatus, Prisma, ProjectRole } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.service";
import { PrismaService } from "../infra/infra.module";
import {
  isDelegationActive,
  validateApprovalSteps,
  type ApprovalFlowStep,
} from "./approval-rules";

type Actor = AuthenticatedUser;
type RequestType =
  | "task_result"
  | "task_extension"
  | "project_milestone"
  | "phase_gate"
  | "template_publish"
  | "confidential_export"
  | "guest_invite";

function approvalSteps(value: Prisma.JsonValue): ApprovalFlowStep[] {
  if (!Array.isArray(value))
    throw new Error("Approval flow steps must be an array");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Approval flow step is malformed");
    }
    const userId = entry.userId;
    const role = entry.role;
    const slaHours = entry.slaHours;
    const canForward = entry.canForward;
    const important = entry.important;
    if (
      typeof slaHours !== "number" ||
      typeof canForward !== "boolean" ||
      typeof important !== "boolean" ||
      (userId !== undefined && typeof userId !== "string") ||
      (role !== undefined &&
        ![
          "owner",
          "manager",
          "member",
          "restricted",
          "commenter",
          "viewer",
        ].includes(String(role)))
    ) {
      throw new Error("Approval flow step is malformed");
    }
    return {
      ...(typeof userId === "string" ? { userId } : {}),
      ...(typeof role === "string"
        ? { role: role as ApprovalFlowStep["role"] }
        : {}),
      slaHours,
      canForward,
      important,
    };
  });
}

@Injectable()
export class ApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

  async listFlows(actor: Actor, projectId: string) {
    await this.requireProjectMember(actor, projectId);
    return this.prisma.approvalFlow.findMany({
      where: { projectId },
      orderBy: [{ requestType: "asc" }, { name: "asc" }],
    });
  }

  async createFlow(
    actor: Actor,
    projectId: string,
    input: {
      name: string;
      requestType: RequestType;
      steps: ApprovalFlowStep[];
    },
  ) {
    await this.requireProjectManager(actor, projectId);
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, user: { status: "active" } },
      select: { userId: true, role: true },
    });
    try {
      validateApprovalSteps(
        input.steps,
        new Set(members.map((member) => member.userId)),
        new Set(members.map((member) => member.role)),
      );
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      throw new BadRequestException(error.message);
    }
    return this.prisma.approvalFlow.create({
      data: {
        projectId,
        creatorId: actor.id,
        name: input.name,
        requestType: input.requestType,
        steps: JSON.parse(JSON.stringify(input.steps)) as Prisma.InputJsonValue,
      },
    });
  }

  async createRequest(
    actor: Actor,
    projectId: string,
    input: {
      flowId: string;
      subjectType: "task" | "project";
      subjectId: string;
    },
  ) {
    await this.requireProjectMember(actor, projectId);
    const flow = await this.prisma.approvalFlow.findFirst({
      where: { id: input.flowId, projectId, enabled: true },
    });
    if (!flow) throw new NotFoundException();
    if (input.subjectType === "task") {
      const task = await this.prisma.task.findFirst({
        where: { id: input.subjectId, projectId, deletedAt: null },
        select: { id: true },
      });
      if (!task) throw new NotFoundException();
    } else if (input.subjectId !== projectId) {
      throw new BadRequestException("Phiếu dự án phải tham chiếu đúng dự án");
    }
    const request = await this.prisma.approvalRequest.create({
      data: {
        projectId,
        flowId: flow.id,
        requesterId: actor.id,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
      },
    });
    const steps = approvalSteps(flow.steps);
    await this.notifyApprovers(projectId, request.id, steps[0]);
    return request;
  }

  async createTemplateRequest(
    actor: Actor,
    projectId: string,
    flowId: string,
    templateId: string,
  ) {
    await this.requireProjectMember(actor, projectId);
    const [flow, template] = await Promise.all([
      this.prisma.approvalFlow.findFirst({
        where: {
          id: flowId,
          projectId,
          requestType: "template_publish",
          enabled: true,
        },
      }),
      this.prisma.template.findFirst({
        where: {
          id: templateId,
          organizationId: actor.organizationId,
          createdById: actor.id,
          status: "draft",
        },
      }),
    ]);
    if (!flow || !template) throw new NotFoundException();
    const request = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.template.updateMany({
        where: { id: template.id, status: "draft" },
        data: { status: "pending_approval" },
      });
      if (changed.count !== 1) {
        throw new ConflictException("Mẫu vừa được gửi duyệt");
      }
      return tx.approvalRequest.create({
        data: {
          projectId,
          flowId: flow.id,
          requesterId: actor.id,
          subjectType: "template",
          subjectId: template.id,
        },
      });
    });
    await this.notifyApprovers(
      projectId,
      request.id,
      approvalSteps(flow.steps)[0],
    );
    return request;
  }

  async createGuestInviteRequest(
    actor: Actor,
    projectId: string,
    guestAccessId: string,
    flowId: string,
    client?: Prisma.TransactionClient,
  ) {
    await this.requireProjectManager(actor, projectId);
    const db = client ?? this.prisma;
    const [flow, guestAccess] = await Promise.all([
      db.approvalFlow.findFirst({
        where: {
          id: flowId,
          projectId,
          requestType: "guest_invite",
          enabled: true,
        },
      }),
      db.guestAccess.findFirst({
        where: {
          id: guestAccessId,
          projectId,
          status: "pending_approval",
        },
      }),
    ]);
    if (!flow || !guestAccess) throw new NotFoundException();
    const request = await db.approvalRequest.create({
      data: {
        projectId,
        flowId: flow.id,
        requesterId: actor.id,
        subjectType: "guest_invite",
        subjectId: guestAccess.id,
      },
    });
    await this.notifyApprovers(
      projectId,
      request.id,
      approvalSteps(flow.steps)[0],
      db,
    );
    return request;
  }

  async listRequests(actor: Actor, projectId: string) {
    await this.requireProjectMember(actor, projectId);
    return this.prisma.approvalRequest.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: { results: { orderBy: { createdAt: "asc" } } },
    });
  }

  async act(
    actor: Actor,
    projectId: string,
    requestId: string,
    input: {
      action: "approve" | "reject" | "request_changes" | "forward";
      note?: string;
      forwardToUserId?: string;
    },
  ) {
    await this.requireProjectMember(actor, projectId);
    const request = await this.prisma.approvalRequest.findFirst({
      where: {
        id: requestId,
        projectId,
        status: ApprovalRequestStatus.pending,
      },
      include: { flow: true },
    });
    if (!request) throw new NotFoundException();
    if (request.requesterId === actor.id)
      throw new ForbiddenException("Người tạo phiếu không thể tự duyệt");
    const steps = approvalSteps(request.flow.steps);
    const step = steps[request.currentStep];
    if (!step) throw new ConflictException("Bước duyệt không còn hợp lệ");
    let delegatedById: string | undefined;
    const assignedUserId = request.currentApproverId ?? step.userId;
    if (request.currentApproverId) {
      if (request.currentApproverId !== actor.id) {
        delegatedById = await this.activeDelegator(
          actor.id,
          projectId,
          request.currentApproverId,
        );
        if (!delegatedById) throw new ForbiddenException();
      }
    } else if (assignedUserId !== actor.id) {
      if (step.role) {
        const membership = await this.prisma.projectMember.findFirst({
          where: { projectId, userId: actor.id, role: step.role },
        });
        if (membership) {
          delegatedById = undefined;
        } else {
          delegatedById = await this.activeDelegator(actor.id, projectId);
          if (!delegatedById) throw new ForbiddenException();
          const grantor = await this.prisma.projectMember.findFirst({
            where: { projectId, userId: delegatedById, role: step.role },
          });
          if (!grantor) throw new ForbiddenException();
        }
      } else {
        if (!assignedUserId) throw new ForbiddenException();
        delegatedById = await this.activeDelegator(
          actor.id,
          projectId,
          assignedUserId,
        );
        if (!delegatedById) throw new ForbiddenException();
      }
    }
    if (input.action === "forward") {
      if (!step.canForward || !input.forwardToUserId)
        throw new BadRequestException("Bước này không cho phép chuyển tiếp");
      await this.requireActiveMember(projectId, input.forwardToUserId);
    }
    if (
      (input.action === "reject" || input.action === "request_changes") &&
      !input.note?.trim()
    ) {
      throw new BadRequestException("Cần ghi lý do cho thao tác này");
    }
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.approvalStepResult.create({
        data: {
          requestId,
          stepIndex: request.currentStep,
          actorId: actor.id,
          action: input.action,
          note: input.note?.trim() || null,
          delegatedById,
        },
      });
      const finalStatus =
        input.action === "reject"
          ? ApprovalRequestStatus.rejected
          : input.action === "request_changes"
            ? ApprovalRequestStatus.changes_requested
            : input.action === "approve" &&
                request.currentStep === steps.length - 1
              ? ApprovalRequestStatus.approved
              : undefined;
      const next = await tx.approvalRequest.updateMany({
        where: {
          id: requestId,
          projectId,
          status: ApprovalRequestStatus.pending,
          currentStep: request.currentStep,
        },
        data: {
          ...(finalStatus ? { status: finalStatus } : {}),
          ...(input.action === "approve" && !finalStatus
            ? { currentStep: { increment: 1 } }
            : {}),
          ...(input.action === "forward"
            ? { currentApproverId: input.forwardToUserId }
            : {}),
          ...(input.action === "approve" ? { currentApproverId: null } : {}),
          updatedAt: new Date(),
        },
      });
      if (next.count !== 1)
        throw new ConflictException("Phiếu đã được xử lý bởi người khác");
      if (request.subjectType === "template" && finalStatus) {
        const changed = await tx.template.updateMany({
          where: {
            id: request.subjectId,
            status: "pending_approval",
          },
          data: {
            status:
              finalStatus === ApprovalRequestStatus.approved
                ? "published"
                : "draft",
          },
        });
        if (changed.count !== 1) {
          throw new ConflictException("Mẫu không còn chờ duyệt");
        }
      }
      if (request.subjectType === "guest_invite" && finalStatus) {
        const approved = finalStatus === ApprovalRequestStatus.approved;
        const changed = await tx.guestAccess.updateMany({
          where: {
            id: request.subjectId,
            projectId,
            status: "pending_approval",
          },
          data: {
            status: approved ? "active" : "revoked",
            ...(approved ? {} : { revokedAt: new Date() }),
          },
        });
        if (changed.count !== 1) {
          throw new ConflictException("Lời mời khách không còn chờ duyệt");
        }
      }
      if (input.action === "approve" && !finalStatus) {
        await this.notifyApprovers(
          projectId,
          requestId,
          steps[request.currentStep + 1],
          tx,
        );
      }
      if (input.action === "forward" && input.forwardToUserId) {
        await tx.notification.create({
          data: {
            userId: input.forwardToUserId,
            type: "approval.forwarded",
            payload: { projectId, requestId },
          },
        });
      }
      return result;
    });
  }

  async listDelegations(actor: Actor) {
    return this.prisma.approvalDelegation.findMany({
      where: { grantorId: actor.id },
      orderBy: { startsAt: "desc" },
    });
  }

  async createDelegation(
    actor: Actor,
    input: {
      granteeId: string;
      projectId?: string;
      startsAt: string;
      endsAt: string;
    },
  ) {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (endsAt <= startsAt || input.granteeId === actor.id)
      throw new BadRequestException(
        "Thời gian hoặc người được ủy quyền không hợp lệ",
      );
    const grantee = await this.prisma.user.findFirst({
      where: {
        id: input.granteeId,
        organizationId: actor.organizationId,
        status: "active",
      },
    });
    if (!grantee)
      throw new BadRequestException("Người được ủy quyền không hợp lệ");
    if (input.projectId) {
      await this.requireProjectMember(actor, input.projectId);
      await this.requireActiveMember(input.projectId, input.granteeId);
    }
    return this.prisma.approvalDelegation.create({
      data: {
        grantorId: actor.id,
        granteeId: input.granteeId,
        projectId: input.projectId,
        startsAt,
        endsAt,
      },
    });
  }

  async revokeDelegation(actor: Actor, delegationId: string) {
    const revoked = await this.prisma.approvalDelegation.updateMany({
      where: { id: delegationId, grantorId: actor.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!revoked.count) throw new NotFoundException();
    return { id: delegationId, revoked: true };
  }

  private async activeDelegator(
    granteeId: string,
    projectId: string,
    grantorId?: string,
  ) {
    const now = new Date();
    const rows = await this.prisma.approvalDelegation.findMany({
      where: {
        granteeId,
        ...(grantorId ? { grantorId } : {}),
        OR: [{ projectId }, { projectId: null }],
        revokedAt: null,
      },
      orderBy: { createdAt: "desc" },
      select: {
        grantorId: true,
        startsAt: true,
        endsAt: true,
        revokedAt: true,
        projectId: true,
      },
    });
    return rows.find((row) => isDelegationActive(row, projectId, now))
      ?.grantorId;
  }

  private async notifyApprovers(
    projectId: string,
    requestId: string,
    step: ApprovalFlowStep,
    client: Pick<
      Prisma.TransactionClient,
      "projectMember" | "notification"
    > = this.prisma,
  ) {
    const members = await client.projectMember.findMany({
      where: {
        projectId,
        user: { status: "active" },
        ...(step.userId
          ? { userId: step.userId }
          : { role: step.role as ProjectRole }),
      },
      select: { userId: true },
    });
    if (members.length) {
      await client.notification.createMany({
        data: members.map((member) => ({
          userId: member.userId,
          type: "approval.requested",
          payload: { projectId, requestId },
        })),
      });
    }
  }

  private async requireProjectMember(actor: Actor, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        deletedAt: null,
        branch: { organizationId: actor.organizationId },
        OR: [
          { ownerId: actor.id },
          { members: { some: { userId: actor.id } } },
        ],
      },
      include: {
        members: { where: { userId: actor.id }, select: { role: true } },
      },
    });
    if (!project) throw new NotFoundException();
    return project;
  }

  private async requireProjectManager(actor: Actor, projectId: string) {
    const project = await this.requireProjectMember(actor, projectId);
    const role = project.members[0]?.role;
    if (
      project.ownerId !== actor.id &&
      role !== ProjectRole.owner &&
      role !== ProjectRole.manager
    )
      throw new ForbiddenException();
    return project;
  }

  private async requireActiveMember(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findFirst({
      where: { projectId, userId, user: { status: "active" } },
      select: { userId: true },
    });
    if (!member)
      throw new BadRequestException(
        "Người nhận phải đang hoạt động trong dự án",
      );
  }
}
