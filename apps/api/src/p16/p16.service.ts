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
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Confidentiality, Prisma, ProjectRole } from "@prisma/client";
import { EventEmitter } from "node:events";
import { AttachmentsService } from "../attachments/attachments.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import type { Env } from "../config/env";
import { ENV, PrismaService, S3 } from "../infra/infra.module";
import {
  permissionVisibility,
  type TaskPermissionResource,
} from "../permissions/permissions";
import { INTERNAL_EVENTS } from "./internal-events.module";

type Actor = AuthenticatedUser;
type Page = { page: number; pageSize: number };
type EventPayload =
  | {
      type: "task.assigned";
      projectId: string;
      taskId: string;
      taskTitle: string;
      userId: string;
    }
  | {
      type: "task.status_changed";
      projectId: string;
      taskId: string;
      taskTitle: string;
      creatorId: string;
      status: string;
    };

const retentionMs = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class P16Service implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(P16Service.name);
  private readonly onDomainEvent = (event: EventPayload) => {
    void this.persistDomainEvent(event).catch((error: unknown) => {
      this.logger.error("Could not persist domain notification", error);
    });
  };
  private purgeTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(S3) private readonly s3: S3Client,
    @Inject(INTERNAL_EVENTS) private readonly events: EventEmitter,
    private readonly attachments: AttachmentsService,
  ) {}

  onModuleInit() {
    this.events.on("domain", this.onDomainEvent);
    this.purgeTimer = setInterval(
      () => {
        void this.purgeExpired().catch((error: unknown) => {
          this.logger.error("Could not purge expired trash", error);
        });
      },
      24 * 60 * 60 * 1000,
    );
    this.purgeTimer.unref();
  }

  onModuleDestroy() {
    this.events.off("domain", this.onDomainEvent);
    if (this.purgeTimer) clearInterval(this.purgeTimer);
  }

  async listComments(actor: Actor, projectId: string, taskId: string) {
    const task = await this.getTask(actor, projectId, taskId);
    const visibility = this.visibility(actor, task, "task.view");
    if (visibility === "limited") return [];
    if (visibility !== "full") throw new NotFoundException();
    return this.prisma.comment.findMany({
      where: { taskId, hiddenAt: null, parent: { hiddenAt: null } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        author: { select: { id: true, name: true } },
        mentions: { include: { user: { select: { id: true, name: true } } } },
        attachments: {
          where: { deletedAt: null, confirmedAt: { not: null } },
          select: { id: true, fileName: true, mime: true, size: true },
        },
      },
    });
  }

  async createComment(
    actor: Actor,
    projectId: string,
    taskId: string,
    input: {
      body: string;
      parentId?: string;
      isQuestion: boolean;
      mentionIds: string[];
      attachmentIds: string[];
    },
  ) {
    const task = await this.getTask(actor, projectId, taskId);
    this.requirePermission(actor, task, "comment.write");
    const mentionIds = [...new Set(input.mentionIds)].filter(
      (id) => id !== actor.id,
    );
    const users = mentionIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: { in: mentionIds },
            organizationId: actor.organizationId,
            status: "active",
          },
          select: { id: true, name: true },
        })
      : [];
    if (users.length !== mentionIds.length)
      throw new BadRequestException(
        "Một hoặc nhiều người được nhắc không hợp lệ",
      );
    if (input.parentId) {
      const parent = await this.prisma.comment.findFirst({
        where: { id: input.parentId, taskId, hiddenAt: null },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException("Không tìm thấy nhận xét cha");
    }
    if (input.attachmentIds.length) {
      const attachments = await this.prisma.attachment.findMany({
        where: {
          id: { in: [...new Set(input.attachmentIds)] },
          projectId,
          deletedAt: null,
          confirmedAt: { not: null },
          OR: [{ taskId }, { checklistItem: { taskId } }],
        },
        select: { id: true },
      });
      if (attachments.length !== new Set(input.attachmentIds).size)
        throw new BadRequestException(
          "Tệp phải được tải lên cùng việc trước khi đính kèm",
        );
    }

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          taskId,
          authorId: actor.id,
          parentId: input.parentId,
          body: input.body,
          isQuestion: input.isQuestion,
          mentions: mentionIds.length
            ? { createMany: { data: mentionIds.map((userId) => ({ userId })) } }
            : undefined,
        },
        include: {
          author: { select: { id: true, name: true } },
          mentions: { include: { user: { select: { id: true, name: true } } } },
        },
      });
      if (input.attachmentIds.length) {
        await tx.attachment.updateMany({
          where: {
            id: { in: [...new Set(input.attachmentIds)] },
            projectId,
            deletedAt: null,
            OR: [{ taskId }, { checklistItem: { taskId } }],
          },
          data: { commentId: created.id, taskId: null, checklistItemId: null },
        });
      }
      await tx.activityLog.create({
        data: {
          entityType: "comment",
          entityId: created.id,
          projectId,
          actorId: actor.id,
          action: "comment.created",
          after: {
            taskId,
            isQuestion: input.isQuestion,
            mentionIds,
          } as Prisma.InputJsonValue,
        },
      });
      const projectMemberIds = new Set(
        task.project.members.map((member) => member.userId),
      );
      const notifyIds = new Set(
        mentionIds.filter((userId) => projectMemberIds.has(userId)),
      );
      const followers = await tx.taskCollaborator.findMany({
        where: { taskId, role: "follower", userId: { not: actor.id } },
        select: { userId: true },
      });
      for (const follower of followers) notifyIds.add(follower.userId);
      if (notifyIds.size) {
        await tx.notification.createMany({
          data: [...notifyIds].map((userId) => ({
            userId,
            type: mentionIds.includes(userId) ? "mentioned" : "task_comment",
            payload: { projectId, taskId, commentId: created.id },
          })),
        });
      }
      return created;
    });
    const projectMemberIds = new Set(
      task.project.members.map((member) => member.userId),
    );
    const warnings = users
      .filter((user) => !projectMemberIds.has(user.id))
      .map((user) => ({
        userId: user.id,
        name: user.name,
        warning:
          "Người được nhắc chưa là thành viên dự án; hãy mời họ trước khi chia sẻ nội dung.",
        canInvite: true,
      }));
    return { ...comment, mentionWarnings: warnings };
  }

  async editComment(
    actor: Actor,
    projectId: string,
    taskId: string,
    commentId: string,
    input: { body: string; isQuestion?: boolean },
  ) {
    const task = await this.getTask(actor, projectId, taskId);
    this.requirePermission(actor, task, "comment.write");
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, taskId, hiddenAt: null },
    });
    if (!comment) throw new NotFoundException();
    if (comment.authorId !== actor.id) throw new NotFoundException();
    if (Date.now() - comment.createdAt.getTime() > 15 * 60 * 1000)
      throw new ConflictException(
        "Chỉ được sửa nhận xét trong 15 phút sau khi tạo",
      );
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.comment.update({
        where: { id: commentId },
        data: {
          body: input.body,
          ...(input.isQuestion === undefined
            ? {}
            : { isQuestion: input.isQuestion }),
          editedAt: new Date(),
        },
        include: { author: { select: { id: true, name: true } } },
      });
      await tx.activityLog.create({
        data: {
          entityType: "comment",
          entityId: commentId,
          projectId,
          actorId: actor.id,
          action: "comment.edited",
          before: { body: comment.body, isQuestion: comment.isQuestion },
          after: { body: result.body, isQuestion: result.isQuestion },
        },
      });
      return result;
    });
    return updated;
  }

  async hideComment(
    actor: Actor,
    projectId: string,
    taskId: string,
    commentId: string,
  ) {
    const task = await this.getTask(actor, projectId, taskId);
    this.requireProjectAdmin(actor, task.project);
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, taskId, hiddenAt: null },
    });
    if (!comment) throw new NotFoundException();
    const hiddenAt = new Date();
    await this.prisma.$transaction([
      this.prisma.comment.update({
        where: { id: commentId },
        data: { hiddenAt },
      }),
      this.prisma.activityLog.create({
        data: {
          entityType: "comment",
          entityId: commentId,
          projectId,
          actorId: actor.id,
          action: "comment.hidden",
          before: { hiddenAt: null },
          after: { hiddenAt },
        },
      }),
    ]);
    return { id: commentId, hiddenAt };
  }

  async listNotifications(actor: Actor, input: Page & { unreadOnly: boolean }) {
    const where = {
      userId: actor.id,
      ...(input.unreadOnly ? { readAt: null } : {}),
    };
    const [items, total, dueTasks] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.task.findMany({
        where: {
          assigneeId: actor.id,
          deletedAt: null,
          status: { not: "done" },
          dueDate: { lte: new Date(Date.now() + 24 * 60 * 60 * 1000) },
          project: {
            deletedAt: null,
            branch: { organizationId: actor.organizationId },
          },
        },
        select: {
          id: true,
          projectId: true,
          dueDate: true,
          project: { select: { confidentiality: true } },
        },
        take: 200,
      }),
    ]);
    const virtual = dueTasks
      .filter((task) => task.dueDate)
      .map((task) => ({
        id: `due:${task.id}`,
        userId: actor.id,
        type: task.dueDate! < new Date() ? "task_overdue" : "task_due_soon",
        payload: {
          projectId: task.projectId,
          taskId: task.id,
          dueDate: task.dueDate,
          ...(task.project.confidentiality === Confidentiality.restricted
            ? {}
            : {}),
        },
        readAt: null,
        createdAt: new Date(),
        virtual: true,
      }));
    return {
      items: [...items, ...virtual].slice(0, input.pageSize),
      page: input.page,
      pageSize: input.pageSize,
      total: total + virtual.length,
    };
  }

  async readNotification(actor: Actor, notificationId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (!result.count) {
      const exists = await this.prisma.notification.findFirst({
        where: { id: notificationId, userId: actor.id },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException();
    }
    return { id: notificationId, read: true };
  }

  async readAllNotifications(actor: Actor) {
    const result = await this.prisma.notification.updateMany({
      where: { userId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { read: result.count };
  }

  async taskActivity(
    actor: Actor,
    projectId: string,
    taskId: string,
    page: Page,
  ) {
    const task = await this.getTask(actor, projectId, taskId);
    if (this.visibility(actor, task, "task.view") !== "full")
      throw new NotFoundException();
    const [comments, attachments] = await Promise.all([
      this.prisma.comment.findMany({ where: { taskId }, select: { id: true } }),
      this.prisma.attachment.findMany({
        where: {
          projectId,
          OR: [
            { taskId },
            { checklistItem: { taskId } },
            { comment: { taskId } },
          ],
        },
        select: { id: true },
      }),
    ]);
    return this.activityPage(
      {
        projectId,
        OR: [
          { entityId: taskId },
          { entityId: { in: comments.map((comment) => comment.id) } },
          { entityId: { in: attachments.map((attachment) => attachment.id) } },
        ],
      },
      page,
    );
  }

  async projectActivity(actor: Actor, projectId: string, page: Page) {
    const project = await this.getProject(actor, projectId);
    if (this.projectVisibility(actor, project) !== "full")
      throw new NotFoundException();
    return this.activityPage({ projectId }, page);
  }

  async listTrash(actor: Actor, projectId: string, page: Page) {
    const project = await this.getProject(actor, projectId);
    this.requireProjectAdmin(actor, project);
    const [tasks, taskTotal, files, fileTotal] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          projectId,
          deletedAt: { not: null },
          OR: [{ parentId: null }, { parent: { deletedAt: null } }],
        },
        orderBy: [{ deletedAt: "desc" }, { id: "desc" }],
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
        select: {
          id: true,
          title: true,
          deletedAt: true,
          parentId: true,
          type: true,
        },
      }),
      this.prisma.task.count({
        where: {
          projectId,
          deletedAt: { not: null },
          OR: [{ parentId: null }, { parent: { deletedAt: null } }],
        },
      }),
      this.prisma.attachment.findMany({
        where: {
          projectId,
          deletedAt: { not: null },
          confirmedAt: { not: null },
          OR: [
            { taskId: null, checklistItemId: null, commentId: null },
            { task: { deletedAt: null } },
            { checklistItem: { task: { deletedAt: null } } },
            { comment: { task: { deletedAt: null } } },
          ],
        },
        orderBy: [{ deletedAt: "desc" }, { id: "desc" }],
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
        select: {
          id: true,
          fileName: true,
          deletedAt: true,
          size: true,
          mime: true,
        },
      }),
      this.prisma.attachment.count({
        where: {
          projectId,
          deletedAt: { not: null },
          confirmedAt: { not: null },
          OR: [
            { taskId: null, checklistItemId: null, commentId: null },
            { task: { deletedAt: null } },
            { checklistItem: { task: { deletedAt: null } } },
            { comment: { task: { deletedAt: null } } },
          ],
        },
      }),
    ]);
    return {
      items: [
        ...tasks.map((item) => ({
          ...item,
          entityType: "task" as const,
          restoreUntil: new Date(item.deletedAt!.getTime() + retentionMs),
        })),
        ...files.map((item) => ({
          ...item,
          entityType: "attachment" as const,
          restoreUntil: new Date(item.deletedAt!.getTime() + retentionMs),
        })),
      ],
      page: page.page,
      pageSize: page.pageSize,
      total: taskTotal + fileTotal,
    };
  }

  async restoreTrash(
    actor: Actor,
    projectId: string,
    entityType: "task" | "attachment",
    entityId: string,
  ) {
    const project = await this.getProject(actor, projectId);
    this.requireProjectAdmin(actor, project);
    if (entityType === "attachment") {
      return this.attachments.restore(actor, projectId, entityId);
    }
    const root = await this.prisma.task.findFirst({
      where: { id: entityId, projectId, deletedAt: { not: null } },
    });
    if (!root || root.deletedAt!.getTime() + retentionMs <= Date.now())
      throw new NotFoundException();
    const restored = await this.prisma.$executeRaw(Prisma.sql`
      WITH RECURSIVE tree AS (
        SELECT id FROM "task" WHERE id = ${entityId}::uuid AND project_id = ${projectId}::uuid
        UNION ALL
        SELECT child.id FROM "task" child JOIN tree parent ON child.parent_id = parent.id
        WHERE child.deleted_at = ${root.deletedAt}
      )
      UPDATE "task" SET deleted_at = NULL
      WHERE id IN (SELECT id FROM tree) AND deleted_at = ${root.deletedAt}
    `);
    await this.audit(
      actor.id,
      projectId,
      "task",
      entityId,
      "task.restored",
      { deletedAt: root.deletedAt },
      { restored },
    );
    return { id: entityId, restored };
  }

  async permanentlyDelete(
    actor: Actor,
    projectId: string,
    entityType: "task" | "attachment",
    entityId: string,
  ) {
    const project = await this.getProject(actor, projectId);
    this.requireProjectAdmin(actor, project);
    if (entityType === "attachment") {
      const item = await this.prisma.attachment.findFirst({
        where: { id: entityId, projectId, deletedAt: { not: null } },
      });
      if (!item) throw new NotFoundException();
      await this.removeAttachmentObjects([item]);
      await this.prisma.attachment.delete({ where: { id: entityId } });
      await this.audit(
        actor.id,
        projectId,
        "attachment",
        entityId,
        "attachment.permanently_deleted",
        item,
        null,
      );
      return { id: entityId, deleted: true };
    }
    const task = await this.prisma.task.findFirst({
      where: { id: entityId, projectId, deletedAt: { not: null } },
      select: { id: true, deletedAt: true },
    });
    if (!task) throw new NotFoundException();
    const subtree = await this.prisma.$queryRaw<
      Array<{ id: string }>
    >(Prisma.sql`
      WITH RECURSIVE tree AS (
        SELECT id FROM "task" WHERE id = ${entityId}::uuid AND project_id = ${projectId}::uuid
        UNION ALL SELECT child.id FROM "task" child JOIN tree parent ON child.parent_id = parent.id
      ) SELECT id FROM tree
    `);
    const treeIds = subtree.map((item) => item.id);
    const files = await this.prisma.attachment.findMany({
      where: {
        projectId,
        OR: [
          { taskId: { in: treeIds } },
          { checklistItem: { taskId: { in: treeIds } } },
          { comment: { taskId: { in: treeIds } } },
        ],
      },
    });
    await this.removeAttachmentObjects(files);
    await this.prisma.$executeRaw(Prisma.sql`
      WITH RECURSIVE tree AS (
        SELECT id FROM "task" WHERE id = ${entityId}::uuid AND project_id = ${projectId}::uuid
        UNION ALL
        SELECT child.id FROM "task" child JOIN tree parent ON child.parent_id = parent.id
      )
      DELETE FROM "task" WHERE id IN (SELECT id FROM tree)
    `);
    await this.audit(
      actor.id,
      projectId,
      "task",
      entityId,
      "task.permanently_deleted",
      task,
      null,
    );
    return { id: entityId, deleted: true };
  }

  async purgeExpired(now = new Date()) {
    const expiry = new Date(now.getTime() - retentionMs);
    const projects = await this.prisma.project.findMany({
      where: { deletedAt: { lte: expiry } },
      select: { id: true },
      take: 100,
    });
    for (const project of projects) {
      const files = await this.prisma.attachment.findMany({
        where: { projectId: project.id },
      });
      await this.removeAttachmentObjects(files);
      await this.prisma.project.delete({ where: { id: project.id } });
    }
    const roots = await this.prisma.$queryRaw<
      Array<{ id: string; project_id: string }>
    >(Prisma.sql`
      WITH RECURSIVE expired_roots AS (
        SELECT task.id, task.project_id
        FROM "task" task
        LEFT JOIN "task" parent ON parent.id = task.parent_id
        WHERE task.deleted_at <= ${expiry}
          AND (parent.id IS NULL OR parent.deleted_at > ${expiry})
        ORDER BY task.deleted_at ASC
        LIMIT 100
      ),
      tree AS (
        SELECT root.id AS root_id, root.id AS task_id
        FROM expired_roots root
        UNION ALL
        SELECT tree.root_id, child.id
        FROM tree JOIN "task" child ON child.parent_id = tree.task_id
      )
      SELECT root.id, root.project_id
      FROM expired_roots root
      WHERE NOT EXISTS (
        SELECT 1 FROM tree
        JOIN "task" descendant ON descendant.id = tree.task_id
        WHERE tree.root_id = root.id AND descendant.deleted_at > ${expiry}
      )
    `);
    for (const root of roots) {
      const subtree = await this.prisma.$queryRaw<
        Array<{ id: string }>
      >(Prisma.sql`
        WITH RECURSIVE tree AS (
          SELECT id FROM "task" WHERE id = ${root.id}::uuid
          UNION ALL SELECT child.id FROM "task" child JOIN tree parent ON child.parent_id = parent.id
        ) SELECT id FROM tree
      `);
      const treeIds = subtree.map((item) => item.id);
      const files = await this.prisma.attachment.findMany({
        where: {
          projectId: root.project_id,
          OR: [
            { taskId: { in: treeIds } },
            { checklistItem: { taskId: { in: treeIds } } },
            { comment: { taskId: { in: treeIds } } },
          ],
        },
      });
      await this.removeAttachmentObjects(files);
      await this.prisma.$executeRaw(Prisma.sql`
        WITH RECURSIVE tree AS (
          SELECT id FROM "task" WHERE id = ${root.id}::uuid
          UNION ALL SELECT child.id FROM "task" child JOIN tree parent ON child.parent_id = parent.id
        ) DELETE FROM "task" WHERE id IN (SELECT id FROM tree)
      `);
    }
    const files = await this.prisma.attachment.findMany({
      where: { deletedAt: { lte: expiry } },
      take: 200,
    });
    for (const file of files) {
      await this.removeAttachmentObjects([file]);
      await this.prisma.attachment.delete({ where: { id: file.id } });
    }
    return {
      projects: projects.length,
      tasks: roots.length,
      attachments: files.length,
    };
  }

  async softDeleteProject(actor: Actor, projectId: string) {
    const project = await this.getProject(actor, projectId);
    this.requireProjectOwner(actor, project);
    const deletedAt = new Date();
    await this.prisma.project.update({
      where: { id: projectId },
      data: { deletedAt },
    });
    await this.audit(
      actor.id,
      projectId,
      "project",
      projectId,
      "project.deleted",
      project,
      { deletedAt },
    );
    return { id: projectId, deletedAt };
  }

  async listDeletedProjects(actor: Actor) {
    const projects = await this.prisma.project.findMany({
      where: {
        deletedAt: { not: null },
        ownerId: actor.id,
        branch: { organizationId: actor.organizationId },
      },
      orderBy: { deletedAt: "desc" },
      select: { id: true, name: true, deletedAt: true },
    });
    return {
      items: projects.map((project) => ({
        ...project,
        restoreUntil: new Date(project.deletedAt!.getTime() + retentionMs),
      })),
    };
  }

  async restoreProject(actor: Actor, projectId: string) {
    const project = await this.getProject(actor, projectId);
    this.requireProjectOwner(actor, project);
    if (
      !project.deletedAt ||
      project.deletedAt.getTime() + retentionMs <= Date.now()
    )
      throw new NotFoundException();
    const restored = await this.prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: null },
      select: { id: true, deletedAt: true },
    });
    await this.audit(
      actor.id,
      projectId,
      "project",
      projectId,
      "project.restored",
      project,
      restored,
    );
    return restored;
  }

  async permanentlyDeleteProject(actor: Actor, projectId: string) {
    const project = await this.getProject(actor, projectId);
    this.requireProjectOwner(actor, project);
    if (!project.deletedAt)
      throw new ConflictException("Dự án chưa nằm trong thùng rác");
    const files = await this.prisma.attachment.findMany({
      where: { projectId },
    });
    await this.removeAttachmentObjects(files);
    await this.prisma.project.delete({ where: { id: projectId } });
    await this.audit(
      actor.id,
      projectId,
      "project",
      projectId,
      "project.permanently_deleted",
      project,
      null,
    );
    return { id: projectId, deleted: true };
  }

  private async persistDomainEvent(event: EventPayload) {
    const userId =
      event.type === "task.assigned" ? event.userId : event.creatorId;
    await this.prisma.notification.create({
      data: {
        userId,
        type: event.type,
        payload: {
          projectId: event.projectId,
          taskId: event.taskId,
          ...(event.type === "task.status_changed"
            ? { status: event.status }
            : {}),
        },
      },
    });
  }

  private async activityPage(where: Prisma.ActivityLogWhereInput, page: Page) {
    const [items, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        orderBy: [{ at: "desc" }, { id: "desc" }],
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
        include: { actor: { select: { id: true, name: true } } },
      }),
      this.prisma.activityLog.count({ where }),
    ]);
    return { items, page: page.page, pageSize: page.pageSize, total };
  }

  private async getProject(actor: Actor, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        branch: { organizationId: actor.organizationId },
      },
      include: {
        branch: { select: { organizationId: true, id: true } },
        members: { select: { userId: true, role: true } },
      },
    });
    if (!project) throw new NotFoundException();
    return project;
  }

  private async getTask(actor: Actor, projectId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        projectId,
        deletedAt: null,
        project: { deletedAt: null },
      },
      include: {
        project: {
          include: {
            branch: { select: { id: true, organizationId: true } },
            members: { select: { userId: true, role: true } },
          },
        },
        creator: { select: { departmentId: true } },
        assignee: { select: { departmentId: true } },
      },
    });
    if (!task) throw new NotFoundException();
    return task;
  }

  private resource(
    task: Awaited<ReturnType<P16Service["getTask"]>>,
  ): TaskPermissionResource {
    return {
      type: "task",
      organizationId: task.project.branch.organizationId,
      projectId: task.projectId,
      branchId: task.project.branchId,
      confidentiality: task.project.confidentiality,
      projectRole: task.project.members.find(
        (member) => member.userId === task.creatorId,
      )?.role,
      creatorId: task.creatorId,
      assigneeId: task.assigneeId,
      departmentIds: [
        task.creator.departmentId,
        task.assignee?.departmentId,
      ].filter((id): id is string => id !== null && id !== undefined),
    };
  }

  private visibility(
    actor: Actor,
    task: Awaited<ReturnType<P16Service["getTask"]>>,
    action: "task.view" | "comment.write",
  ) {
    const resource = this.resource(task);
    resource.projectRole = task.project.members.find(
      (member) => member.userId === actor.id,
    )?.role;
    return permissionVisibility(actor, action, resource);
  }

  private requirePermission(
    actor: Actor,
    task: Awaited<ReturnType<P16Service["getTask"]>>,
    action: "comment.write",
  ) {
    if (this.visibility(actor, task, action) !== "full")
      throw new NotFoundException();
  }

  private projectVisibility(
    actor: Actor,
    project: Awaited<ReturnType<P16Service["getProject"]>>,
  ) {
    return permissionVisibility(actor, "project.view", {
      type: "project",
      organizationId: project.branch.organizationId,
      projectId: project.id,
      branchId: project.branchId,
      confidentiality: project.confidentiality,
      projectRole:
        project.ownerId === actor.id
          ? ProjectRole.owner
          : project.members.find((member) => member.userId === actor.id)?.role,
    });
  }

  private requireProjectAdmin(
    actor: Actor,
    project: Awaited<ReturnType<P16Service["getProject"]>>,
  ) {
    const role = project.members.find(
      (member) => member.userId === actor.id,
    )?.role;
    if (
      project.ownerId !== actor.id &&
      role !== ProjectRole.owner &&
      role !== ProjectRole.manager
    )
      throw new NotFoundException();
  }

  private requireProjectOwner(
    actor: Actor,
    project: Awaited<ReturnType<P16Service["getProject"]>>,
  ) {
    if (
      project.ownerId !== actor.id &&
      project.members.find((member) => member.userId === actor.id)?.role !==
        ProjectRole.owner
    )
      throw new NotFoundException();
  }

  private async audit(
    actorId: string,
    projectId: string,
    entityType: string,
    entityId: string,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    await this.prisma.activityLog.create({
      data: {
        entityType,
        entityId,
        projectId,
        actorId,
        action,
        before:
          before === null ? Prisma.JsonNull : (before as Prisma.InputJsonValue),
        after:
          after === null ? Prisma.JsonNull : (after as Prisma.InputJsonValue),
      },
    });
  }

  private async removeAttachmentObjects(
    items: Array<{
      storageKey: string;
      uploadStorageKey: string | null;
      thumbKey: string | null;
      previewKey: string | null;
    }>,
  ) {
    const keys = new Set(
      items.flatMap((item) =>
        [
          item.storageKey,
          item.uploadStorageKey,
          item.thumbKey,
          item.previewKey,
        ].filter((key): key is string => Boolean(key)),
      ),
    );
    for (const key of keys) {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }),
      );
    }
  }
}
