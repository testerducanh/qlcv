import { randomUUID } from "node:crypto";
import {
  CopyObjectCommand,
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
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import sharp from "sharp";
import type { AuthenticatedUser } from "../auth/auth.service";
import type { Env } from "../config/env";
import { ENV, PrismaService, S3 } from "../infra/infra.module";
import {
  permissionVisibility,
  type TaskPermissionResource,
} from "../permissions/permissions";
import {
  NoopVirusScanner,
  VIRUS_SCANNER,
  type VirusScanner,
} from "./virus-scanner";
import { safeAttachmentFileName, sniffAttachmentMime } from "./file-utils";

type Actor = AuthenticatedUser;
type AttachmentTarget = {
  taskId?: string;
  checklistItemId?: string;
  commentId?: string;
};

const taskContextInclude = {
  project: {
    include: {
      branch: { select: { id: true, organizationId: true } },
      members: { select: { userId: true, role: true } },
    },
  },
  creator: { select: { id: true, departmentId: true } },
  assignee: { select: { id: true, departmentId: true } },
};

type AttachmentTask = Prisma.TaskGetPayload<{
  include: typeof taskContextInclude;
}>;
type AttachmentWithContext = Prisma.AttachmentGetPayload<{
  include: {
    task: { include: typeof taskContextInclude };
    checklistItem: {
      include: { task: { include: typeof taskContextInclude } };
    };
    comment: { include: { task: { include: typeof taskContextInclude } } };
    uploader: { select: { id: true; name: true } };
  };
}>;

const attachmentContextInclude = {
  task: { include: taskContextInclude },
  checklistItem: { include: { task: { include: taskContextInclude } } },
  comment: { include: { task: { include: taskContextInclude } } },
  uploader: { select: { id: true, name: true } },
};

function taskFromAttachment(
  item: AttachmentWithContext,
): AttachmentTask | null {
  const task =
    item.task ?? item.checklistItem?.task ?? item.comment?.task ?? null;
  return task?.deletedAt ? null : task;
}

function taskResource(
  actor: Actor,
  task: AttachmentTask,
): TaskPermissionResource {
  return {
    type: "task",
    organizationId: task.project.branch.organizationId,
    projectId: task.projectId,
    branchId: task.project.branchId,
    confidentiality: task.project.confidentiality,
    projectRole:
      task.project.members.find((member) => member.userId === actor.id)?.role ??
      null,
    creatorId: task.creatorId,
    assigneeId: task.assigneeId,
    departmentIds: [
      task.creator.departmentId,
      task.assignee?.departmentId,
    ].filter((id): id is string => id !== null && id !== undefined),
  };
}

@Injectable()
export class AttachmentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttachmentsService.name);
  private purgeTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(S3) private readonly s3: S3Client,
    @Inject(VIRUS_SCANNER)
    private readonly virusScanner: VirusScanner = new NoopVirusScanner(),
  ) {}

  onModuleInit(): void {
    this.purgeTimer = setInterval(
      () => {
        void this.purgeExpired().catch((error: unknown) => {
          this.logger.error("Không thể dọn tệp hết hạn", error);
        });
      },
      60 * 60 * 1000,
    );
    this.purgeTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.purgeTimer) clearInterval(this.purgeTimer);
  }

  async createUpload(
    actor: Actor,
    projectId: string,
    input: AttachmentTarget & {
      fileName: string;
      mime: string;
      size: number;
      note?: string;
      takenAt?: string;
      lat?: number;
      lng?: number;
      versionGroupId?: string;
    },
  ) {
    const task = await this.findTargetTask(actor, projectId, input);
    const resource = taskResource(actor, task);
    if (
      permissionVisibility(actor, "task.view", resource) !== "full" ||
      permissionVisibility(actor, "attachment.add", resource) === "none"
    )
      throw new NotFoundException();

    const fileName = safeAttachmentFileName(input.fileName);
    const mime = input.mime.trim().toLowerCase();
    if (!fileName || fileName.length > 255)
      throw new BadRequestException("Tên tệp không hợp lệ");
    if (!this.env.ATTACHMENT_ALLOWED_MIME.includes(mime))
      throw new BadRequestException(`Loại tệp ${mime} không được phép`);
    if (!Number.isSafeInteger(input.size) || input.size < 1)
      throw new BadRequestException("Kích thước tệp không hợp lệ");
    if (input.size > this.env.ATTACHMENT_MAX_FILE_BYTES)
      throw new BadRequestException("Tệp vượt quá dung lượng tối đa cho phép");
    if (
      input.lat !== undefined &&
      (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90)
    )
      throw new BadRequestException("Vĩ độ không hợp lệ");
    if (
      input.lng !== undefined &&
      (!Number.isFinite(input.lng) || input.lng < -180 || input.lng > 180)
    )
      throw new BadRequestException("Kinh độ không hợp lệ");
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.env.ATTACHMENT_UPLOAD_URL_SECONDS * 1000,
    );
    const objectPrefix = `projects/${projectId}/attachments/${randomUUID()}`;
    const storageKey = `${objectPrefix}/original`;
    const uploadStorageKey = `${objectPrefix}/pending`;

    const attachment = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT 1 FROM pg_advisory_xact_lock(
          hashtext(${task.project.branch.organizationId}),
          hashtext('attachment-quota')
        )
      `);
      const taskAttachmentFilter: Prisma.AttachmentWhereInput = {
        projectId,
        deletedAt: null,
        OR: [
          { taskId: task.id },
          { checklistItem: { taskId: task.id } },
          { comment: { taskId: task.id } },
        ],
      };
      const [taskCount, projectUsage, organizationUsage] = await Promise.all([
        tx.attachment.count({ where: taskAttachmentFilter }),
        tx.attachment.aggregate({
          where: { projectId, deletedAt: null },
          _sum: { size: true },
        }),
        tx.attachment.aggregate({
          where: {
            deletedAt: null,
            project: {
              branch: { organizationId: task.project.branch.organizationId },
            },
          },
          _sum: { size: true },
        }),
      ]);
      if (taskCount >= this.env.ATTACHMENT_MAX_PER_TASK)
        throw new BadRequestException(
          "Việc đã đạt số lượng tệp đính kèm tối đa",
        );
      if (
        (projectUsage._sum.size ?? 0) + input.size >
        this.env.ATTACHMENT_PROJECT_QUOTA_BYTES
      )
        throw new BadRequestException("Tệp vượt hạn mức dung lượng của dự án");
      if (
        (organizationUsage._sum.size ?? 0) + input.size >
        this.env.ATTACHMENT_ORGANIZATION_QUOTA_BYTES
      )
        throw new BadRequestException(
          "Tệp vượt hạn mức dung lượng của công ty",
        );

      let versionGroupId = input.versionGroupId;
      let versionNo = 1;
      if (versionGroupId) {
        const latest = await tx.attachment.findFirst({
          where: {
            projectId,
            versionGroupId,
            deletedAt: null,
          },
          orderBy: { versionNo: "desc" },
        });
        if (
          !latest ||
          latest.taskId !== (input.taskId ?? null) ||
          latest.checklistItemId !== (input.checklistItemId ?? null) ||
          latest.commentId !== (input.commentId ?? null)
        ) {
          throw new NotFoundException();
        }
        versionNo = latest.versionNo + 1;
      } else {
        versionGroupId = randomUUID();
      }

      return tx.attachment.create({
        data: {
          projectId,
          taskId: input.taskId ?? null,
          checklistItemId: input.checklistItemId ?? null,
          commentId: input.commentId ?? null,
          uploaderId: actor.id,
          fileName,
          mime,
          size: input.size,
          storageKey,
          uploadStorageKey,
          versionGroupId,
          versionNo,
          isCurrent: false,
          note: input.note?.trim() || null,
          takenAt: input.takenAt ? new Date(input.takenAt) : null,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          confirmedAt: null,
          uploadExpiresAt: expiresAt,
        },
      });
    });

    try {
      const uploadUrl = await getSignedUrl(
        this.s3,
        new PutObjectCommand({
          Bucket: this.env.S3_BUCKET,
          Key: uploadStorageKey,
          ContentType: mime,
          ContentLength: input.size,
        }),
        {
          expiresIn: this.env.ATTACHMENT_UPLOAD_URL_SECONDS,
          signableHeaders: new Set(["content-length"]),
        },
      );
      return {
        id: attachment.id,
        uploadUrl,
        method: "PUT",
        headers: { "Content-Type": mime },
        expiresAt,
      };
    } catch (error) {
      await this.prisma.attachment
        .delete({ where: { id: attachment.id } })
        .catch((cleanupError: unknown) => {
          this.logger.error(
            `Không thể xóa bản ghi upload ${attachment.id}`,
            cleanupError,
          );
        });
      throw error;
    }
  }

  async confirmUpload(actor: Actor, projectId: string, attachmentId: string) {
    const item = await this.findAttachment(
      actor,
      projectId,
      attachmentId,
      false,
    );
    if (item.uploaderId !== actor.id || item.confirmedAt)
      throw new NotFoundException();
    if (
      !item.uploadStorageKey ||
      !item.uploadExpiresAt ||
      item.uploadExpiresAt <= new Date()
    ) {
      await this.removePendingUpload(item);
      throw new BadRequestException("Yêu cầu tải lên đã hết hạn");
    }
    const task = taskFromAttachment(item);
    if (!task) throw new NotFoundException();
    const resource = taskResource(actor, task);
    if (
      permissionVisibility(actor, "task.view", resource) !== "full" ||
      permissionVisibility(actor, "attachment.add", resource) === "none"
    )
      throw new NotFoundException();

    let thumbKey: string | null = null;
    let previewKey: string | null = null;
    try {
      const head = await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.env.S3_BUCKET,
          Key: item.uploadStorageKey,
        }),
      );
      if (
        head.ContentLength !== item.size ||
        head.ContentLength > this.env.ATTACHMENT_MAX_FILE_BYTES
      )
        throw new BadRequestException("Kích thước nội dung tải lên không khớp");
      const object = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.env.S3_BUCKET,
          Key: item.uploadStorageKey,
        }),
      );
      if (!object.Body || !("transformToByteArray" in object.Body))
        throw new BadRequestException("Không thể đọc nội dung tệp vừa tải lên");
      const buffer = Buffer.from(await object.Body.transformToByteArray());
      if (!object.ETag)
        throw new BadRequestException(
          "Kho tệp không trả về mã xác thực nội dung",
        );
      const detectedMime = sniffAttachmentMime(buffer);
      if (!detectedMime || detectedMime !== item.mime)
        throw new BadRequestException(
          "Nội dung tệp không khớp loại đã khai báo",
        );
      if (!this.env.ATTACHMENT_ALLOWED_MIME.includes(detectedMime))
        throw new BadRequestException(
          `Loại tệp ${detectedMime} không được phép`,
        );
      await this.virusScanner.scan(buffer, item.fileName);

      let width: number | null = null;
      let height: number | null = null;
      if (detectedMime.startsWith("image/")) {
        const metadata = await sharp(buffer, {
          limitInputPixels: 40_000_000,
        }).metadata();
        if (!metadata.width || !metadata.height)
          throw new BadRequestException(
            "Ảnh không hợp lệ hoặc không giải mã được",
          );
        width =
          metadata.orientation &&
          metadata.orientation >= 5 &&
          metadata.orientation <= 8
            ? metadata.height
            : metadata.width;
        height =
          metadata.orientation &&
          metadata.orientation >= 5 &&
          metadata.orientation <= 8
            ? metadata.width
            : metadata.height;
        const baseKey = `projects/${projectId}/attachments/${item.id}`;
        thumbKey = `${baseKey}-320.webp`;
        previewKey = `${baseKey}-1280.webp`;
        const thumbnail = await sharp(buffer, { limitInputPixels: 40_000_000 })
          .rotate()
          .resize(320, 320, { fit: "inside", withoutEnlargement: true })
          .webp()
          .toBuffer();
        const preview = await sharp(buffer, { limitInputPixels: 40_000_000 })
          .rotate()
          .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
          .webp()
          .toBuffer();
        await this.s3.send(
          new PutObjectCommand({
            Bucket: this.env.S3_BUCKET,
            Key: thumbKey,
            Body: thumbnail,
            ContentType: "image/webp",
          }),
        );
        await this.s3.send(
          new PutObjectCommand({
            Bucket: this.env.S3_BUCKET,
            Key: previewKey,
            Body: preview,
            ContentType: "image/webp",
          }),
        );
      }
      await this.s3.send(
        new CopyObjectCommand({
          Bucket: this.env.S3_BUCKET,
          Key: item.storageKey,
          CopySource: `/${this.env.S3_BUCKET}/${item.uploadStorageKey
            .split("/")
            .map(encodeURIComponent)
            .join("/")}`,
          CopySourceIfMatch: object.ETag,
        }),
      );

      const confirmedAt = new Date();
      const confirmed = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`
          SELECT 1 FROM pg_advisory_xact_lock(
            hashtext(${item.versionGroupId}),
            hashtext('attachment-version')
          )
        `);
        const latest = await tx.attachment.findFirst({
          where: {
            versionGroupId: item.versionGroupId,
            deletedAt: null,
            confirmedAt: { not: null },
          },
          orderBy: { versionNo: "desc" },
        });
        if (latest && item.versionNo <= latest.versionNo)
          throw new ConflictException(
            "Phiên bản tệp đã được xác nhận bởi yêu cầu khác",
          );
        await tx.attachment.updateMany({
          where: { versionGroupId: item.versionGroupId, deletedAt: null },
          data: { isCurrent: false },
        });
        return tx.attachment.update({
          where: { id: item.id },
          data: {
            confirmedAt,
            mime: detectedMime,
            isCurrent: true,
            thumbKey,
            previewKey,
            width,
            height,
          },
          select: {
            id: true,
            projectId: true,
            taskId: true,
            checklistItemId: true,
            commentId: true,
            fileName: true,
            mime: true,
            size: true,
            width: true,
            height: true,
            versionGroupId: true,
            versionNo: true,
            createdAt: true,
            confirmedAt: true,
          },
        });
      });
      return confirmed;
    } catch (error) {
      try {
        await this.deleteStorageKeys([
          item.storageKey,
          item.uploadStorageKey,
          thumbKey,
          previewKey,
        ]);
      } catch (cleanupError) {
        this.logger.error(
          `Không thể dọn nội dung upload ${item.id}`,
          cleanupError,
        );
      }
      throw error;
    }
  }

  async listLibrary(
    actor: Actor,
    projectId: string,
    input: {
      taskId?: string;
      uploaderId?: string;
      mime?: string;
      from?: string;
      to?: string;
      page: number;
      pageSize: number;
    },
  ) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        deletedAt: null,
        branch: { organizationId: actor.organizationId },
      },
      include: {
        branch: { select: { id: true, organizationId: true } },
        members: { select: { userId: true, role: true } },
      },
    });
    if (!project) throw new NotFoundException();
    const projectResource = {
      type: "task" as const,
      organizationId: project.branch.organizationId,
      projectId,
      branchId: project.branchId,
      confidentiality: project.confidentiality,
      projectRole:
        project.members.find((member) => member.userId === actor.id)?.role ??
        null,
      creatorId: actor.id,
    };
    const hasScopedMembership = project.members.some(
      (member) => member.userId === actor.id && member.role === "restricted",
    );
    if (
      permissionVisibility(actor, "project.view", projectResource) !== "full" &&
      !hasScopedMembership
    )
      throw new NotFoundException();

    const where: Prisma.AttachmentWhereInput = {
      projectId,
      deletedAt: null,
      confirmedAt: { not: null },
      isCurrent: true,
      ...(input.uploaderId ? { uploaderId: input.uploaderId } : {}),
      ...(input.mime ? { mime: input.mime } : {}),
      ...(input.from || input.to
        ? {
            createdAt: {
              ...(input.from ? { gte: new Date(input.from) } : {}),
              ...(input.to
                ? { lte: new Date(`${input.to}T23:59:59.999Z`) }
                : {}),
            },
          }
        : {}),
      ...(input.taskId
        ? {
            OR: [
              { taskId: input.taskId },
              { checklistItem: { taskId: input.taskId } },
              { comment: { taskId: input.taskId } },
            ],
          }
        : {}),
    };
    const visible: Array<Record<string, unknown>> = [];
    let total = 0;
    const start = (input.page - 1) * input.pageSize;
    let skip = 0;
    while (true) {
      const batch = await this.prisma.attachment.findMany({
        where,
        include: attachmentContextInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: 200,
      });
      if (!batch.length) break;
      skip += batch.length;
      for (const item of batch) {
        const task = taskFromAttachment(item);
        if (
          !task ||
          permissionVisibility(
            actor,
            "task.view",
            taskResource(actor, task),
          ) !== "full"
        )
          continue;
        if (total >= start && visible.length < input.pageSize) {
          visible.push(this.publicMetadata(item));
        }
        total++;
      }
      if (batch.length < 200) break;
    }
    return {
      items: visible,
      page: input.page,
      pageSize: input.pageSize,
      total,
    };
  }

  async listTrash(
    actor: Actor,
    projectId: string,
    page: number,
    pageSize: number,
  ) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        deletedAt: null,
        branch: { organizationId: actor.organizationId },
      },
      include: {
        branch: { select: { id: true, organizationId: true } },
        members: { select: { userId: true, role: true } },
      },
    });
    if (!project) throw new NotFoundException();
    const projectResource = {
      type: "project" as const,
      organizationId: project.branch.organizationId,
      projectId,
      branchId: project.branchId,
      confidentiality: project.confidentiality,
      projectRole:
        project.members.find((member) => member.userId === actor.id)?.role ??
        null,
    };
    const hasScopedMembership = project.members.some(
      (member) => member.userId === actor.id && member.role === "restricted",
    );
    if (
      permissionVisibility(actor, "project.view", projectResource) !== "full" &&
      !hasScopedMembership
    )
      throw new NotFoundException();
    const visible: Array<Record<string, unknown>> = [];
    let total = 0;
    const start = (page - 1) * pageSize;
    let skip = 0;
    while (true) {
      const batch = await this.prisma.attachment.findMany({
        where: {
          projectId,
          deletedAt: { not: null },
          confirmedAt: { not: null },
        },
        include: attachmentContextInclude,
        orderBy: [{ deletedAt: "desc" }, { id: "desc" }],
        skip,
        take: 200,
      });
      if (!batch.length) break;
      skip += batch.length;
      for (const item of batch) {
        const task = taskFromAttachment(item);
        if (
          !task ||
          permissionVisibility(
            actor,
            "task.view",
            taskResource(actor, task),
          ) !== "full"
        )
          continue;
        if (total >= start && visible.length < pageSize) {
          visible.push({
            ...this.publicMetadata(item),
            deletedAt: item.deletedAt,
            restoreUntil: new Date(item.deletedAt!.getTime() + 30 * 86400000),
          });
        }
        total++;
      }
      if (batch.length < 200) break;
    }
    return { items: visible, page, pageSize, total };
  }

  async history(actor: Actor, projectId: string, attachmentId: string) {
    const current = await this.findAttachment(
      actor,
      projectId,
      attachmentId,
      true,
    );
    const task = taskFromAttachment(current);
    if (
      !task ||
      permissionVisibility(actor, "task.view", taskResource(actor, task)) !==
        "full"
    )
      throw new NotFoundException();
    const history = await this.prisma.attachment.findMany({
      where: {
        versionGroupId: current.versionGroupId,
        confirmedAt: { not: null },
      },
      orderBy: { versionNo: "desc" },
      select: {
        id: true,
        fileName: true,
        mime: true,
        size: true,
        versionNo: true,
        isCurrent: true,
        createdAt: true,
        deletedAt: true,
        uploader: { select: { id: true, name: true } },
      },
    });
    return history;
  }

  async download(
    actor: Actor,
    projectId: string,
    attachmentId: string,
    variant: "original" | "preview" | "thumbnail",
  ) {
    const item = await this.findAttachment(
      actor,
      projectId,
      attachmentId,
      true,
    );
    const task = taskFromAttachment(item);
    if (
      !task ||
      permissionVisibility(actor, "task.view", taskResource(actor, task)) !==
        "full"
    )
      throw new NotFoundException();
    const key =
      variant === "thumbnail"
        ? item.thumbKey
        : variant === "preview"
          ? item.previewKey
          : item.storageKey;
    if (!key) throw new NotFoundException();
    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: key,
        ...(variant === "original"
          ? {
              ResponseContentDisposition: `attachment; filename="${item.fileName.replace(/["\\]/g, "_")}"`,
            }
          : { ResponseContentType: "image/webp" }),
      }),
      { expiresIn: this.env.ATTACHMENT_DOWNLOAD_URL_SECONDS },
    );
    await this.prisma.activityLog.create({
      data: {
        entityType: "attachment",
        entityId: item.id,
        projectId,
        actorId: actor.id,
        action: "attachment.download_url_issued",
        after: { variant } as Prisma.InputJsonValue,
      },
    });
    this.logger.log(
      JSON.stringify({
        event: "attachment.download_url_issued",
        actorId: actor.id,
        projectId,
        attachmentId: item.id,
        variant,
      }),
    );
    return {
      url,
      expiresIn: this.env.ATTACHMENT_DOWNLOAD_URL_SECONDS,
      fileName: item.fileName,
      mime: variant === "original" ? item.mime : "image/webp",
    };
  }

  async softDelete(actor: Actor, projectId: string, attachmentId: string) {
    const item = await this.findAttachment(
      actor,
      projectId,
      attachmentId,
      true,
    );
    const task = taskFromAttachment(item);
    if (!task) throw new NotFoundException();
    this.requireDeletePermission(actor, task, item.uploaderId);
    const deletedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.attachment.update({
        where: { id: item.id },
        data: { deletedAt, isCurrent: false },
      });
      if (item.isCurrent) {
        const fallback = await tx.attachment.findFirst({
          where: {
            versionGroupId: item.versionGroupId,
            deletedAt: null,
            confirmedAt: { not: null },
            id: { not: item.id },
          },
          orderBy: { versionNo: "desc" },
        });
        if (fallback)
          await tx.attachment.update({
            where: { id: fallback.id },
            data: { isCurrent: true },
          });
      }
    });
    return {
      id: item.id,
      deletedAt,
      restoreUntil: new Date(deletedAt.getTime() + 30 * 86400000),
    };
  }

  async restore(actor: Actor, projectId: string, attachmentId: string) {
    const item = await this.findAttachment(
      actor,
      projectId,
      attachmentId,
      false,
    );
    const task = taskFromAttachment(item);
    if (!task || !item.deletedAt || item.confirmedAt === null)
      throw new NotFoundException();
    this.requireDeletePermission(actor, task, item.uploaderId);
    const restoreUntil = new Date(item.deletedAt.getTime() + 30 * 86400000);
    if (restoreUntil <= new Date()) throw new NotFoundException();
    const restored = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT 1 FROM pg_advisory_xact_lock(
          hashtext(${task.project.branch.organizationId}),
          hashtext('attachment-quota')
        )
      `);
      const taskAttachmentFilter: Prisma.AttachmentWhereInput = {
        projectId,
        deletedAt: null,
        OR: [
          { taskId: task.id },
          { checklistItem: { taskId: task.id } },
          { comment: { taskId: task.id } },
        ],
      };
      const [projectUsage, orgUsage, current, taskCount] = await Promise.all([
        tx.attachment.aggregate({
          where: { projectId, deletedAt: null },
          _sum: { size: true },
        }),
        tx.attachment.aggregate({
          where: {
            deletedAt: null,
            project: {
              branch: { organizationId: task.project.branch.organizationId },
            },
          },
          _sum: { size: true },
        }),
        tx.attachment.findFirst({
          where: {
            versionGroupId: item.versionGroupId,
            deletedAt: null,
            isCurrent: true,
          },
        }),
        tx.attachment.count({ where: taskAttachmentFilter }),
      ]);
      if (taskCount >= this.env.ATTACHMENT_MAX_PER_TASK)
        throw new BadRequestException(
          "Việc đã đạt số lượng tệp đính kèm tối đa",
        );
      if (
        (projectUsage._sum.size ?? 0) + item.size >
        this.env.ATTACHMENT_PROJECT_QUOTA_BYTES
      )
        throw new BadRequestException(
          "Khôi phục vượt hạn mức dung lượng của dự án",
        );
      if (
        (orgUsage._sum.size ?? 0) + item.size >
        this.env.ATTACHMENT_ORGANIZATION_QUOTA_BYTES
      )
        throw new BadRequestException(
          "Khôi phục vượt hạn mức dung lượng của công ty",
        );
      return tx.attachment.update({
        where: { id: item.id },
        data: { deletedAt: null, isCurrent: current === null },
        select: { id: true, deletedAt: true, isCurrent: true },
      });
    });
    return restored;
  }

  async purgeExpired(now = new Date()): Promise<number> {
    const trashExpiry = new Date(now.getTime() - 30 * 86400000);
    const expired = await this.prisma.attachment.findMany({
      where: {
        OR: [
          { deletedAt: { lte: trashExpiry } },
          { confirmedAt: null, uploadExpiresAt: { lte: now } },
          { uploadStorageKey: { not: null }, uploadExpiresAt: { lte: now } },
        ],
      },
      take: 100,
      select: {
        id: true,
        storageKey: true,
        uploadStorageKey: true,
        uploadExpiresAt: true,
        confirmedAt: true,
        deletedAt: true,
        thumbKey: true,
        previewKey: true,
      },
    });
    let purged = 0;
    for (const item of expired) {
      if (
        !item.deletedAt &&
        item.confirmedAt &&
        item.uploadStorageKey &&
        item.uploadExpiresAt
      ) {
        await this.deleteStorageKeys([item.uploadStorageKey]);
        await this.prisma.attachment.update({
          where: { id: item.id },
          data: { uploadStorageKey: null, uploadExpiresAt: null },
        });
      } else {
        await this.deleteStorageKeys([
          item.storageKey,
          item.uploadStorageKey,
          item.thumbKey,
          item.previewKey,
        ]);
        await this.prisma.attachment.delete({ where: { id: item.id } });
      }
      purged++;
    }

    const expiredGuestUploads = await this.prisma.guestSubmissionFile.findMany({
      where: {
        confirmedAt: null,
        uploadStorageKey: { not: null },
        uploadExpiresAt: { lte: now },
      },
      take: 100,
      select: { id: true, uploadStorageKey: true },
    });
    for (const item of expiredGuestUploads) {
      await this.deleteStorageKeys([item.uploadStorageKey]);
      await this.prisma.guestSubmissionFile.deleteMany({
        where: {
          id: item.id,
          confirmedAt: null,
          uploadStorageKey: item.uploadStorageKey,
          uploadExpiresAt: { lte: now },
        },
      });
      purged++;
    }

    return purged;
  }

  private async findTargetTask(
    actor: Actor,
    projectId: string,
    target: AttachmentTarget,
  ): Promise<AttachmentTask> {
    const targetCount = [
      target.taskId,
      target.checklistItemId,
      target.commentId,
    ].filter(Boolean).length;
    if (targetCount !== 1)
      throw new BadRequestException("Cần chọn đúng một vị trí gắn tệp");
    const task = await this.prisma.task.findFirst({
      where: {
        projectId,
        deletedAt: null,
        ...(target.taskId ? { id: target.taskId } : {}),
        ...(target.checklistItemId
          ? { checklistItems: { some: { id: target.checklistItemId } } }
          : {}),
        ...(target.commentId
          ? { comments: { some: { id: target.commentId, hiddenAt: null } } }
          : {}),
        project: {
          deletedAt: null,
          branch: { organizationId: actor.organizationId },
        },
      },
      include: taskContextInclude,
    });
    if (!task) throw new NotFoundException();
    return task;
  }

  private async findAttachment(
    actor: Actor,
    projectId: string,
    attachmentId: string,
    activeOnly: boolean,
  ): Promise<AttachmentWithContext> {
    const item = await this.prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        projectId,
        project: {
          deletedAt: null,
          branch: { organizationId: actor.organizationId },
        },
        ...(activeOnly ? { deletedAt: null, confirmedAt: { not: null } } : {}),
      },
      include: attachmentContextInclude,
    });
    if (!item) throw new NotFoundException();
    return item;
  }

  private requireDeletePermission(
    actor: Actor,
    task: AttachmentTask,
    uploaderId: string,
  ) {
    const resource = taskResource(actor, task);
    if (
      uploaderId !== actor.id &&
      permissionVisibility(actor, "attachment.deleteOthers", resource) ===
        "none"
    )
      throw new NotFoundException();
    if (permissionVisibility(actor, "task.view", resource) !== "full")
      throw new NotFoundException();
  }

  private publicMetadata(item: AttachmentWithContext) {
    return {
      id: item.id,
      taskId: item.taskId,
      checklistItemId: item.checklistItemId,
      commentId: item.commentId,
      fileName: item.fileName,
      mime: item.mime,
      size: item.size,
      width: item.width,
      height: item.height,
      note: item.note,
      takenAt: item.takenAt,
      lat: item.lat,
      lng: item.lng,
      versionGroupId: item.versionGroupId,
      versionNo: item.versionNo,
      createdAt: item.createdAt,
      uploader: item.uploader,
    };
  }

  private async removePendingUpload(item: {
    id: string;
    storageKey: string;
    uploadStorageKey: string | null;
  }) {
    await this.deleteStorageKeys([item.storageKey, item.uploadStorageKey]);
    await this.prisma.attachment.delete({ where: { id: item.id } });
  }

  private async deleteStorageKeys(keys: Array<string | null>) {
    for (const key of keys.filter((value): value is string => Boolean(value))) {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.env.S3_BUCKET,
          Key: key,
        }),
      );
    }
  }
}
