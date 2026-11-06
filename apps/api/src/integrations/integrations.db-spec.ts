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
        super(
          typeof message === "string" ? message : JSON.stringify(message),
          400,
        );
      }
    },
    ForbiddenException: class extends HttpError {
      constructor(message = "Forbidden") {
        super(message, 403);
      }
    },
    HttpException: class extends HttpError {},
    Inject: () => () => {},
    Injectable: () => () => {},
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
  PrismaService: class PrismaService {},
  REDIS: "REDIS",
}));
jest.mock("../tasks/tasks.service", () => ({
  TasksService: class TasksService {},
}));

import { createHash, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.service";
import type { PrismaService } from "../infra/infra.module";
import { IntegrationsService } from "./integrations.service";

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

function serviceFor(
  tx: Prisma.TransactionClient,
  tasks: { getTask: jest.Mock; createTask: jest.Mock },
  rateCount = 1,
) {
  const client = new Proxy(tx, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        return (operations: Promise<unknown>[]) => Promise.all(operations);
      }
      return Reflect.get(target, property, receiver);
    },
  }) as unknown as PrismaService;
  return new IntegrationsService(
    client,
    { eval: jest.fn().mockResolvedValue(rateCount) } as never,
    tasks as never,
  );
}

async function fixtures(tx: Prisma.TransactionClient) {
  const suffix = randomUUID();
  const organization = await tx.organization.create({
    data: { name: `Integration ${suffix}` },
  });
  const branch = await tx.branch.create({
    data: { organizationId: organization.id, name: `Branch ${suffix}` },
  });
  const user = await tx.user.create({
    data: {
      organizationId: organization.id,
      branchId: branch.id,
      email: `integration-${suffix}@example.test`,
      name: "Integration owner",
      status: "active",
    },
  });
  const project = await tx.project.create({
    data: { branchId: branch.id, ownerId: user.id, name: `Project ${suffix}` },
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
  return { actor, project };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("IntegrationsService API key workflows", () => {
  it("denies writes through a read-only key and returns the token only once", async () => {
    await inRollback(async (tx) => {
      const { actor, project } = await fixtures(tx);
      const tasks = {
        getTask: jest.fn().mockResolvedValue({ id: "task-id" }),
        createTask: jest.fn(),
      };
      const service = serviceFor(tx, tasks);
      const created = await service.createApiKey(actor, {
        projectId: project.id,
        name: "Read-only integration",
        scopes: ["task:read"],
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      expect(created.token).toMatch(/^qlcv_live_[A-Za-z0-9_-]+$/);
      const stored = await tx.integrationApiKey.findUniqueOrThrow({
        where: { id: created.id },
        select: { tokenHash: true },
      });
      expect(stored.tokenHash).toBe(
        createHash("sha256").update(created.token).digest("hex"),
      );
      const listed = await service.listApiKeys(actor, project.id);
      expect(listed).toEqual([
        expect.objectContaining({
          id: created.id,
          scopes: ["task:read"],
        }),
      ]);
      expect(listed[0]).not.toHaveProperty("token");
      expect(listed[0]).not.toHaveProperty("tokenHash");

      await expect(
        service.createTaskWithApiKey(created.token, project.id, {
          title: "Not permitted",
        }),
      ).rejects.toMatchObject({ status: 403 });
      expect(tasks.createTask).not.toHaveBeenCalled();
    });
  });

  it("rejects a revoked key and logs successful read usage", async () => {
    await inRollback(async (tx) => {
      const { actor, project } = await fixtures(tx);
      const tasks = {
        getTask: jest.fn().mockResolvedValue({ id: "visible-task" }),
        createTask: jest.fn(),
      };
      const service = serviceFor(tx, tasks);
      const created = await service.createApiKey(actor, {
        projectId: project.id,
        name: "Read key",
        scopes: ["task:read"],
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
      await expect(
        service.getTaskWithApiKey(created.token, project.id, randomUUID()),
      ).resolves.toEqual({ id: "visible-task" });
      expect(
        await tx.activityLog.count({
          where: {
            actorId: actor.id,
            action: "integration.api.task_read",
          },
        }),
      ).toBe(1);

      await service.revokeApiKey(actor, project.id, created.id);
      await expect(
        service.getTaskWithApiKey(created.token, project.id, randomUUID()),
      ).rejects.toMatchObject({ status: 401 });
    });
  });

  it("enforces expiry, project binding, and the per-key request limit", async () => {
    await inRollback(async (tx) => {
      const { actor, project } = await fixtures(tx);
      const tasks = {
        getTask: jest.fn(),
        createTask: jest.fn(),
      };
      const service = serviceFor(tx, tasks);
      const created = await service.createApiKey(actor, {
        projectId: project.id,
        name: "Expiring read key",
        scopes: ["task:read"],
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      await expect(
        service.getTaskWithApiKey(created.token, randomUUID(), randomUUID()),
      ).rejects.toMatchObject({ status: 401 });
      await tx.integrationApiKey.update({
        where: { id: created.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await expect(
        service.getTaskWithApiKey(created.token, project.id, randomUUID()),
      ).rejects.toMatchObject({ status: 401 });

      const overLimitService = serviceFor(tx, tasks, 61);
      const rateLimited = await overLimitService.createApiKey(actor, {
        projectId: project.id,
        name: "Rate-limited read key",
        scopes: ["task:read"],
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
      await expect(
        overLimitService.getTaskWithApiKey(
          rateLimited.token,
          project.id,
          randomUUID(),
        ),
      ).rejects.toMatchObject({ status: 429 });
      expect(tasks.getTask).not.toHaveBeenCalled();
    });
  });
});
