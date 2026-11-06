import {
  Controller,
  Get,
  Headers,
  Inject,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import type Redis from "ioredis";
import { describeError } from "../common/describe-error";
import type { Env } from "../config/env";
import { ENV, PrismaService, REDIS, S3 } from "../infra/infra.module";

function withTimeout<T>(p: Promise<T>, ms = 2000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("quá thời gian chờ")), ms);
    void p.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

async function check(fn: () => Promise<unknown>) {
  try {
    await withTimeout(fn());
    return "ok";
  } catch (e) {
    return `lỗi: ${describeError(e)}`;
  }
}

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(S3) private readonly s3: S3Client,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // Chỉ báo tiến trình còn sống, không đụng tới DB/Redis/S3
  @Get("health/live")
  live() {
    return { status: "ok" };
  }

  @Get("health")
  async health(@Res({ passthrough: true }) res: Response) {
    const [db, redis, s3] = await Promise.all([
      check(() => this.prisma.$queryRaw`SELECT 1`),
      check(() => this.redis.ping()),
      check(() =>
        this.s3.send(new HeadBucketCommand({ Bucket: this.env.S3_BUCKET })),
      ),
    ]);
    const allOk = [db, redis, s3].every((s) => s === "ok");
    if (!allOk) res.status(503);
    return { status: allOk ? "ok" : "degraded", db, redis, s3 };
  }

  @Get("health/operations")
  async operations(@Headers("authorization") authorization?: string) {
    const token = this.env.OPS_MONITOR_TOKEN ?? "";
    const supplied = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";
    const expectedBytes = Buffer.from(token);
    const suppliedBytes = Buffer.from(supplied);
    if (
      !token ||
      suppliedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(suppliedBytes, expectedBytes)
    ) {
      throw new UnauthorizedException();
    }

    try {
      const [heartbeat, waiting, active, delayed, failed] = await withTimeout(
        Promise.all([
          this.redis.get("qlcv:ops:worker:reminders:heartbeat"),
          this.redis.llen("bull:qlcv-reminders:wait"),
          this.redis.llen("bull:qlcv-reminders:active"),
          this.redis.zcard("bull:qlcv-reminders:delayed"),
          this.redis.zcard("bull:qlcv-reminders:failed"),
        ]),
      );
      let heartbeatAt: number | null = null;
      if (heartbeat) {
        const parsed: unknown = JSON.parse(heartbeat);
        if (
          parsed &&
          typeof parsed === "object" &&
          "timestamp" in parsed &&
          typeof parsed.timestamp === "number"
        ) {
          heartbeatAt = parsed.timestamp;
        }
      }
      const heartbeatAgeSeconds =
        heartbeatAt === null
          ? null
          : Math.max(0, Math.floor((Date.now() - heartbeatAt) / 1000));
      const waitingCount = Number(waiting);
      const delayedCount = Number(delayed);
      const backlog = waitingCount + delayedCount;
      const workerHealthy =
        heartbeatAgeSeconds !== null && heartbeatAgeSeconds < 90;
      const backlogHealthy = backlog <= this.env.OPS_QUEUE_BACKLOG_LIMIT;
      const healthy = workerHealthy && backlogHealthy;
      return {
        status: healthy ? "ok" : "degraded",
        worker: {
          status: workerHealthy ? "ok" : "stale",
          heartbeatAgeSeconds,
        },
        queue: {
          waiting: waitingCount,
          active: Number(active),
          delayed: delayedCount,
          failed: Number(failed),
          backlog,
          limit: this.env.OPS_QUEUE_BACKLOG_LIMIT,
          status: backlogHealthy ? "ok" : "backlog",
        },
      };
    } catch (error) {
      throw new ServiceUnavailableException({
        message: "Không lấy được trạng thái vận hành",
        cause: describeError(error),
      });
    }
  }
}
