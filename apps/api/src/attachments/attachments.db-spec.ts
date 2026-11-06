jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn().mockResolvedValue("https://s3.example.test/signed"),
}));
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
    Inject: decorator,
    Injectable: decorator,
    Logger: class {
      error = jest.fn();
      log = jest.fn();
    },
    NotFoundException: class extends HttpError {
      constructor(message = "Not found") {
        super(message, 404);
      }
    },
  };
});
jest.mock("../infra/infra.module", () => ({
  ENV: "ENV",
  PrismaService: class PrismaService {},
  S3: "S3",
}));

import { randomUUID } from "node:crypto";
import {
  Confidentiality,
  Prisma,
  PrismaClient,
  ProjectRole,
} from "@prisma/client";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import type { AuthenticatedUser } from "../auth/auth.service";
import type { Env } from "../config/env";
import type { PrismaService } from "../infra/infra.module";
import { AttachmentsService } from "./attachments.service";

const prisma = new PrismaClient();
const defaultEnv = {
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
  ATTACHMENT_ALLOWED_MIME: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ],
  ATTACHMENT_MAX_FILE_BYTES: 25 * 1024 * 1024,
  ATTACHMENT_MAX_PER_TASK: 100,
  ATTACHMENT_PROJECT_QUOTA_BYTES: 5 * 1024 * 1024 * 1024,
  ATTACHMENT_ORGANIZATION_QUOTA_BYTES: 100 * 1024 * 1024 * 1024,
  ATTACHMENT_UPLOAD_URL_SECONDS: 300,
  ATTACHMENT_DOWNLOAD_URL_SECONDS: 120,
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

function serviceFor(
  tx: Prisma.TransactionClient,
  send: jest.Mock,
  env: Env = defaultEnv,
): AttachmentsService {
  const txPrisma = new Proxy(tx, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        return (work: (client: Prisma.TransactionClient) => Promise<unknown>) =>
          work(tx);
      }
      return Reflect.get(target, property, receiver);
    },
  }) as unknown as PrismaService;
  return new AttachmentsService(txPrisma, env, { send } as unknown as S3Client);
}

async function fixtures(tx: Prisma.TransactionClient) {
  const suffix = randomUUID();
  const organization = await tx.organization.create({
    data: { name: `Attachment integration ${suffix}` },
  });
  const branch = await tx.branch.create({
    data: { organizationId: organization.id, name: `Branch ${suffix}` },
  });
  const user = await tx.user.create({
    data: {
      organizationId: organization.id,
      branchId: branch.id,
      email: `attachment-${suffix}@example.test`,
      name: "Attachment owner",
      status: "active",
    },
  });
  const outsider = await tx.user.create({
    data: {
      organizationId: organization.id,
      branchId: branch.id,
      email: `outsider-${suffix}@example.test`,
      name: "Attachment outsider",
      status: "active",
    },
  });
  const project = await tx.project.create({
    data: {
      branchId: branch.id,
      ownerId: user.id,
      name: `Project ${suffix}`,
      confidentiality: Confidentiality.normal,
    },
  });
  await tx.projectMember.create({
    data: { projectId: project.id, userId: user.id, role: ProjectRole.owner },
  });
  const task = await tx.task.create({
    data: {
      projectId: project.id,
      creatorId: user.id,
      title: "Task with attachment",
      position: "000000000001",
    },
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
  const outsiderActor: AuthenticatedUser = {
    ...actor,
    id: outsider.id,
    email: outsider.email,
    name: outsider.name,
  };
  return { actor, outsiderActor, project, task };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("AttachmentsService database workflows", () => {
  it("removes expired guest upload staging files and their unconfirmed rows", async () => {
    await inRollback(async (tx) => {
      const { actor, project, task } = await fixtures(tx);
      const guest = await tx.guestAccess.create({
        data: {
          projectId: project.id,
          invitedById: actor.id,
          name: "Guest upload",
          email: `guest-upload-${randomUUID()}@example.test`,
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      await tx.guestTaskAccess.create({
        data: { guestAccessId: guest.id, taskId: task.id },
      });
      const submission = await tx.guestSubmission.create({
        data: {
          guestAccessId: guest.id,
          taskId: task.id,
          body: "Submission with an expired upload",
        },
      });
      const file = await tx.guestSubmissionFile.create({
        data: {
          submissionId: submission.id,
          fileName: "expired.pdf",
          mime: "application/pdf",
          size: 10,
          storageKey: `guest-submissions/${guest.id}/expired`,
          uploadStorageKey: `guest-staging/${guest.id}/expired`,
          uploadExpiresAt: new Date(Date.now() - 1000),
        },
      });
      const send = jest.fn().mockResolvedValue({});
      const service = serviceFor(tx, send);

      expect(await service.purgeExpired()).toBe(1);
      expect(
        await tx.guestSubmissionFile.findUnique({ where: { id: file.id } }),
      ).toBeNull();
      expect(send).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
    });
  });

  it("rejects disguised executables, unauthorized upload and over-quota requests", async () => {
    await inRollback(async (tx) => {
      const { actor, outsiderActor, project, task } = await fixtures(tx);
      await tx.project.update({
        where: { id: project.id },
        data: { confidentiality: Confidentiality.restricted },
      });
      const send = jest.fn().mockResolvedValue({});
      const service = serviceFor(tx, send);
      await expect(
        service.createUpload(outsiderActor, project.id, {
          taskId: task.id,
          fileName: "photo.jpg",
          mime: "image/jpeg",
          size: 12,
        }),
      ).rejects.toMatchObject({ status: 404 });

      const limited = serviceFor(tx, send, {
        ...defaultEnv,
        ATTACHMENT_PROJECT_QUOTA_BYTES: 5,
      } as Env);
      await expect(
        limited.createUpload(actor, project.id, {
          taskId: task.id,
          fileName: "photo.jpg",
          mime: "image/jpeg",
          size: 12,
        }),
      ).rejects.toThrow("vượt hạn mức dung lượng của dự án");

      const { id } = await service.createUpload(actor, project.id, {
        taskId: task.id,
        fileName: "photo.jpg",
        mime: "image/jpeg",
        size: 9,
      });
      const disguised = Buffer.from("MZfakeexe");
      send.mockImplementation(async (command: unknown) => {
        if (command instanceof HeadObjectCommand)
          return { ContentLength: disguised.length };
        if (command instanceof GetObjectCommand)
          return {
            ETag: '"validated"',
            Body: { transformToByteArray: async () => disguised },
          };
        return {};
      });
      await expect(
        service.confirmUpload(actor, project.id, id),
      ).rejects.toThrow("Nội dung tệp không khớp loại đã khai báo");
      expect(
        await tx.attachment.findUniqueOrThrow({ where: { id } }),
      ).toMatchObject({
        confirmedAt: null,
        uploadStorageKey: expect.stringContaining("/pending"),
      });
    });
  });

  it("auto-orients images, stores 320/1280 variants, and logs authorized downloads", async () => {
    await inRollback(async (tx) => {
      const { actor, outsiderActor, project, task } = await fixtures(tx);
      await tx.project.update({
        where: { id: project.id },
        data: { confidentiality: Confidentiality.restricted },
      });
      const image = await sharp({
        create: {
          width: 20,
          height: 40,
          channels: 3,
          background: "#336699",
        },
      })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .toBuffer();
      const stored: Array<{ key?: string; width: number; height: number }> = [];
      const send = jest.fn(async (command: unknown) => {
        if (command instanceof HeadObjectCommand)
          return { ContentLength: image.length };
        if (command instanceof GetObjectCommand)
          return {
            ETag: '"validated"',
            Body: { transformToByteArray: async () => image },
          };
        if (command instanceof PutObjectCommand) {
          const input = command.input as { Key: string; Body: Buffer };
          const metadata = await sharp(input.Body).metadata();
          stored.push({
            key: input.Key,
            width: metadata.width ?? 0,
            height: metadata.height ?? 0,
          });
        }
        return {};
      });
      const service = serviceFor(tx, send);
      const { id } = await service.createUpload(actor, project.id, {
        taskId: task.id,
        fileName: "portrait.jpg",
        mime: "image/jpeg",
        size: image.length,
      });
      expect(
        await tx.attachment.findUniqueOrThrow({ where: { id } }),
      ).toMatchObject({
        storageKey: expect.not.stringContaining("/pending"),
        uploadStorageKey: expect.stringContaining("/pending"),
        confirmedAt: null,
      });
      const confirmed = await service.confirmUpload(actor, project.id, id);
      expect(confirmed).toMatchObject({
        mime: "image/jpeg",
        width: 40,
        height: 20,
      });
      expect(
        await service.listLibrary(actor, project.id, { page: 1, pageSize: 10 }),
      ).toMatchObject({ total: 1, items: [expect.objectContaining({ id })] });
      expect(stored).toHaveLength(2);
      expect(stored.map(({ key }) => key)).toEqual([
        expect.stringContaining("-320.webp"),
        expect.stringContaining("-1280.webp"),
      ]);
      expect(stored[0]).toMatchObject({ width: 40, height: 20 });
      expect(
        send.mock.calls.some(
          ([command]) => command instanceof CopyObjectCommand,
        ),
      ).toBe(true);
      expect(
        await tx.attachment.findUniqueOrThrow({ where: { id } }),
      ).toMatchObject({
        storageKey: expect.not.stringContaining("/pending"),
        uploadStorageKey: expect.stringContaining("/pending"),
      });

      const nextVersion = await service.createUpload(actor, project.id, {
        taskId: task.id,
        fileName: "portrait.jpg",
        mime: "image/jpeg",
        size: image.length,
        versionGroupId: confirmed.versionGroupId,
      });
      const versionTwo = await service.confirmUpload(
        actor,
        project.id,
        nextVersion.id,
      );
      expect(versionTwo.versionNo).toBe(2);
      expect(await service.history(actor, project.id, id)).toMatchObject([
        { id: nextVersion.id, versionNo: 2, isCurrent: true },
        { id, versionNo: 1, isCurrent: false },
      ]);

      await expect(
        service.download(outsiderActor, project.id, id, "original"),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        service.download(
          { ...outsiderActor, systemRole: "branch_director" },
          project.id,
          id,
          "original",
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(
        await tx.activityLog.count({
          where: { entityType: "attachment", entityId: id },
        }),
      ).toBe(0);
      await service.download(actor, project.id, id, "original");
      expect(
        await tx.activityLog.count({
          where: {
            entityType: "attachment",
            entityId: id,
            actorId: actor.id,
            action: "attachment.download_url_issued",
          },
        }),
      ).toBe(1);

      await service.softDelete(actor, project.id, nextVersion.id);
      expect(await service.listTrash(actor, project.id, 1, 10)).toMatchObject({
        total: 1,
        items: [expect.objectContaining({ id: nextVersion.id })],
      });
      await expect(
        service.restore(actor, project.id, nextVersion.id),
      ).resolves.toMatchObject({ id: nextVersion.id, isCurrent: false });

      const expired = await tx.attachment.create({
        data: {
          projectId: project.id,
          taskId: task.id,
          uploaderId: actor.id,
          fileName: "expired.pdf",
          mime: "application/pdf",
          size: 10,
          storageKey: `projects/${project.id}/expired`,
          confirmedAt: new Date(),
          deletedAt: new Date(Date.now() - 31 * 86400000),
        },
      });
      expect(await service.purgeExpired()).toBe(1);
      expect(
        await tx.attachment.findUnique({ where: { id: expired.id } }),
      ).toBeNull();
      expect(
        await service.purgeExpired(new Date(Date.now() + 6 * 60 * 1000)),
      ).toBe(2);
      expect(
        await tx.attachment.findUniqueOrThrow({ where: { id } }),
      ).toMatchObject({
        uploadStorageKey: null,
        confirmedAt: expect.any(Date),
      });
    });
  });
});
