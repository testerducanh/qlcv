import { Controller, Get, Inject, Res } from "@nestjs/common";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import type { Response } from "express";
import type Redis from "ioredis";
import { describeError } from "../common/describe-error";
import type { Env } from "../config/env";
import { ENV, PrismaService, REDIS, S3 } from "../infra/infra.module";

function withTimeout<T>(p: Promise<T>, ms = 2000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error("quá thời gian chờ")), ms),
    ),
  ]);
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
}
