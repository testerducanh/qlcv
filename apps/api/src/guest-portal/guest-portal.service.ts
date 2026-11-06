import { randomBytes, randomUUID, createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Confidentiality, Prisma, ProjectRole } from "@prisma/client";
import { PDFDocument, degrees } from "pdf-lib";
import sharp from "sharp";
import type { AuthenticatedUser } from "../auth/auth.service";
import type { Env } from "../config/env";
import {
  safeAttachmentFileName,
  sniffAttachmentMime,
} from "../attachments/file-utils";
import { ENV, PrismaService, S3 } from "../infra/infra.module";
import { VIRUS_SCANNER, type VirusScanner } from "../attachments/virus-scanner";
import { ApprovalsService } from "../approvals/approvals.service";

type Actor = AuthenticatedUser;
type GuestWithProject = Prisma.GuestAccessGetPayload<{
  include: { project: true };
}>;

const guestUploadMimes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const guestWatermarkMimes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

function escapeXml(value: string) {
  const entities: Record<string, string> = {
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  };
  return value.replace(/[<>&'"]/g, (character) => entities[character]!);
}

@Injectable()
export class GuestPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalsService,
    @Inject(ENV) private readonly env: Env,
    @Inject(S3) private readonly s3: S3Client,
    @Inject(VIRUS_SCANNER) private readonly virusScanner: VirusScanner,
  ) {}

  async createInvite(
    actor: Actor,
    projectId: string,
    input: {
      name: string;
      email: string;
      expiresInDays: number;
      taskIds: string[];
      attachmentIds: string[];
      approvalFlowId?: string;
    },
  ) {
    const project = await this.requireProjectManager(actor, projectId);
    const taskIds = [...new Set(input.taskIds)];
    const attachmentIds = [...new Set(input.attachmentIds)];
    if (!taskIds.length || taskIds.length > 50 || attachmentIds.length > 100)
      throw new BadRequestException("Phạm vi khách không hợp lệ");
    const tasks = await this.prisma.task.findMany({
      where: { id: { in: taskIds }, projectId, deletedAt: null },
      select: { id: true },
    });
    if (tasks.length !== taskIds.length)
      throw new BadRequestException("Có công việc không thuộc dự án");
    let shareRows: { id: string; taskId: string }[] = [];
    if (attachmentIds.length) {
      const attachments = await this.prisma.attachment.findMany({
        where: {
          id: { in: attachmentIds },
          projectId,
          taskId: { in: taskIds },
          deletedAt: null,
          confirmedAt: { not: null },
        },
        select: { id: true, taskId: true, mime: true },
      });
      if (
        attachments.length !== attachmentIds.length ||
        attachments.some(
          (attachment) =>
            !attachment.taskId ||
            (project.guestWatermark &&
              !guestWatermarkMimes.has(attachment.mime)),
        )
      )
        throw new BadRequestException(
          "Tệp chia sẻ phải thuộc công việc đã chọn và có định dạng được hỗ trợ",
        );
      shareRows = attachments.map((attachment) => {
        if (!attachment.taskId)
          throw new BadRequestException(
            "Tệp chia sẻ phải thuộc một công việc được chọn",
          );
        return { id: attachment.id, taskId: attachment.taskId };
      });
    }

    const restricted = project.confidentiality === Confidentiality.restricted;
    if (restricted && !input.approvalFlowId)
      throw new BadRequestException(
        "Dự án mật cần luồng duyệt khách ngoài được bật",
      );
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + input.expiresInDays * 86400000);
    const guest = await this.prisma.$transaction(async (tx) => {
      const created = await tx.guestAccess.create({
        data: {
          projectId,
          invitedById: actor.id,
          name: input.name,
          email: input.email,
          tokenHash: this.hashToken(token),
          status: restricted ? "pending_approval" : "active",
          expiresAt,
          tasks: {
            createMany: { data: taskIds.map((taskId) => ({ taskId })) },
          },
        },
      });
      if (attachmentIds.length) {
        await tx.guestSharedAttachment.createMany({
          data: shareRows.map(({ id: attachmentId, taskId }) => {
            return {
              guestAccessId: created.id,
              taskId,
              attachmentId,
            };
          }),
        });
      }
      if (restricted && input.approvalFlowId) {
        await this.approvals.createGuestInviteRequest(
          actor,
          projectId,
          created.id,
          input.approvalFlowId,
          tx,
        );
      }
      await tx.activityLog.create({
        data: {
          entityType: "guest_access",
          entityId: created.id,
          projectId,
          actorId: actor.id,
          action: restricted ? "guest_invite_requested" : "guest_invited",
          after: {
            email: input.email,
            taskIds,
            attachmentIds,
            expiresAt: expiresAt.toISOString(),
          },
        },
      });
      return created;
    });
    return {
      id: guest.id,
      name: guest.name,
      email: guest.email,
      status: guest.status,
      expiresAt: guest.expiresAt,
      token,
    };
  }

  async listInvites(actor: Actor, projectId: string) {
    await this.requireProjectManager(actor, projectId);
    return this.prisma.guestAccess.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        revokedAt: true,
        tasks: { select: { taskId: true, task: { select: { title: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async revokeInvite(actor: Actor, projectId: string, guestAccessId: string) {
    await this.requireProjectManager(actor, projectId);
    const result = await this.prisma.guestAccess.updateMany({
      where: {
        id: guestAccessId,
        projectId,
        status: { in: ["active", "pending_approval"] },
      },
      data: { status: "revoked", revokedAt: new Date() },
    });
    if (!result.count) throw new NotFoundException();
    await this.prisma.activityLog.create({
      data: {
        entityType: "guest_access",
        entityId: guestAccessId,
        projectId,
        actorId: actor.id,
        action: "guest_access_revoked",
      },
    });
    return { revoked: true };
  }

  async requestInviteApproval(
    actor: Actor,
    projectId: string,
    guestAccessId: string,
    flowId: string,
  ) {
    await this.requireProjectManager(actor, projectId);
    return this.prisma.$transaction(async (tx) => {
      const pendingRequest = await tx.approvalRequest.findFirst({
        where: {
          projectId,
          subjectType: "guest_invite",
          subjectId: guestAccessId,
          status: "pending",
        },
      });
      if (pendingRequest) return pendingRequest;
      return this.approvals.createGuestInviteRequest(
        actor,
        projectId,
        guestAccessId,
        flowId,
        tx,
      );
    });
  }

  async me(token: string | undefined) {
    const guest = await this.authenticate(token);
    await this.audit(guest, "guest_portal_opened");
    return {
      name: guest.name,
      email: guest.email,
      projectName: guest.project.name,
      expiresAt: guest.expiresAt,
    };
  }

  async listTasks(token: string | undefined) {
    const guest = await this.authenticate(token);
    const rows = await this.prisma.guestTaskAccess.findMany({
      where: { guestAccessId: guest.id, task: { deletedAt: null } },
      select: {
        task: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            dueDate: true,
          },
        },
      },
      orderBy: { task: { title: "asc" } },
    });
    await this.audit(guest, "guest_tasks_listed");
    return rows.map(({ task }) => task);
  }

  async getTask(token: string | undefined, taskId: string) {
    const guest = await this.authenticate(token);
    const entry = await this.prisma.guestTaskAccess.findFirst({
      where: { guestAccessId: guest.id, taskId, task: { deletedAt: null } },
      select: {
        task: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            dueDate: true,
            projectId: true,
          },
        },
        sharedFiles: {
          where: {
            attachment: { deletedAt: null, confirmedAt: { not: null } },
          },
          select: {
            attachment: {
              select: { id: true, fileName: true, mime: true, size: true },
            },
          },
        },
      },
    });
    if (!entry) return this.deny(guest, "guest_task_denied", taskId);
    await this.audit(guest, "guest_task_viewed", taskId);
    return {
      ...entry.task,
      sharedFiles: entry.sharedFiles.map(({ attachment }) => attachment),
    };
  }

  async listSubmissions(token: string | undefined, taskId: string) {
    const guest = await this.authenticate(token);
    if (!(await this.hasTaskAccess(guest.id, taskId)))
      return this.deny(guest, "guest_submission_list_denied", taskId);
    const rows = await this.prisma.guestSubmission.findMany({
      where: { guestAccessId: guest.id, taskId },
      select: {
        id: true,
        body: true,
        createdAt: true,
        files: {
          where: { confirmedAt: { not: null } },
          select: {
            id: true,
            fileName: true,
            mime: true,
            size: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    await this.audit(guest, "guest_submissions_listed", taskId);
    return rows;
  }

  async submit(token: string | undefined, taskId: string, body: string) {
    const guest = await this.authenticate(token);
    if (!(await this.hasTaskAccess(guest.id, taskId)))
      return this.deny(guest, "guest_submission_denied", taskId);
    const submission = await this.prisma.guestSubmission.create({
      data: { guestAccessId: guest.id, taskId, body },
      select: { id: true, taskId: true, body: true, createdAt: true },
    });
    await this.audit(guest, "guest_submission_created", taskId, {
      submissionId: submission.id,
    });
    return submission;
  }

  async createSubmissionUpload(
    token: string | undefined,
    submissionId: string,
    input: { fileName: string; mime: string; size: number },
  ) {
    const guest = await this.authenticate(token);
    const fileName = safeAttachmentFileName(input.fileName);
    const mime = input.mime.trim().toLowerCase();
    if (
      !fileName ||
      !guestUploadMimes.has(mime) ||
      !this.env.ATTACHMENT_ALLOWED_MIME.includes(mime)
    )
      throw new BadRequestException("Tên hoặc loại tệp không được phép");
    if (input.size > this.env.ATTACHMENT_MAX_FILE_BYTES)
      throw new BadRequestException("Tệp vượt quá giới hạn kích thước");
    const submission = await this.prisma.guestSubmission.findFirst({
      where: { id: submissionId, guestAccessId: guest.id },
      select: { id: true },
    });
    if (!submission)
      return this.deny(guest, "guest_submission_file_denied", submissionId);
    const count = await this.prisma.guestSubmissionFile.count({
      where: { submissionId },
    });
    if (count >= 10) throw new BadRequestException("Mỗi lần nộp tối đa 10 tệp");
    const id = randomUUID();
    const stageKey = `guest-staging/${guest.id}/${id}`;
    const storageKey = `guest-submissions/${guest.id}/${id}`;
    const uploadExpiresAt = new Date(Date.now() + 180000);
    const file = await this.prisma.guestSubmissionFile.create({
      data: {
        id,
        submissionId,
        fileName,
        mime,
        size: input.size,
        storageKey,
        uploadStorageKey: stageKey,
        uploadExpiresAt,
      },
    });
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: stageKey,
        ContentType: mime,
      }),
      { expiresIn: 180 },
    );
    await this.audit(guest, "guest_submission_upload_created", submissionId, {
      fileId: file.id,
      fileName,
      size: input.size,
    });
    return { fileId: file.id, uploadUrl, expiresAt: uploadExpiresAt };
  }

  async confirmSubmissionUpload(
    token: string | undefined,
    submissionId: string,
    fileId: string,
  ) {
    const guest = await this.authenticate(token);
    const file = await this.prisma.guestSubmissionFile.findFirst({
      where: {
        id: fileId,
        submissionId,
        submission: { guestAccessId: guest.id },
        confirmedAt: null,
        uploadExpiresAt: { gt: new Date() },
      },
    });
    if (!file || !file.uploadStorageKey)
      return this.deny(guest, "guest_submission_file_confirm_denied", fileId);
    const head = await this.s3.send(
      new HeadObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: file.uploadStorageKey,
      }),
    );
    if (
      head.ContentLength !== file.size ||
      head.ContentLength > this.env.ATTACHMENT_MAX_FILE_BYTES
    )
      throw new BadRequestException("Kích thước nội dung tải lên không khớp");
    const object = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: file.uploadStorageKey,
      }),
    );
    if (
      !object.Body ||
      !("transformToByteArray" in object.Body) ||
      !object.ETag
    )
      throw new BadRequestException("Không thể xác minh nội dung tệp");
    const bytes = Buffer.from(await object.Body.transformToByteArray());
    const detectedMime = sniffAttachmentMime(bytes);
    if (detectedMime !== file.mime || !detectedMime)
      throw new BadRequestException("Nội dung tệp không khớp loại đã khai báo");
    if (!this.env.ATTACHMENT_ALLOWED_MIME.includes(detectedMime))
      throw new BadRequestException(`Loại tệp ${detectedMime} không được phép`);
    await this.virusScanner.scan(bytes, file.fileName);
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: file.storageKey,
        Body: bytes,
        ContentType: detectedMime,
      }),
    );
    const updated = await this.prisma.guestSubmissionFile.updateMany({
      where: {
        id: file.id,
        confirmedAt: null,
        uploadExpiresAt: { gt: new Date() },
      },
      data: {
        confirmedAt: new Date(),
        uploadStorageKey: null,
        uploadExpiresAt: null,
      },
    });
    if (updated.count !== 1)
      throw new ConflictException("Tệp đã được xác nhận hoặc đã hết hạn");
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: file.uploadStorageKey,
      }),
    );
    await this.audit(guest, "guest_submission_file_confirmed", submissionId, {
      fileId,
    });
    return { id: file.id, fileName: file.fileName, confirmed: true };
  }

  async downloadSharedFile(token: string | undefined, attachmentId: string) {
    const guest = await this.authenticate(token);
    const share = await this.prisma.guestSharedAttachment.findFirst({
      where: {
        guestAccessId: guest.id,
        attachmentId,
        attachment: { deletedAt: null, confirmedAt: { not: null } },
      },
      select: {
        taskId: true,
        attachment: {
          select: { storageKey: true, fileName: true, mime: true },
        },
      },
    });
    if (!share)
      return this.deny(guest, "guest_shared_file_denied", attachmentId);
    const result = await this.loadWatermarkedFile(
      guest,
      share.attachment.storageKey,
      share.attachment.fileName,
      share.attachment.mime,
    );
    await this.audit(guest, "guest_shared_file_downloaded", share.taskId, {
      attachmentId,
    });
    return result;
  }

  async downloadSubmissionFile(token: string | undefined, fileId: string) {
    const guest = await this.authenticate(token);
    const file = await this.prisma.guestSubmissionFile.findFirst({
      where: {
        id: fileId,
        confirmedAt: { not: null },
        submission: { guestAccessId: guest.id },
      },
      select: {
        storageKey: true,
        fileName: true,
        mime: true,
        submission: { select: { taskId: true } },
      },
    });
    if (!file)
      return this.deny(guest, "guest_submission_download_denied", fileId);
    const result = await this.loadWatermarkedFile(
      guest,
      file.storageKey,
      file.fileName,
      file.mime,
    );
    await this.audit(
      guest,
      "guest_submission_file_downloaded",
      file.submission.taskId,
      {
        fileId,
      },
    );
    return result;
  }

  private async loadWatermarkedFile(
    guest: GuestWithProject,
    storageKey: string,
    fileName: string,
    mime: string,
  ) {
    const head = await this.s3.send(
      new HeadObjectCommand({ Bucket: this.env.S3_BUCKET, Key: storageKey }),
    );
    if (
      head.ContentLength === undefined ||
      head.ContentLength > this.env.ATTACHMENT_MAX_FILE_BYTES
    )
      throw new BadRequestException("Tệp vượt quá giới hạn kích thước");
    const object = await this.s3.send(
      new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: storageKey }),
    );
    if (!object.Body || !("transformToByteArray" in object.Body))
      throw new BadRequestException("Không thể đọc nội dung tệp");
    let buffer = Buffer.from(await object.Body.transformToByteArray());
    if (guest.project.guestWatermark) {
      const watermark = `${guest.name} | ${guest.email} | ${new Date().toISOString()}`;
      if (mime === "application/pdf") {
        const pdf = await PDFDocument.load(buffer);
        const svg = Buffer.from(
          `<svg width="1200" height="160" xmlns="http://www.w3.org/2000/svg"><text x="20" y="105" fill="#666" fill-opacity="0.62" font-family="Arial, sans-serif" font-size="42" transform="rotate(-16 600 80)">${escapeXml(watermark)}</text></svg>`,
        );
        const image = await pdf.embedPng(await sharp(svg).png().toBuffer());
        for (const page of pdf.getPages()) {
          const { width, height } = page.getSize();
          page.drawImage(image, {
            x: width * 0.05,
            y: height * 0.37,
            width: width * 0.9,
            height: Math.min(height * 0.3, width * 0.12),
            opacity: 0.24,
            rotate: degrees(25),
          });
        }
        buffer = Buffer.from(await pdf.save());
      } else {
        if (!guestWatermarkMimes.has(mime))
          throw new BadRequestException(
            "Không thể áp dụng watermark cho định dạng tệp này",
          );
        const image = sharp(buffer, { limitInputPixels: 40_000_000 }).rotate();
        const metadata = await image.metadata();
        if (!metadata.width || !metadata.height)
          throw new BadRequestException("Ảnh không hợp lệ");
        const width =
          metadata.orientation &&
          metadata.orientation >= 5 &&
          metadata.orientation <= 8
            ? metadata.height
            : metadata.width;
        const height =
          metadata.orientation &&
          metadata.orientation >= 5 &&
          metadata.orientation <= 8
            ? metadata.width
            : metadata.height;
        const svg = Buffer.from(
          `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><text x="5%" y="55%" fill="white" fill-opacity="0.62" font-family="Arial, sans-serif" font-size="${Math.max(14, Math.floor(width / 28))}" transform="rotate(-28 ${Math.floor(width / 2)} ${Math.floor(height / 2)})">${escapeXml(watermark)}</text></svg>`,
        );
        const composite = sharp(buffer, { limitInputPixels: 40_000_000 })
          .rotate()
          .composite([{ input: svg }]);
        buffer =
          mime === "image/jpeg"
            ? await composite.jpeg().toBuffer()
            : mime === "image/png"
              ? await composite.png().toBuffer()
              : await composite.webp().toBuffer();
      }
    }
    return { buffer, fileName, mime };
  }

  private async authenticate(
    token: string | undefined,
  ): Promise<GuestWithProject> {
    if (!token || token.length > 256) throw new UnauthorizedException();
    const guest = await this.prisma.guestAccess.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { project: true },
    });
    if (!guest) throw new UnauthorizedException();
    if (guest.expiresAt <= new Date()) {
      await this.prisma.guestAccess.updateMany({
        where: { id: guest.id, status: { in: ["active", "pending_approval"] } },
        data: { status: "expired" },
      });
      await this.audit(guest, "guest_token_expired");
      throw new UnauthorizedException("Liên kết khách đã hết hạn");
    }
    if (
      guest.status !== "active" ||
      guest.project.deletedAt ||
      guest.project.status === "archived"
    )
      throw new UnauthorizedException("Liên kết khách không còn hiệu lực");
    return guest;
  }

  private async hasTaskAccess(guestAccessId: string, taskId: string) {
    return Boolean(
      await this.prisma.guestTaskAccess.findFirst({
        where: { guestAccessId, taskId, task: { deletedAt: null } },
        select: { taskId: true },
      }),
    );
  }

  private async deny(
    guest: GuestWithProject,
    action: string,
    resourceId?: string,
  ): Promise<never> {
    await this.audit(guest, action, resourceId);
    throw new NotFoundException();
  }

  private async audit(
    guest: GuestWithProject,
    action: string,
    resourceId?: string,
    details?: Prisma.InputJsonValue,
  ) {
    await this.prisma.activityLog.create({
      data: {
        entityType: "guest_access",
        entityId: guest.id,
        projectId: guest.projectId,
        action,
        after: {
          ...(resourceId ? { resourceId } : {}),
          ...(details && typeof details === "object" && !Array.isArray(details)
            ? details
            : {}),
        },
      },
    });
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private async requireProjectManager(actor: Actor, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        deletedAt: null,
        branch: { organizationId: actor.organizationId },
        OR: [
          { ownerId: actor.id },
          { members: { some: { userId: actor.id } } },
        ],
      },
      include: {
        members: { where: { userId: actor.id }, select: { role: true } },
      },
    });
    if (!project) throw new NotFoundException();
    const role = project.members[0]?.role;
    if (
      project.ownerId !== actor.id &&
      role !== ProjectRole.owner &&
      role !== ProjectRole.manager
    )
      throw new ForbiddenException();
    return project;
  }
}
