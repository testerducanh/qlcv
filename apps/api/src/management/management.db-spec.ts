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
    Global: decorator,
    Inject: decorator,
    Injectable: decorator,
    Logger: class {
      error = jest.fn();
    },
    NotFoundException: class extends HttpError {
      constructor(message = "Not found") {
        super(message, 404);
      }
    },
    Module: decorator,
  };
});

jest.mock("@aws-sdk/client-s3", () => ({
  CopyObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
  DeleteObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
}));

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: () => ({ sendMail: jest.fn() }) },
}));

import { randomUUID } from "node:crypto";
import { Prisma, ProjectRole, PrismaClient } from "@prisma/client";
import type Redis from "ioredis";
import type { S3Client } from "@aws-sdk/client-s3";
import type { Env } from "../config/env";
import type { PrismaService } from "../infra/infra.module";
import { ManagementService } from "./management.service";

const prisma = new PrismaClient({
  log: [{ emit: "event", level: "query" }],
});
let countingQueries = false;
let queryCount = 0;
prisma.$on("query", () => {
  if (countingQueries) queryCount += 1;
});

const env = {
  NODE_ENV: "test",
  API_PORT: 3000,
  DATABASE_URL: "postgresql://localhost/test",
  REDIS_URL: "redis://localhost:6379",
  JWT_ACCESS_SECRET:
    "integration-test-secret-value-with-more-than-32-characters",
  WEB_BASE_URL: "http://localhost:5173",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: 1025,
  SMTP_FROM: "no-reply@qlcv.local",
  SMTP_SECURE: false,
  S3_ENDPOINT: "http://127.0.0.1:9000",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY: "test",
  S3_SECRET_KEY: "test",
  S3_BUCKET: "test",
  S3_FORCE_PATH_STYLE: true,
  CORS_ORIGINS: ["http://localhost:5173"],
  BODY_LIMIT: "1mb",
} as Env;

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

afterAll(async () => {
  await prisma.$disconnect();
});

describe("ManagementService project workflows (database)", () => {
  it("manages project membership, hides out-of-scope projects, and clones a project", async () => {
    await inRollback(async (tx) => {
      const txPrisma = {
        project: tx.project,
        projectMember: tx.projectMember,
        branch: tx.branch,
        user: tx.user,
        activityLog: tx.activityLog,
        task: tx.task,
        taskDependency: tx.taskDependency,
        label: tx.label,
        taskLabel: tx.taskLabel,
        checklistItem: tx.checklistItem,
        attachment: tx.attachment,
        $transaction: async (
          work: (client: Prisma.TransactionClient) => Promise<unknown>,
        ) => work(tx),
      } as unknown as PrismaService;
      const management = new ManagementService(txPrisma, {} as Redis, env, {
        send: jest.fn(),
      } as unknown as S3Client);
      const suffix = randomUUID();
      const organization = await tx.organization.create({
        data: { name: `Integration ${suffix}` },
      });
      const branch = await tx.branch.create({
        data: { organizationId: organization.id, name: `Branch ${suffix}` },
      });
      const owner = await tx.user.create({
        data: {
          organizationId: organization.id,
          branchId: branch.id,
          email: `owner-${suffix}@example.test`,
          name: "Project Owner",
          status: "active",
        },
      });
      const member = await tx.user.create({
        data: {
          organizationId: organization.id,
          branchId: branch.id,
          email: `member-${suffix}@example.test`,
          name: "Project Member",
          status: "active",
        },
      });
      const outsider = await tx.user.create({
        data: {
          organizationId: organization.id,
          branchId: branch.id,
          email: `outsider-${suffix}@example.test`,
          name: "Out-of-scope User",
          status: "active",
        },
      });
      const actor = {
        id: owner.id,
        organizationId: organization.id,
        systemRole: "member" as const,
        branchId: branch.id,
        managedDepartmentIds: [],
        email: owner.email,
        name: owner.name,
      };
      const source = await management.createProject(actor, {
        branchId: branch.id,
        name: `Source ${suffix}`,
      });

      await management.addProjectMember(
        actor,
        source.id,
        member.id,
        ProjectRole.member,
      );
      await management.updateProjectMemberRole(
        actor,
        source.id,
        member.id,
        ProjectRole.manager,
      );
      await management.updateProjectMemberRole(
        actor,
        source.id,
        member.id,
        ProjectRole.member,
      );
      await expect(
        management.removeProjectMember(actor, source.id, owner.id),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        management.listProjectMembers(actor, source.id),
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            userId: owner.id,
            role: ProjectRole.owner,
          }),
          expect.objectContaining({
            userId: member.id,
            role: ProjectRole.member,
          }),
        ]),
      );

      await expect(
        management.getProject(
          { ...actor, id: outsider.id, email: outsider.email },
          source.id,
        ),
      ).rejects.toMatchObject({ status: 404 });

      const clone = await management.cloneProject(actor, source.id, {
        includeMembers: true,
      });

      const clonedMembers = await tx.projectMember.findMany({
        where: { projectId: clone.id },
        orderBy: { userId: "asc" },
      });
      expect(clone.name).toBe(`${source.name} (bản sao)`);
      expect(clonedMembers).toHaveLength(2);
      expect(clonedMembers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            userId: owner.id,
            role: ProjectRole.owner,
          }),
          expect.objectContaining({
            userId: member.id,
            role: ProjectRole.member,
          }),
        ]),
      );
      await expect(
        tx.activityLog.findFirst({
          where: { entityId: clone.id, action: "project.cloned" },
        }),
      ).resolves.not.toBeNull();
    });
  }, 30000);

  it("uses a bounded number of SQL queries for 200 projects", async () => {
    await inRollback(async (tx) => {
      const txPrisma = {
        project: tx.project,
        projectMember: tx.projectMember,
        task: tx.task,
        $transaction: async (operations: Promise<unknown>[]) =>
          Promise.all(operations),
      } as unknown as PrismaService;
      const management = new ManagementService(txPrisma, {} as Redis, env, {
        send: jest.fn(),
      } as unknown as S3Client);
      const suffix = randomUUID();
      const organization = await tx.organization.create({
        data: { name: `List integration ${suffix}` },
      });
      const branch = await tx.branch.create({
        data: { organizationId: organization.id, name: `Branch ${suffix}` },
      });
      const owner = await tx.user.create({
        data: {
          organizationId: organization.id,
          branchId: branch.id,
          email: `list-${suffix}@example.test`,
          name: "List Test",
          status: "active",
        },
      });
      await tx.project.createMany({
        data: Array.from({ length: 200 }, (_, index) => ({
          branchId: branch.id,
          ownerId: owner.id,
          name: `Project ${suffix} ${index}`,
        })),
      });
      const actor = {
        id: owner.id,
        organizationId: organization.id,
        systemRole: "member" as const,
        branchId: branch.id,
        managedDepartmentIds: [],
        email: owner.email,
        name: owner.name,
      };

      queryCount = 0;
      countingQueries = true;
      let result;
      try {
        result = await management.listProjects(actor, {
          page: 1,
          pageSize: 200,
          sort: "createdAt",
          order: "desc",
        });
      } finally {
        countingQueries = false;
      }

      expect(result.items).toHaveLength(200);
      expect(result.total).toBe(200);
      expect(queryCount).toBeLessThanOrEqual(6);
      expect(queryCount).toBeGreaterThan(0);
      expect(queryCount).toBeLessThan(200);
    });
  }, 30000);
});
