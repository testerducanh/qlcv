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
jest.mock("../approvals/approvals.service", () => ({
  ApprovalsService: class ApprovalsService {},
}));

import { createHash, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import type { Env } from "../config/env";
import type { PrismaService } from "../infra/infra.module";
import { GuestPortalService } from "./guest-portal.service";

const prisma = new PrismaClient();
const token = "guest-expiry-test-token";

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

function serviceFor(tx: Prisma.TransactionClient) {
  const client = new Proxy(tx, {
    get(target, property, receiver) {
      return Reflect.get(target, property, receiver);
    },
  }) as unknown as PrismaService;
  return new GuestPortalService(
    client,
    {} as never,
    {} as Env,
    { send: jest.fn() } as never,
    { scan: jest.fn() },
  );
}

async function guestFixture(
  tx: Prisma.TransactionClient,
  expiresAt = new Date(Date.now() + 60_000),
) {
  const suffix = randomUUID();
  const organization = await tx.organization.create({
    data: { name: `Guest portal ${suffix}` },
  });
  const branch = await tx.branch.create({
    data: { organizationId: organization.id, name: `Branch ${suffix}` },
  });
  const owner = await tx.user.create({
    data: {
      organizationId: organization.id,
      branchId: branch.id,
      email: `guest-owner-${suffix}@example.test`,
      name: "Guest portal owner",
      status: "active",
    },
  });
  const project = await tx.project.create({
    data: { branchId: branch.id, ownerId: owner.id, name: `Project ${suffix}` },
  });
  const task = await tx.task.create({
    data: {
      projectId: project.id,
      creatorId: owner.id,
      title: "Shared task",
      position: "000000000001",
    },
  });
  const otherTask = await tx.task.create({
    data: {
      projectId: project.id,
      creatorId: owner.id,
      title: "Private task",
      position: "000000000002",
    },
  });
  const guest = await tx.guestAccess.create({
    data: {
      projectId: project.id,
      invitedById: owner.id,
      name: "External reviewer",
      email: "external@example.test",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      status: "active",
      expiresAt,
      tasks: { create: [{ taskId: task.id }] },
    },
  });
  const submission = await tx.guestSubmission.create({
    data: {
      guestAccessId: guest.id,
      taskId: task.id,
      body: "Original submitted result",
    },
  });
  return { guest, project, task, otherTask, submission };
}

afterAll(async () => prisma.$disconnect());

describe("Guest portal database guarantees", () => {
  it("expires access but retains submitted results", async () => {
    await inRollback(async (tx) => {
      const { guest, submission } = await guestFixture(
        tx,
        new Date(Date.now() - 1000),
      );
      const service = serviceFor(tx);

      await expect(service.me(token)).rejects.toMatchObject({ status: 401 });
      await expect(
        tx.guestAccess.findUnique({ where: { id: guest.id } }),
      ).resolves.toMatchObject({ status: "expired" });
      await expect(
        tx.guestSubmission.findUnique({ where: { id: submission.id } }),
      ).resolves.toMatchObject({ body: "Original submitted result" });
    });
  });

  it("rejects a task ID outside the guest whitelist", async () => {
    await inRollback(async (tx) => {
      const { otherTask } = await guestFixture(tx);
      const service = serviceFor(tx);

      await expect(service.getTask(token, otherTask.id)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  it("prevents updates to a submitted result at the database layer", async () => {
    await inRollback(async (tx) => {
      const { submission } = await guestFixture(tx);
      await tx.$executeRaw`SAVEPOINT guest_submission_immutability_test`;
      await expect(
        tx.guestSubmission.update({
          where: { id: submission.id },
          data: { body: "Edited result" },
        }),
      ).rejects.toThrow();
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT guest_submission_immutability_test`;
      await expect(
        tx.guestSubmission.findUnique({ where: { id: submission.id } }),
      ).resolves.toMatchObject({ body: "Original submitted result" });
    });
  });
});
