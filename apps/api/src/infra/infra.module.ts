import { Global, Injectable, Module, OnModuleDestroy } from "@nestjs/common";
import { S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { Env, loadEnv } from "../config/env";

export const ENV = "ENV";
export const REDIS = "REDIS";
export const S3 = "S3";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    PrismaService,
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: Env) => {
        const client = new Redis(env.REDIS_URL, {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        });
        client.on("error", () => {}); // lỗi sẽ hiện ở /health, tránh làm sập tiến trình
        return client;
      },
    },
    {
      provide: S3,
      inject: [ENV],
      useFactory: (env: Env) =>
        new S3Client({
          endpoint: env.S3_ENDPOINT,
          region: env.S3_REGION,
          forcePathStyle: env.S3_FORCE_PATH_STYLE,
          credentials: {
            accessKeyId: env.S3_ACCESS_KEY,
            secretAccessKey: env.S3_SECRET_KEY,
          },
        }),
    },
  ],
  exports: [ENV, PrismaService, REDIS, S3],
})
export class InfraModule {}
