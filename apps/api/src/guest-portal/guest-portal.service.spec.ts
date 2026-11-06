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
    Inject: decorator,
    Injectable: decorator,
    NotFoundException: class extends HttpError {
      constructor(message = "Not found") {
        super(message, 404);
      }
    },
    UnauthorizedException: class extends HttpError {
      constructor(message = "Unauthorized") {
        super(message, 401);
      }
    },
  };
});
jest.mock("../infra/infra.module", () => ({
  ENV: "ENV",
  PrismaService: class PrismaService {},
  S3: "S3",
}));

import { createHash } from "node:crypto";
import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { Env } from "../config/env";
import type { AuthenticatedUser } from "../auth/auth.service";
import type { PrismaService } from "../infra/infra.module";
import type { ApprovalsService } from "../approvals/approvals.service";
import type { VirusScanner } from "../attachments/virus-scanner";
import { GuestPortalService } from "./guest-portal.service";

const guestId = "768d244e-7677-4e8d-aacd-b4c349d984a9";
const projectId = "7e0ca46b-6aed-4ced-8a48-a83a980709c8";
const taskId = "682d2f3c-8d55-4a90-b21c-f5f144ef289b";
const token = "long-random-guest-token";

function activeGuest() {
  return {
    id: guestId,
    projectId,
    invitedById: "5448c1de-133a-48ef-98bb-78f78fb34531",
    name: "Guest Reviewer",
    email: "guest@example.test",
    tokenHash: "hash",
    status: "active",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    revokedAt: null,
    project: {
      id: projectId,
      name: "Shared project",
      status: "active",
      deletedAt: null,
      guestWatermark: true,
    },
  };
}

function setup() {
  const prisma = {
    guestAccess: {
      findUnique: jest.fn().mockResolvedValue(activeGuest()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(),
    },
    project: { findFirst: jest.fn() },
    task: { findMany: jest.fn() },
    guestTaskAccess: { findFirst: jest.fn().mockResolvedValue(null) },
    guestSharedAttachment: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
    activityLog: { create: jest.fn().mockResolvedValue({}) },
    guestSubmission: { findMany: jest.fn(), create: jest.fn() },
    guestSubmissionFile: { findFirst: jest.fn(), findMany: jest.fn() },
  } as unknown as PrismaService;
  const approvals = {
    createGuestInviteRequest: jest.fn().mockResolvedValue({ id: "request-id" }),
  };
  const service = new GuestPortalService(
    prisma,
    approvals as unknown as ApprovalsService,
    {} as Env,
    { send: jest.fn() } as never,
    { scan: jest.fn() } as VirusScanner,
  );
  return { prisma, approvals, service };
}

describe("GuestPortalService access controls", () => {
  it("authenticates using only the SHA-256 token hash", async () => {
    const { prisma, service } = setup();
    await expect(service.me(token)).resolves.toMatchObject({
      name: "Guest Reviewer",
      email: "guest@example.test",
      projectName: "Shared project",
    });
    expect(prisma.guestAccess.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tokenHash: createHash("sha256").update(token).digest("hex"),
        },
      }),
    );
  });

  it("denies task IDs outside the invite whitelist and audits the attempt", async () => {
    const { prisma, service } = setup();
    await expect(service.getTask(token, taskId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.guestTaskAccess.findFirst).toHaveBeenCalledWith({
      where: {
        guestAccessId: guestId,
        taskId,
        task: { deletedAt: null },
      },
      select: expect.any(Object),
    });
    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "guest_task_denied",
        entityId: guestId,
        projectId,
        after: { resourceId: taskId },
      }),
    });
  });

  it("denies file IDs outside the shared-file whitelist", async () => {
    const { prisma, service } = setup();
    await expect(
      service.downloadSharedFile(token, taskId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.guestSharedAttachment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          guestAccessId: guestId,
          attachmentId: taskId,
        }),
      }),
    );
    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "guest_shared_file_denied",
      }),
    });
  });

  it("rejects revoked guest access", async () => {
    const { prisma, service } = setup();
    (prisma.guestAccess.findUnique as jest.Mock).mockResolvedValue({
      ...activeGuest(),
      status: "revoked",
    });
    await expect(service.me(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("expires access without deleting prior submissions", async () => {
    const { prisma, service } = setup();
    (prisma.guestAccess.findUnique as jest.Mock).mockResolvedValue({
      ...activeGuest(),
      expiresAt: new Date(Date.now() - 1),
    });
    await expect(service.me(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.guestAccess.updateMany).toHaveBeenCalledWith({
      where: {
        id: guestId,
        status: { in: ["active", "pending_approval"] },
      },
      data: { status: "expired" },
    });
    expect(prisma.guestSubmission).not.toHaveProperty("deleteMany");
  });

  it("keeps a restricted-project invitation pending until approval", async () => {
    const { prisma, approvals, service } = setup();
    const actor: AuthenticatedUser = {
      id: guestId,
      organizationId: "organization-id",
      systemRole: "member",
      branchId: null,
      managedDepartmentIds: [],
      email: "manager@example.test",
      name: "Project manager",
    };
    const created = {
      id: "guest-access-id",
      name: "External reviewer",
      email: "external@example.test",
      status: "pending_approval",
      expiresAt: new Date(Date.now() + 86400000),
    };
    const tx = {
      guestAccess: { create: jest.fn().mockResolvedValue(created) },
      guestSharedAttachment: { createMany: jest.fn() },
      activityLog: { create: jest.fn() },
    };
    (prisma.project.findFirst as jest.Mock).mockResolvedValue({
      id: projectId,
      ownerId: actor.id,
      confidentiality: "restricted",
      members: [],
    });
    (prisma.task.findMany as jest.Mock).mockResolvedValue([{ id: taskId }]);
    (prisma.$transaction as jest.Mock).mockImplementation(
      (callback: (client: unknown) => Promise<unknown>) => callback(tx),
    );

    const result = await service.createInvite(actor, projectId, {
      name: "External reviewer",
      email: "external@example.test",
      expiresInDays: 1,
      taskIds: [taskId],
      attachmentIds: [],
      approvalFlowId: "flow-id",
    });

    expect(result.status).toBe("pending_approval");
    const createData = tx.guestAccess.create.mock.calls[0][0].data;
    expect(createData.status).toBe("pending_approval");
    expect(createData.tokenHash).not.toBe(result.token);
    expect(approvals.createGuestInviteRequest).toHaveBeenCalledWith(
      actor,
      projectId,
      created.id,
      "flow-id",
      tx,
    );
  });
});
