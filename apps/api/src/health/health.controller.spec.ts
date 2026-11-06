jest.mock("@nestjs/common", () => {
  class TestHttpError extends Error {}
  const decorator = () => () => {};
  return {
    Controller: decorator,
    Get: decorator,
    Headers: decorator,
    Inject: decorator,
    Injectable: decorator,
    Module: decorator,
    Res: decorator,
    ServiceUnavailableException: TestHttpError,
    UnauthorizedException: TestHttpError,
  };
});

jest.mock("@aws-sdk/client-s3", () => ({
  HeadBucketCommand: class HeadBucketCommand {},
  S3Client: class S3Client {},
}));

jest.mock("../infra/infra.module", () => ({
  ENV: "ENV",
  PrismaService: class PrismaService {},
  REDIS: "REDIS",
  S3: "S3",
}));

import { UnauthorizedException } from "@nestjs/common";
import type { Env } from "../config/env";
import type { PrismaService } from "../infra/infra.module";
import { HealthController } from "./health.controller";

const monitorToken = "test-operations-monitor-token-123456";

function controllerWithHeartbeat(timestamp: number, waiting = 2, delayed = 1) {
  const redis = {
    get: jest
      .fn()
      .mockResolvedValue(
        JSON.stringify({ instanceId: "test-worker", timestamp }),
      ),
    llen: jest
      .fn()
      .mockImplementation(async (key: string) =>
        key.endsWith(":wait") ? waiting : 1,
      ),
    zcard: jest
      .fn()
      .mockImplementation(async (key: string) =>
        key.endsWith(":delayed") ? delayed : 0,
      ),
  };
  const controller = new HealthController(
    {} as PrismaService,
    redis as never,
    {} as never,
    {
      OPS_MONITOR_TOKEN: monitorToken,
      OPS_QUEUE_BACKLOG_LIMIT: 500,
    } as Env,
  );
  return { controller, redis };
}

describe("HealthController operations endpoint", () => {
  it("requires the configured bearer token", async () => {
    const { controller, redis } = controllerWithHeartbeat(Date.now());

    await expect(
      controller.operations("Bearer invalid"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.get).not.toHaveBeenCalled();
  });

  it("reports a current worker heartbeat and queue depth", async () => {
    const { controller } = controllerWithHeartbeat(Date.now(), 2, 3);

    await expect(
      controller.operations(`Bearer ${monitorToken}`),
    ).resolves.toMatchObject({
      status: "ok",
      worker: { status: "ok" },
      queue: {
        waiting: 2,
        active: 1,
        delayed: 3,
        failed: 0,
        backlog: 5,
        status: "ok",
      },
    });
  });

  it("reports a stale worker and excessive backlog as degraded", async () => {
    const { controller } = controllerWithHeartbeat(
      Date.now() - 120_000,
      501,
      0,
    );

    await expect(
      controller.operations(`Bearer ${monitorToken}`),
    ).resolves.toMatchObject({
      status: "degraded",
      worker: { status: "stale" },
      queue: { backlog: 501, status: "backlog" },
    });
  });
});
