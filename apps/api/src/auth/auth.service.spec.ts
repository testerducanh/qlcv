jest.mock("@nestjs/common", () => {
  class UnauthorizedException extends Error {}
  class HttpException extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }
  return {
    HttpException,
    HttpStatus: { TOO_MANY_REQUESTS: 429 },
    Inject: () => () => {},
    Injectable: () => () => {},
    Logger: class {
      error = jest.fn();
    },
    UnauthorizedException,
  };
});

const mockSendMail = jest.fn(async () => ({}));
jest.mock("nodemailer", () => ({
  __esModule: true,
  default: {
    createTransport: () => ({ sendMail: mockSendMail }),
  },
}));

jest.mock("../infra/infra.module", () => ({
  ENV: "ENV",
  REDIS: "REDIS",
  PrismaService: class PrismaService {},
}));

import { hash } from "@node-rs/argon2";
import { UnauthorizedException } from "@nestjs/common";
import jwt from "jsonwebtoken";
import type Redis from "ioredis";
import type { Env } from "../config/env";
import type { PrismaService } from "../infra/infra.module";
import { AuthService } from "./auth.service";

const PASSWORD = "correct horse battery staple";
const USER = {
  id: "c9237acf-9912-41a3-bd0e-f15d05f2141c",
  organizationId: "c9237acf-9912-41a3-bd0e-f15d05f2141c",
  email: "person@example.com",
  name: "Person",
  passwordHash: "",
  status: "active",
  systemRole: "member",
  branchId: null,
};

function makeRedis() {
  const values = new Map<string, string>();
  const redis = {
    get: jest.fn(async (key: string) => values.get(key) ?? null),
    del: jest.fn(async (key: string) => Number(values.delete(key))),
    eval: jest.fn(async (_script: string, _keyCount: number, key: string) => {
      const count = Number(values.get(key) ?? 0) + 1;
      values.set(key, String(count));
      return count;
    }),
    set: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
      return "OK";
    }),
    getdel: jest.fn(async (key: string) => {
      const value = values.get(key) ?? null;
      values.delete(key);
      return value;
    }),
  };
  return { redis, values };
}

function makePrisma() {
  const transaction = {
    refreshToken: {
      updateMany: jest.fn(async () => ({ count: 1 })),
      create: jest.fn(async () => ({})),
    },
  };
  const prisma = {
    user: {
      findUnique: jest.fn(async () => ({
        ...USER,
        passwordHash: USER.passwordHash,
        departmentLinks: [{ departmentId: "department-1" }],
      })),
      update: jest.fn(async () => ({})),
    },
    refreshToken: {
      create: jest.fn(async () => ({})),
      findUnique: jest.fn(async (): Promise<unknown> => null),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    activityLog: {
      create: jest.fn(async () => ({})),
    },
    $transaction: jest.fn(async (work: unknown) =>
      typeof work === "function"
        ? work(transaction)
        : Promise.all(work as Promise<unknown>[]),
    ),
  };
  return { prisma, transaction };
}

describe("AuthService", () => {
  let service: AuthService;
  let prisma: ReturnType<typeof makePrisma>;
  let redis: ReturnType<typeof makeRedis>;
  const env = {
    ...{
      NODE_ENV: "test",
      API_PORT: 3000,
      DATABASE_URL: "postgresql://localhost/test",
      REDIS_URL: "redis://localhost:6379",
      S3_ENDPOINT: "http://localhost:9000",
      S3_REGION: "us-east-1",
      S3_ACCESS_KEY: "test",
      S3_SECRET_KEY: "test",
      S3_BUCKET: "test",
      S3_FORCE_PATH_STYLE: true,
      CORS_ORIGINS: ["http://localhost:5173"],
      BODY_LIMIT: "1mb",
      JWT_ACCESS_SECRET: "test-access-secret-that-is-at-least-32-chars",
      WEB_BASE_URL: "http://localhost:5173",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: 1025,
      SMTP_FROM: "no-reply@qlcv.local",
      SMTP_SECURE: false,
    },
  } as Env;

  beforeAll(async () => {
    USER.passwordHash = await hash(PASSWORD);
  });

  beforeEach(() => {
    prisma = makePrisma();
    redis = makeRedis();
    service = new AuthService(
      prisma.prisma as unknown as PrismaService,
      redis.redis as unknown as Redis,
      env,
    );
  });

  it("authenticates, records activity, and only persists a digest of refresh token", async () => {
    const session = await service.login(
      " PERSON@example.com ",
      PASSWORD,
      "127.0.0.1",
    );

    expect(session.user.email).toBe(USER.email);
    expect(session.refreshToken).toHaveLength(64);
    const claims = jwt.decode(session.accessToken) as jwt.JwtPayload;
    expect(claims.exp! - claims.iat!).toBe(15 * 60);
    expect(claims.iss).toBe("qlcv-api");
    expect(prisma.prisma.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tokenHash: expect.not.stringMatching(session.refreshToken),
        }),
      }),
    );
    expect(prisma.prisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "auth.login" }),
      }),
    );
    expect(redis.redis.del).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:login-fail:/),
    );
  });

  it("temporarily blocks an account after five failed password attempts", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        service.login(USER.email, "incorrect", "127.0.0.1"),
      ).rejects.toThrow(UnauthorizedException);
    }

    const verifyCallsBeforeLockedAttempt =
      prisma.prisma.user.findUnique.mock.calls.length;
    await expect(
      service.login(USER.email, PASSWORD, "127.0.0.1"),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.prisma.user.findUnique).toHaveBeenCalledTimes(
      verifyCallsBeforeLockedAttempt + 1,
    );
    expect(prisma.prisma.activityLog.create).toHaveBeenCalledTimes(6);
  });

  it("limits authentication requests by IP before checking credentials", async () => {
    redis.redis.eval.mockResolvedValueOnce(31);

    await expect(
      service.login(USER.email, PASSWORD, "127.0.0.1"),
    ).rejects.toMatchObject({ status: 429 });
    expect(prisma.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("rotates refresh tokens atomically and rejects a replay", async () => {
    const oldToken = "a".repeat(64);
    prisma.prisma.refreshToken.findUnique.mockResolvedValue({
      id: "token-row",
      userId: USER.id,
      tokenHash: "stored-hash",
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      createdAt: new Date(),
      user: { ...USER, passwordHash: USER.passwordHash },
    });

    const session = await service.refresh(oldToken);
    expect(session.refreshToken).not.toBe(oldToken);
    expect(prisma.transaction.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "token-row", revokedAt: null }),
      }),
    );
    expect(prisma.transaction.refreshToken.create).toHaveBeenCalledTimes(1);

    prisma.prisma.refreshToken.findUnique.mockResolvedValueOnce(null);
    await expect(service.refresh(oldToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("stores password reset tokens by digest and consumes them once", async () => {
    redis.redis.getdel.mockResolvedValueOnce(USER.id);

    await service.resetPassword("r".repeat(43), "new long password 123");

    expect(redis.redis.getdel).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:password-reset:/),
    );
    expect(prisma.prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER.id, revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
    expect(prisma.prisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "auth.password_reset" }),
      }),
    );

    redis.redis.getdel.mockResolvedValueOnce(null);
    await expect(
      service.resetPassword("r".repeat(43), "new long password 123"),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("keeps reset responses generic when SMTP delivery fails", async () => {
    mockSendMail.mockRejectedValueOnce(
      Object.assign(new Error("delivery failed"), { code: "ECONNECTION" }),
    );

    await expect(
      service.requestPasswordReset(USER.email, "127.0.0.1"),
    ).resolves.toBeUndefined();
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: USER.email }),
    );
  });

  it("hydrates managed department scope from persisted department-head links", async () => {
    const session = await service.login(USER.email, PASSWORD, "127.0.0.1");

    await expect(
      service.validateAccessToken(session.accessToken),
    ).resolves.toMatchObject({
      id: USER.id,
      managedDepartmentIds: ["department-1"],
    });
  });
});
