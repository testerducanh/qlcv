import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import sharp from "sharp";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { AppModule } from "../src/app.module";
import { REDIS, S3 } from "../src/infra/infra.module";

const demoPassword = "Demo-Only-2026!";
const adminEmail = "demo.admin@qlcv.local";
const memberEmail = "demo.member.one@qlcv.local";
const prisma = new PrismaClient();
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
});

describe("API end-to-end workflows", () => {
  let app: INestApplication;
  let projectId: string | undefined;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: ["error"] });
    await app.init();
    const redis = app.get<Redis>(REDIS);
    if (redis.status === "wait") await redis.connect();
    if (redis.status !== "ready") {
      await new Promise<void>((resolve, reject) => {
        redis.once("ready", resolve);
        redis.once("error", reject);
      });
    }
  });

  afterAll(async () => {
    const e2eProjects = await prisma.project.findMany({
      where: {
        name: { startsWith: "E2E project " },
        owner: { email: adminEmail },
      },
      select: { id: true },
    });
    for (const project of e2eProjects) {
      const attachments = await prisma.attachment.findMany({
        where: { projectId: project.id },
        select: {
          storageKey: true,
          uploadStorageKey: true,
          thumbKey: true,
          previewKey: true,
        },
      });
      for (const attachment of attachments) {
        for (const key of [
          attachment.storageKey,
          attachment.uploadStorageKey,
          attachment.thumbKey,
          attachment.previewKey,
        ]) {
          if (key)
            await s3.send(
              new DeleteObjectCommand({
                Bucket: process.env.S3_BUCKET,
                Key: key,
              }),
            );
        }
      }
      await prisma.project.deleteMany({ where: { id: project.id } });
    }
    if (app) {
      (app.get(REDIS) as Redis).disconnect();
      (app.get(S3) as S3Client).destroy();
      await app.close();
    }
    s3.destroy();
    await prisma.$disconnect();
  });

  it("documents every protected route and keeps the public endpoint allowlist explicit", () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("QLCV API")
        .setVersion("1.0")
        .addBearerAuth()
        .addCookieAuth("qlcv_refresh", { type: "apiKey", in: "cookie" })
        .build(),
    );
    const publicOperations = new Set([
      "GET /health",
      "GET /health/live",
      "POST /auth/login",
      "POST /auth/refresh",
      "POST /auth/logout",
      "POST /auth/password/forgot",
      "POST /auth/password/reset",
      "POST /invitations/accept",
    ]);

    for (const [path, pathItem] of Object.entries(document.paths)) {
      for (const method of ["get", "post", "put", "patch", "delete"] as const) {
        const operation = pathItem[method];
        if (!operation) continue;
        const key = `${method.toUpperCase()} ${path}`;
        if (!publicOperations.has(key)) {
          expect(operation.security).toEqual(
            expect.arrayContaining([expect.objectContaining({ bearer: [] })]),
          );
        }
      }
    }
  });

  it("runs login, project membership, task, upload, comment, mention, notification, and trash flows", async () => {
    const anonymous = await request(app.getHttpServer()).get("/projects");
    expect(anonymous.status).toBe(401);
    const login = async (email: string) => {
      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email, password: demoPassword });
      if (response.status !== 201) {
        throw new Error(
          `Đăng nhập e2e thất bại: ${JSON.stringify(response.body)}`,
        );
      }
      expect(response.body.accessToken).toBeTruthy();
      const setCookie = response.headers["set-cookie"];
      const cookie = (
        Array.isArray(setCookie) ? setCookie[0] : setCookie
      )?.split(";")[0];
      if (!cookie) throw new Error("Login response không đặt refresh cookie.");
      expect(setCookie).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/HttpOnly/i),
          expect.stringMatching(/SameSite=Lax/i),
        ]),
      );
      return { accessToken: response.body.accessToken as string, cookie };
    };
    const admin = await login(adminEmail);
    const memberSession = await login(memberEmail);
    const outsiderSession = await login("demo.member.two@qlcv.local");
    const adminToken = admin.accessToken;
    const memberToken = memberSession.accessToken;
    const refreshed = await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", admin.cookie);
    expect(refreshed.status).toBe(201);
    const rotatedCookieHeader = refreshed.headers["set-cookie"];
    const rotatedCookie = (
      Array.isArray(rotatedCookieHeader)
        ? rotatedCookieHeader[0]
        : rotatedCookieHeader
    )?.split(";")[0];
    if (!rotatedCookie)
      throw new Error("Refresh response không xoay refresh cookie.");
    const logout = await request(app.getHttpServer())
      .post("/auth/logout")
      .set("Cookie", rotatedCookie);
    expect(logout.status).toBe(204);
    const branch = await prisma.branch.findFirstOrThrow({
      where: { code: "DEMO-BAC" },
    });
    const member = await prisma.user.findUniqueOrThrow({
      where: { email: memberEmail },
    });
    const projectResponse = await request(app.getHttpServer())
      .post("/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        branchId: branch.id,
        name: `E2E project ${randomUUID()}`,
        confidentiality: "restricted",
      });
    expect(projectResponse.status).toBe(201);
    projectId = projectResponse.body.id as string;

    const membership = await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ userId: member.id, role: "member" });
    expect(membership.status).toBe(201);

    const groupResponse = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "E2E task group", type: "group" });
    expect(groupResponse.status).toBe(201);
    const groupId = groupResponse.body.id as string;
    const taskResponse = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "E2E upload and mention task",
        parentId: groupId,
        assigneeId: member.id,
      });
    expect(taskResponse.status).toBe(201);
    const taskId = taskResponse.body.id as string;
    const hiddenTask = await request(app.getHttpServer())
      .get(`/projects/${projectId}/tasks/${taskId}`)
      .set("Authorization", `Bearer ${outsiderSession.accessToken}`);
    expect(hiddenTask.status).toBe(404);

    const image = await sharp({
      create: { width: 1, height: 1, channels: 3, background: "#16A34A" },
    })
      .png()
      .toBuffer();
    const upload = await request(app.getHttpServer())
      .post(`/projects/${projectId}/attachments/upload-url`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        taskId,
        fileName: "e2e.png",
        mime: "image/png",
        size: image.length,
      });
    expect(upload.status).toBe(201);
    const uploaded = await fetch(upload.body.uploadUrl, {
      method: "PUT",
      headers: upload.body.headers,
      body: image,
    });
    expect(uploaded.ok).toBe(true);
    const confirmed = await request(app.getHttpServer())
      .post(`/projects/${projectId}/attachments/${upload.body.id}/confirm`)
      .set("Authorization", `Bearer ${adminToken}`);
    if (confirmed.status !== 201) {
      throw new Error(
        `Xác nhận upload e2e thất bại: ${JSON.stringify(confirmed.body)}`,
      );
    }

    const comment = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks/${taskId}/comments`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        body: "E2E mention",
        mentionIds: [member.id],
        attachmentIds: [upload.body.id],
      });
    expect(comment.status).toBe(201);

    const notifications = await request(app.getHttpServer())
      .get("/notifications")
      .set("Authorization", `Bearer ${memberToken}`);
    expect(notifications.status).toBe(200);
    expect(JSON.stringify(notifications.body)).toContain("mentioned");

    const deleted = await request(app.getHttpServer())
      .delete(`/projects/${projectId}/tasks/${taskId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleted.status).toBe(200);
    const trash = await request(app.getHttpServer())
      .get(`/projects/${projectId}/trash`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(trash.status).toBe(200);
    expect(JSON.stringify(trash.body)).toContain(taskId);
  });
});
