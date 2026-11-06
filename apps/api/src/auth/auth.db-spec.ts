jest.mock("@nestjs/common", () => {
  class HttpException extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }
  const decorator = () => () => {};
  return {
    HttpException,
    HttpStatus: { TOO_MANY_REQUESTS: 429 },
    Inject: decorator,
    Injectable: decorator,
    Logger: class {
      error = jest.fn();
    },
    UnauthorizedException: class extends HttpException {
      constructor(message = "Unauthorized") {
        super(message, 401);
      }
    },
  };
});

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: () => ({ sendMail: jest.fn() }) },
}));

jest.mock("../infra/infra.module", () => ({
  ENV: "ENV",
  PrismaService: class PrismaService {},
  REDIS: "REDIS",
}));

import { randomUUID, createHash } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { Prisma, PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import type { Env } from "../config/env";
import type { PrismaService } from "../infra/infra.module";
import { AuthService } from "./auth.service";

const prisma = new PrismaClient();
const env = {
  NODE_ENV: "test",
  API_PORT: 3000,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
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
const redis = new Redis(env.REDIS_URL!, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});

class Rollback extends Error {}

function transactionClient(tx: Prisma.TransactionClient): PrismaService {
  return new Proxy(tx, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        return (work: unknown) =>
          Array.isArray(work)
            ? Promise.all(work)
            : (work as (client: Prisma.TransactionClient) => Promise<unknown>)(
                tx,
              );
      }
      return Reflect.get(target, property, receiver);
    },
  }) as unknown as PrismaService;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

afterAll(async () => {
  await redis.quit();
  await prisma.$disconnect();
});

describe("AuthService workflows (database and Redis)", () => {
  it("logs in, rotates and revokes refresh tokens, and locks after five failures", async () => {
    const suffix = randomUUID();
    const email = `auth-${suffix}@example.test`;
    const lockedEmail = `locked-${suffix}@example.test`;
    const ip = `127.0.0.${Math.floor(Math.random() * 200) + 1}`;
    const failureKeys = [
      `auth:login-fail:${digest(email)}`,
      `auth:login-fail:${digest(lockedEmail)}`,
      `auth:rate:login:${digest(ip)}`,
    ];

    try {
      await prisma.$transaction(
        async (tx) => {
          const scopedPrisma = transactionClient(tx);
          const service = new AuthService(scopedPrisma, redis, env);
          const organization = await tx.organization.create({
            data: { name: `Auth integration ${suffix}` },
          });
          const branch = await tx.branch.create({
            data: { organizationId: organization.id, name: `Branch ${suffix}` },
          });
          const passwordHash = await hash("correct horse battery staple");
          const user = await tx.user.create({
            data: {
              organizationId: organization.id,
              branchId: branch.id,
              email,
              name: "Auth Test",
              passwordHash,
              status: "active",
            },
          });
          await tx.user.create({
            data: {
              organizationId: organization.id,
              branchId: branch.id,
              email: lockedEmail,
              name: "Lock Test",
              passwordHash,
              status: "active",
            },
          });

          const session = await service.login(
            email,
            "correct horse battery staple",
            ip,
          );
          expect(session.user.id).toBe(user.id);
          const firstToken = await tx.refreshToken.findFirst({
            where: { userId: user.id },
          });
          expect(firstToken?.tokenHash).not.toBe(session.refreshToken);

          const rotated = await service.refresh(session.refreshToken);
          await expect(
            service.refresh(session.refreshToken),
          ).rejects.toMatchObject({
            status: 401,
          });
          await service.logout(rotated.refreshToken);
          const tokenRows = await tx.refreshToken.findMany({
            where: { userId: user.id },
          });
          expect(tokenRows).toHaveLength(2);
          expect(tokenRows.every((token) => token.revokedAt !== null)).toBe(
            true,
          );

          for (let attempt = 0; attempt < 5; attempt += 1) {
            await expect(
              service.login(lockedEmail, "wrong password", ip),
            ).rejects.toMatchObject({ status: 401 });
          }
          await expect(
            service.login(lockedEmail, "correct horse battery staple", ip),
          ).rejects.toMatchObject({ status: 401 });

          throw new Rollback();
        },
        { timeout: 30000, maxWait: 10000 },
      );
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    } finally {
      await redis.del(...failureKeys);
    }
  }, 45000);
});
