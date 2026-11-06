import { randomBytes, randomUUID, createHash } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { hash } from "@node-rs/argon2";
import {
  AssignmentEvidenceRequirement,
  AssignmentLevel,
  AssignmentStatus,
  Confidentiality,
  Prisma,
  ProjectRole,
  ProjectStatus,
  ProgressMode,
  UserStatus,
  SystemRole,
} from "@prisma/client";
import type Redis from "ioredis";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { Env } from "../config/env";
import { ENV, PrismaService, REDIS, S3 } from "../infra/infra.module";
import type { AuthenticatedUser } from "../auth/auth.service";
import { canInProject } from "../permissions/permissions";
import {
  customFieldDefinitionsSchema,
  type CustomFieldDefinition,
} from "@qlcv/shared";

type Actor = AuthenticatedUser;

const INVITATION_TTL_SECONDS = 72 * 60 * 60;
const DEFAULT_CALENDAR = { weeklyOff: [0], holidays: [] as string[] };

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function snapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function userAuditView(user: {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  systemRole: SystemRole;
  branchId: string | null;
  departmentId: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    systemRole: user.systemRole,
    branchId: user.branchId,
    departmentId: user.departmentId,
  };
}

function audit(
  entityType: string,
  entityId: string,
  actorId: string,
  action: string,
  before?: unknown,
  after?: unknown,
  projectId?: string,
): Prisma.ActivityLogCreateManyInput {
  return {
    entityType,
    entityId,
    actorId,
    action,
    ...(before === undefined ? {} : { before: snapshot(before) }),
    ...(after === undefined ? {} : { after: snapshot(after) }),
    ...(projectId ? { projectId } : {}),
  };
}

@Injectable()
export class ManagementService {
  private readonly mailer: Transporter;
  private readonly logger = new Logger(ManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
    @Inject(S3) private readonly s3: S3Client,
  ) {
    const auth =
      this.env.SMTP_USER && this.env.SMTP_PASSWORD
        ? { user: this.env.SMTP_USER, pass: this.env.SMTP_PASSWORD }
        : undefined;
    this.mailer = nodemailer.createTransport({
      host: this.env.SMTP_HOST,
      port: this.env.SMTP_PORT,
      secure: this.env.SMTP_SECURE,
      ...(auth ? { auth } : {}),
    });
  }

  async listBranches(actor: Actor) {
    this.requireSystemAdmin(actor);
    return this.prisma.branch.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { name: "asc" },
    });
  }

  async listAvailableBranches(actor: Actor) {
    const branchId = actor.branchId;
    if (actor.systemRole !== SystemRole.system_admin && !branchId) return [];
    const where: Prisma.BranchWhereInput = {
      organizationId: actor.organizationId,
      isActive: true,
    };
    if (actor.systemRole !== SystemRole.system_admin && branchId) {
      where.id = branchId;
    }
    return this.prisma.branch.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  async createBranch(actor: Actor, input: { name: string; code?: string }) {
    this.requireSystemAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.create({
        data: {
          organizationId: actor.organizationId,
          name: input.name.trim(),
          code: input.code?.trim() || null,
        },
      });
      await tx.activityLog.create({
        data: audit(
          "branch",
          branch.id,
          actor.id,
          "branch.created",
          undefined,
          branch,
        ),
      });
      return branch;
    });
  }

  async updateBranch(
    actor: Actor,
    id: string,
    input: { name?: string; code?: string | null; isActive?: boolean },
  ) {
    this.requireSystemAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.branch.findFirst({
        where: { id, organizationId: actor.organizationId },
      });
      if (!before) throw new NotFoundException();
      const branch = await tx.branch.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          ...(input.code === undefined
            ? {}
            : { code: input.code?.trim() || null }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        },
      });
      await tx.activityLog.create({
        data: audit("branch", id, actor.id, "branch.updated", before, branch),
      });
      return branch;
    });
  }

  async listDepartments(actor: Actor) {
    this.requireSystemAdmin(actor);
    return this.prisma.department.findMany({
      where: { organizationId: actor.organizationId },
      include: { branch: { select: { id: true, name: true } } },
      orderBy: [{ branch: { name: "asc" } }, { name: "asc" }],
    });
  }

  async createDepartment(
    actor: Actor,
    input: { name: string; branchId?: string | null },
  ) {
    this.requireSystemAdmin(actor);
    if (input.branchId)
      await this.requireBranch(actor.organizationId, input.branchId);
    return this.prisma.$transaction(async (tx) => {
      const department = await tx.department.create({
        data: {
          organizationId: actor.organizationId,
          name: input.name.trim(),
          branchId: input.branchId || null,
        },
      });
      await tx.activityLog.create({
        data: audit(
          "department",
          department.id,
          actor.id,
          "department.created",
          undefined,
          department,
        ),
      });
      return department;
    });
  }

  async updateDepartment(
    actor: Actor,
    id: string,
    input: { name?: string; branchId?: string | null; isActive?: boolean },
  ) {
    this.requireSystemAdmin(actor);
    if (input.branchId)
      await this.requireBranch(actor.organizationId, input.branchId);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.department.findFirst({
        where: { id, organizationId: actor.organizationId },
      });
      if (!before) throw new NotFoundException();
      const department = await tx.department.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          ...(input.branchId === undefined ? {} : { branchId: input.branchId }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        },
      });
      await tx.activityLog.create({
        data: audit(
          "department",
          id,
          actor.id,
          "department.updated",
          before,
          department,
        ),
      });
      return department;
    });
  }

  async listUsers(
    actor: Actor,
    query: {
      page: number;
      pageSize: number;
      search?: string;
      status?: UserStatus;
    },
  ) {
    this.requireSystemAdmin(actor);
    const where: Prisma.UserWhereInput = {
      organizationId: actor.organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          systemRole: true,
          branchId: true,
          departmentId: true,
          createdAt: true,
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async inviteUser(
    actor: Actor,
    input: {
      email: string;
      name: string;
      systemRole?: SystemRole;
      branchId?: string | null;
      departmentId?: string | null;
    },
  ) {
    this.requireSystemAdmin(actor);
    const email = input.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException("Email đã được sử dụng");
    }
    if (input.branchId)
      await this.requireBranch(actor.organizationId, input.branchId);
    if (input.departmentId)
      await this.requireDepartment(actor.organizationId, input.departmentId);
    if (input.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: input.departmentId, organizationId: actor.organizationId },
        select: { branchId: true },
      });
      if (
        department?.branchId &&
        department.branchId !== (input.branchId ?? null)
      ) {
        throw new BadRequestException(
          "Phòng ban không thuộc chi nhánh đã chọn",
        );
      }
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          organizationId: actor.organizationId,
          email,
          name: input.name.trim(),
          status: UserStatus.invited,
          systemRole: input.systemRole ?? SystemRole.member,
          branchId: input.branchId || null,
          departmentId: input.departmentId || null,
        },
      });
      if (input.departmentId) {
        await tx.userDepartment.create({
          data: {
            userId: created.id,
            departmentId: input.departmentId,
            isHead: created.systemRole === SystemRole.department_head,
          },
        });
      }
      return created;
    });
    const token = randomBytes(32).toString("base64url");
    await this.redis.set(
      `auth:invitation:${hashToken(token)}`,
      user.id,
      "EX",
      INVITATION_TTL_SECONDS,
    );
    const inviteUrl = new URL("/accept-invitation", this.env.WEB_BASE_URL);
    inviteUrl.searchParams.set("token", token);
    try {
      await this.mailer.sendMail({
        from: this.env.SMTP_FROM,
        to: user.email,
        subject: "Lời mời tham gia QLCV",
        text: `Mở liên kết sau trong vòng 72 giờ để đặt mật khẩu và kích hoạt tài khoản: ${inviteUrl.toString()}`,
      });
    } catch (error) {
      await this.redis.del(`auth:invitation:${hashToken(token)}`);
      await this.prisma.user.delete({ where: { id: user.id } });
      throw error;
    }
    await this.prisma.activityLog.create({
      data: audit("user", user.id, actor.id, "user.invited", undefined, {
        email,
        systemRole: user.systemRole,
      }),
    });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
    };
  }

  async completeInvitation(token: string, password: string) {
    const invitationKey = `auth:invitation:${hashToken(token)}`;
    const claimKey = `auth:invitation:claim:${hashToken(token)}`;
    const claimId = randomUUID();
    const claimed = await this.redis.set(claimKey, claimId, "EX", 60, "NX");
    if (claimed !== "OK")
      throw new ConflictException("Lời mời đang được xử lý, vui lòng thử lại");

    try {
      const userId = await this.redis.get(invitationKey);
      if (!userId)
        throw new NotFoundException("Lời mời không hợp lệ hoặc đã hết hạn");
      const user = await this.prisma.user.findFirst({
        where: { id: userId, status: UserStatus.invited },
      });
      if (!user)
        throw new NotFoundException("Lời mời không hợp lệ hoặc đã hết hạn");

      const passwordHash = await hash(password);
      const activated = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: user.id, status: UserStatus.invited },
          data: { passwordHash, status: UserStatus.active },
          select: { id: true, email: true, name: true, status: true },
        });
        await tx.activityLog.create({
          data: audit("user", user.id, user.id, "user.activated"),
        });
        return updated;
      });

      try {
        await this.redis.del(invitationKey);
      } catch (error) {
        this.logger.error({
          message: "Failed to remove activated invitation token",
          error: String(error),
        });
      }
      return activated;
    } finally {
      try {
        await this.redis.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          1,
          claimKey,
          claimId,
        );
      } catch (error) {
        this.logger.error({
          message: "Failed to release invitation claim",
          error: String(error),
        });
      }
    }
  }

  async disableUser(actor: Actor, id: string) {
    this.requireSystemAdmin(actor);
    const before = await this.prisma.user.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!before) throw new NotFoundException();
    if (before.id === actor.id)
      throw new BadRequestException(
        "Không thể vô hiệu hóa tài khoản đang sử dụng",
      );
    const now = new Date();
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { status: UserStatus.disabled },
        select: { id: true, email: true, name: true, status: true },
      });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.activityLog.create({
        data: audit(
          "user",
          id,
          actor.id,
          "user.disabled",
          userAuditView(before),
          updated,
        ),
      });
      return updated;
    });
    return user;
  }

  async changeUserRole(actor: Actor, id: string, systemRole: SystemRole) {
    this.requireSystemAdmin(actor);
    const before = await this.prisma.user.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!before) throw new NotFoundException();
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { systemRole },
        select: {
          id: true,
          email: true,
          name: true,
          systemRole: true,
          departmentId: true,
        },
      });
      if (updated.departmentId) {
        await tx.userDepartment.upsert({
          where: {
            userId_departmentId: {
              userId: id,
              departmentId: updated.departmentId,
            },
          },
          create: {
            userId: id,
            departmentId: updated.departmentId,
            isHead: systemRole === SystemRole.department_head,
          },
          update: { isHead: systemRole === SystemRole.department_head },
        });
      }
      await tx.activityLog.create({
        data: audit(
          "user",
          id,
          actor.id,
          "user.role_changed",
          userAuditView(before),
          { systemRole },
        ),
      });
      return updated;
    });
    return user;
  }

  async updateUser(
    actor: Actor,
    id: string,
    input: {
      name?: string;
      branchId?: string | null;
      departmentId?: string | null;
    },
  ) {
    this.requireSystemAdmin(actor);
    const before = await this.prisma.user.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!before) throw new NotFoundException();
    const branchId =
      input.branchId === undefined ? before.branchId : input.branchId;
    const departmentId =
      input.departmentId === undefined
        ? before.departmentId
        : input.departmentId;
    if (branchId) await this.requireBranch(actor.organizationId, branchId);
    if (departmentId) {
      const department = await this.requireDepartment(
        actor.organizationId,
        departmentId,
      );
      if (department.branchId && department.branchId !== branchId) {
        throw new BadRequestException(
          "Phòng ban không thuộc chi nhánh đã chọn",
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          branchId,
          departmentId,
        },
        select: {
          id: true,
          email: true,
          name: true,
          branchId: true,
          departmentId: true,
        },
      });
      if (before.departmentId !== departmentId) {
        if (before.departmentId) {
          await tx.userDepartment.deleteMany({
            where: { userId: id, departmentId: before.departmentId },
          });
        }
        if (departmentId) {
          await tx.userDepartment.upsert({
            where: { userId_departmentId: { userId: id, departmentId } },
            create: {
              userId: id,
              departmentId,
              isHead: before.systemRole === SystemRole.department_head,
            },
            update: {
              isHead: before.systemRole === SystemRole.department_head,
            },
          });
        }
      }
      await tx.activityLog.create({
        data: audit(
          "user",
          id,
          actor.id,
          "user.updated",
          userAuditView(before),
          user,
        ),
      });
      return user;
    });
  }

  async listProjects(
    actor: Actor,
    query: {
      page: number;
      pageSize: number;
      branchId?: string;
      status?: ProjectStatus;
      mine?: boolean;
      search?: string;
      sort?: "name" | "createdAt" | "dueDate";
      order?: "asc" | "desc";
    },
  ) {
    const scopedWhere: Prisma.ProjectWhereInput = {
      deletedAt: null,
      branch: { organizationId: actor.organizationId },
      OR: [
        { ownerId: actor.id },
        { members: { some: { userId: actor.id } } },
        ...(actor.systemRole === "branch_director" && actor.branchId
          ? [
              {
                branchId: actor.branchId,
                confidentiality: Confidentiality.normal,
              },
            ]
          : []),
      ],
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.mine
        ? {
            OR: [
              { ownerId: actor.id },
              { members: { some: { userId: actor.id } } },
            ],
          }
        : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: "insensitive" } }
        : {}),
    };
    const [projects, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where: scopedWhere,
        include: {
          branch: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } },
          _count: {
            select: {
              tasks: { where: { deletedAt: null } },
            },
          },
        },
        orderBy: { [query.sort ?? "createdAt"]: query.order ?? "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.project.count({ where: scopedWhere }),
    ]);
    const projectIds = projects.map((project) => project.id);
    const [taskGroups, lateGroups] = projectIds.length
      ? await Promise.all([
          this.prisma.task.groupBy({
            by: ["projectId", "status"],
            where: { projectId: { in: projectIds }, deletedAt: null },
            _count: { _all: true },
          }),
          this.prisma.task.groupBy({
            by: ["projectId"],
            where: {
              projectId: { in: projectIds },
              deletedAt: null,
              dueDate: { lt: new Date(new Date().setUTCHours(0, 0, 0, 0)) },
              status: { not: "done" },
            },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    const taskCounts = new Map<string, { total: number; done: number }>();
    for (const row of taskGroups) {
      const counts = taskCounts.get(row.projectId) ?? { total: 0, done: 0 };
      counts.total += row._count._all;
      if (row.status === "done") counts.done += row._count._all;
      taskCounts.set(row.projectId, counts);
    }
    const lateCounts = new Map(
      lateGroups.map((row) => [row.projectId, row._count._all]),
    );
    return {
      items: projects.map(({ _count, ...project }) => {
        const stats = taskCounts.get(project.id) ?? { total: 0, done: 0 };
        return {
          ...project,
          stats: {
            taskCount: _count.tasks,
            overdueTaskCount: lateCounts.get(project.id) ?? 0,
            completionPercent: stats.total
              ? Math.round((stats.done / stats.total) * 100)
              : 0,
          },
        };
      }),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getProject(actor: Actor, id: string) {
    const project = await this.findProject(actor, id);
    return project;
  }

  async createProject(
    actor: Actor,
    input: {
      branchId: string;
      name: string;
      description?: string;
      startDate?: string;
      dueDate?: string;
      workCalendar?: { weeklyOff: number[]; holidays: string[] };
      progressMode?: ProgressMode;
      confidentiality?: Confidentiality;
      statusLabels?: Record<string, string>;
      customFieldDefinitions?: CustomFieldDefinition[];
      assignmentLevel?: AssignmentLevel;
      strictEvidenceRequirement?: AssignmentEvidenceRequirement;
    },
  ) {
    const branch = await this.requireBranch(
      actor.organizationId,
      input.branchId,
    );
    if (
      actor.systemRole === SystemRole.branch_director &&
      actor.branchId !== branch.id
    ) {
      throw new ForbiddenException();
    }
    if (
      actor.systemRole !== SystemRole.system_admin &&
      actor.systemRole !== SystemRole.branch_director &&
      actor.branchId !== branch.id
    ) {
      throw new ForbiddenException();
    }
    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          branchId: branch.id,
          ownerId: actor.id,
          name: input.name.trim(),
          description: input.description ?? null,
          startDate: input.startDate ? new Date(input.startDate) : null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          workCalendar: input.workCalendar ?? DEFAULT_CALENDAR,
          progressMode: input.progressMode ?? ProgressMode.by_workdays,
          confidentiality: input.confidentiality ?? Confidentiality.normal,
          statusLabels: input.statusLabels ?? {},
          customFieldDefinitions: input.customFieldDefinitions ?? [],
          assignmentLevel: input.assignmentLevel ?? AssignmentLevel.light,
          strictEvidenceRequirement:
            input.strictEvidenceRequirement ??
            AssignmentEvidenceRequirement.either,
          members: { create: { userId: actor.id, role: ProjectRole.owner } },
        },
      });
      await tx.activityLog.create({
        data: audit(
          "project",
          created.id,
          actor.id,
          "project.created",
          undefined,
          created,
          created.id,
        ),
      });
      return created;
    });
    return project;
  }

  async updateProject(
    actor: Actor,
    id: string,
    input: {
      name?: string;
      description?: string | null;
      branchId?: string;
      status?: ProjectStatus;
      criticalPathEnabled?: boolean;
      autoRescheduleEnabled?: boolean;
      baselineEnabled?: boolean;
      membersMayExport?: boolean;
      startDate?: string | null;
      dueDate?: string | null;
      workCalendar?: { weeklyOff: number[]; holidays: string[] };
      progressMode?: ProgressMode;
      confidentiality?: Confidentiality;
      statusLabels?: Record<string, string>;
      customFieldDefinitions?: CustomFieldDefinition[];
      assignmentLevel?: AssignmentLevel;
      strictEvidenceRequirement?: AssignmentEvidenceRequirement;
    },
  ) {
    const before = await this.requireProjectManager(actor, id);
    if (input.branchId) {
      const branch = await this.requireBranch(
        actor.organizationId,
        input.branchId,
      );
      if (
        actor.systemRole === "branch_director" &&
        actor.branchId !== branch.id
      ) {
        throw new ForbiddenException();
      }
    }
    if (input.customFieldDefinitions !== undefined) {
      const currentDefinitions = customFieldDefinitionsSchema.safeParse(
        before.customFieldDefinitions,
      );
      if (!currentDefinitions.success) {
        throw new Error(
          `Invalid stored custom field definitions for project ${id}`,
        );
      }
      const nextByKey = new Map(
        input.customFieldDefinitions.map((field) => [field.key, field]),
      );
      const changedOptions = currentDefinitions.data.some((field) => {
        const next = nextByKey.get(field.key);
        return (
          !next ||
          field.type !== next.type ||
          (field.type === "select" &&
            next.type === "select" &&
            field.options?.some((option) => !next.options?.includes(option)))
        );
      });
      const removedFields = currentDefinitions.data.filter(
        (field) => !nextByKey.has(field.key),
      );
      if (changedOptions || removedFields.length > 0) {
        const tasks = await this.prisma.task.findMany({
          where: { projectId: id, deletedAt: null },
          select: { customFields: true },
        });
        const usedValues = tasks.some(({ customFields }) => {
          if (
            typeof customFields !== "object" ||
            customFields === null ||
            Array.isArray(customFields)
          ) {
            return false;
          }
          const values = customFields as Prisma.JsonObject;
          return currentDefinitions.data.some((field) => {
            const value = values[field.key];
            if (value === null || value === undefined || value === "") {
              return false;
            }
            const next = nextByKey.get(field.key);
            return (
              !next ||
              field.type !== next.type ||
              (field.type === "select" &&
                next.type === "select" &&
                typeof value === "string" &&
                !next.options?.includes(value))
            );
          });
        });
        if (usedValues) {
          throw new BadRequestException(
            "Không thể xóa trường hoặc tùy chọn đang được việc sử dụng",
          );
        }
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
          ...(input.branchId === undefined ? {} : { branchId: input.branchId }),
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.criticalPathEnabled === undefined
            ? {}
            : { criticalPathEnabled: input.criticalPathEnabled }),
          ...(input.autoRescheduleEnabled === undefined
            ? {}
            : { autoRescheduleEnabled: input.autoRescheduleEnabled }),
          ...(input.baselineEnabled === undefined
            ? {}
            : { baselineEnabled: input.baselineEnabled }),
          ...(input.membersMayExport === undefined
            ? {}
            : { membersMayExport: input.membersMayExport }),
          ...(input.startDate === undefined
            ? {}
            : {
                startDate: input.startDate ? new Date(input.startDate) : null,
              }),
          ...(input.dueDate === undefined
            ? {}
            : { dueDate: input.dueDate ? new Date(input.dueDate) : null }),
          ...(input.workCalendar === undefined
            ? {}
            : { workCalendar: input.workCalendar }),
          ...(input.progressMode === undefined
            ? {}
            : { progressMode: input.progressMode }),
          ...(input.confidentiality === undefined
            ? {}
            : { confidentiality: input.confidentiality }),
          ...(input.statusLabels === undefined
            ? {}
            : { statusLabels: input.statusLabels }),
          ...(input.customFieldDefinitions === undefined
            ? {}
            : { customFieldDefinitions: input.customFieldDefinitions }),
          ...(input.assignmentLevel === undefined
            ? {}
            : { assignmentLevel: input.assignmentLevel }),
          ...(input.strictEvidenceRequirement === undefined
            ? {}
            : { strictEvidenceRequirement: input.strictEvidenceRequirement }),
        },
      });
      if (
        input.assignmentLevel !== undefined &&
        input.assignmentLevel !== before.assignmentLevel
      ) {
        await this.syncInheritedAssignmentStates(
          tx,
          id,
          input.assignmentLevel,
          actor.id,
        );
      }
      await tx.activityLog.create({
        data: audit(
          "project",
          id,
          actor.id,
          "project.updated",
          before,
          updated,
          id,
        ),
      });
      return updated;
    });
  }

  private async syncInheritedAssignmentStates(
    tx: Prisma.TransactionClient,
    projectId: string,
    level: AssignmentLevel,
    actorId: string,
  ) {
    if (level === AssignmentLevel.light) {
      const tasks = await tx.task.findMany({
        where: {
          projectId,
          assignmentLevel: null,
          assignmentStatus: { not: null },
          deletedAt: null,
        },
        select: { id: true, assignmentStatus: true },
      });
      await tx.task.updateMany({
        where: { projectId, assignmentLevel: null, deletedAt: null },
        data: {
          assignmentStatus: null,
          version: { increment: 1 },
        },
      });
      if (tasks.length) {
        await tx.taskAssignmentEvent.createMany({
          data: tasks.map((task) => ({
            projectId,
            taskId: task.id,
            actorId,
            action: "project_level_changed",
            fromStatus: task.assignmentStatus,
            toStatus: null,
          })),
        });
      }
      return;
    }

    const changed = await tx.$queryRaw<
      Array<{
        id: string;
        fromStatus: AssignmentStatus | null;
        toStatus: AssignmentStatus;
      }>
    >(Prisma.sql`
      WITH mapped AS (
        SELECT
          task.id,
          task.assignment_status AS old_status,
          COALESCE(
            task.assignment_status,
            CASE task.status
              WHEN 'todo'::"task_status" THEN
                CASE
                  WHEN task.assignee_id IS NOT NULL AND task.due_date IS NOT NULL
                    THEN 'assigned'::"assignment_status"
                  ELSE 'draft'::"assignment_status"
                END
              WHEN 'doing'::"task_status" THEN 'in_progress'::"assignment_status"
              WHEN 'done'::"task_status" THEN 'done'::"assignment_status"
              WHEN 'blocked'::"task_status" THEN 'on_hold'::"assignment_status"
            END
          ) AS next_status
        FROM "task" AS task
        WHERE task.project_id = ${projectId}::uuid
          AND task.assignment_level IS NULL
          AND task.deleted_at IS NULL
      )
      UPDATE "task" AS task
      SET assignment_status = mapped.next_status,
          reviewer_id = COALESCE(task.reviewer_id, task.creator_id),
          assigner_id = COALESCE(task.assigner_id, task.creator_id),
          version = task.version + 1,
          updated_at = CURRENT_TIMESTAMP
      FROM mapped
      WHERE task.id = mapped.id
      RETURNING task.id, mapped.old_status AS "fromStatus",
                mapped.next_status AS "toStatus"
    `);
    const events = changed
      .filter((task) => task.fromStatus !== task.toStatus)
      .map((task) => ({
        projectId,
        taskId: task.id,
        actorId,
        action: "project_level_changed",
        fromStatus: task.fromStatus,
        toStatus: task.toStatus,
      }));
    if (events.length)
      await tx.taskAssignmentEvent.createMany({ data: events });
  }

  async archiveProject(actor: Actor, id: string) {
    const before = await this.requireProjectManager(actor, id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({
        where: { id },
        data: { status: ProjectStatus.archived },
      });
      await tx.activityLog.create({
        data: audit(
          "project",
          id,
          actor.id,
          "project.archived",
          before,
          updated,
          id,
        ),
      });
      return updated;
    });
  }

  async deleteProject(actor: Actor, id: string) {
    const before = await this.requireProjectManager(actor, id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await tx.activityLog.create({
        data: audit(
          "project",
          id,
          actor.id,
          "project.deleted",
          before,
          updated,
          id,
        ),
      });
      return { id: updated.id, deletedAt: updated.deletedAt };
    });
  }

  async cloneProject(
    actor: Actor,
    id: string,
    options: {
      name?: string;
      includeMembers?: boolean;
      includeFiles?: boolean;
    },
  ) {
    await this.requireProjectManager(actor, id);
    const copiedKeys: string[] = [];
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const source = await tx.project.findFirst({
            where: { id, deletedAt: null },
            include: {
              members: {
                where: { user: { status: UserStatus.active } },
              },
              labels: true,
              tasks: {
                where: { deletedAt: null },
                orderBy: [{ depth: "asc" }, { position: "asc" }],
                include: {
                  checklistItems: { orderBy: { position: "asc" } },
                  labels: true,
                  attachments: { where: { deletedAt: null, isCurrent: true } },
                },
              },
              attachments: {
                where: {
                  deletedAt: null,
                  isCurrent: true,
                  taskId: null,
                  checklistItemId: null,
                  commentId: null,
                },
              },
            },
          });
          if (!source) throw new NotFoundException();

          const clone = await tx.project.create({
            data: {
              branchId: source.branchId,
              ownerId: actor.id,
              name: options.name?.trim() || `${source.name} (bản sao)`,
              description: source.description,
              status: ProjectStatus.active,
              startDate: source.startDate,
              dueDate: source.dueDate,
              workCalendar: source.workCalendar as Prisma.InputJsonValue,
              progressMode: source.progressMode,
              confidentiality: source.confidentiality,
              statusLabels: source.statusLabels as Prisma.InputJsonValue,
              assignmentLevel: source.assignmentLevel,
              strictEvidenceRequirement: source.strictEvidenceRequirement,
            },
          });

          await tx.projectMember.create({
            data: {
              projectId: clone.id,
              userId: actor.id,
              role: ProjectRole.owner,
            },
          });
          if (options.includeMembers) {
            const members = source.members.filter(
              (member) => member.userId !== actor.id,
            );
            if (members.length) {
              await tx.projectMember.createMany({
                data: members.map((member) => ({
                  projectId: clone.id,
                  userId: member.userId,
                  role:
                    member.role === ProjectRole.owner
                      ? ProjectRole.manager
                      : member.role,
                })),
                skipDuplicates: true,
              });
            }
          }

          const labelMap = new Map<string, string>();
          for (const label of source.labels) {
            const createdLabel = await tx.label.create({
              data: {
                organizationId: actor.organizationId,
                projectId: clone.id,
                name: label.name,
                color: label.color,
              },
            });
            labelMap.set(label.id, createdLabel.id);
          }

          const taskMap = new Map<string, string>();
          const checklistMap = new Map<string, string>();
          for (const task of source.tasks) {
            const createdTask = await tx.task.create({
              data: {
                projectId: clone.id,
                parentId: task.parentId
                  ? (taskMap.get(task.parentId) ?? null)
                  : null,
                type: task.type,
                position: task.position,
                title: task.title,
                description: task.description,
                status: "todo",
                priority: task.priority,
                startDate: task.startDate,
                durationDays: task.durationDays,
                dueDate: task.dueDate,
                progress: 0,
                assignmentLevel: task.assignmentLevel,
                assignmentStatus:
                  (task.assignmentLevel ?? source.assignmentLevel) ===
                  AssignmentLevel.light
                    ? null
                    : "draft",
                reviewerId:
                  (task.assignmentLevel ?? source.assignmentLevel) ===
                  AssignmentLevel.light
                    ? null
                    : actor.id,
                assignerId:
                  (task.assignmentLevel ?? source.assignmentLevel) ===
                  AssignmentLevel.light
                    ? null
                    : actor.id,
                creatorId: actor.id,
                customFields: task.customFields as Prisma.InputJsonValue,
              },
            });
            taskMap.set(task.id, createdTask.id);
            for (const item of task.checklistItems) {
              const createdItem = await tx.checklistItem.create({
                data: {
                  taskId: createdTask.id,
                  title: item.title,
                  done: false,
                  assigneeId: item.assigneeId,
                  position: item.position,
                },
              });
              checklistMap.set(item.id, createdItem.id);
            }
            const clonedLabels = task.labels.flatMap((link) => {
              const labelId = labelMap.get(link.labelId);
              return labelId ? [{ taskId: createdTask.id, labelId }] : [];
            });
            if (clonedLabels.length)
              await tx.taskLabel.createMany({ data: clonedLabels });
          }

          const dependencies = await tx.taskDependency.findMany({
            where: {
              predecessorId: { in: source.tasks.map((task) => task.id) },
            },
          });
          const clonedDependencies = dependencies.flatMap((dependency) => {
            const predecessorId = taskMap.get(dependency.predecessorId);
            const successorId = taskMap.get(dependency.successorId);
            return predecessorId && successorId
              ? [
                  {
                    predecessorId,
                    successorId,
                    type: dependency.type,
                    lagDays: dependency.lagDays,
                  },
                ]
              : [];
          });
          if (clonedDependencies.length)
            await tx.taskDependency.createMany({ data: clonedDependencies });

          if (options.includeFiles) {
            const attachments = [
              ...source.attachments,
              ...source.tasks.flatMap((task) => task.attachments),
            ];
            for (const attachment of attachments) {
              const taskId = attachment.taskId
                ? taskMap.get(attachment.taskId)
                : null;
              const checklistItemId = attachment.checklistItemId
                ? checklistMap.get(attachment.checklistItemId)
                : null;
              if (
                (attachment.taskId && !taskId) ||
                (attachment.checklistItemId && !checklistItemId)
              )
                continue;

              const storageKey = `projects/${clone.id}/attachments/${randomUUID()}`;
              await this.s3.send(
                new CopyObjectCommand({
                  Bucket: this.env.S3_BUCKET,
                  CopySource: `/${this.env.S3_BUCKET}/${attachment.storageKey
                    .split("/")
                    .map(encodeURIComponent)
                    .join("/")}`,
                  Key: storageKey,
                }),
              );
              copiedKeys.push(storageKey);

              let thumbKey: string | null = null;
              if (attachment.thumbKey) {
                thumbKey = `projects/${clone.id}/attachments/${randomUUID()}-thumb`;
                await this.s3.send(
                  new CopyObjectCommand({
                    Bucket: this.env.S3_BUCKET,
                    CopySource: `/${this.env.S3_BUCKET}/${attachment.thumbKey
                      .split("/")
                      .map(encodeURIComponent)
                      .join("/")}`,
                    Key: thumbKey,
                  }),
                );
                copiedKeys.push(thumbKey);
              }

              let previewKey: string | null = null;
              if (attachment.previewKey) {
                previewKey = `projects/${clone.id}/attachments/${randomUUID()}-preview`;
                await this.s3.send(
                  new CopyObjectCommand({
                    Bucket: this.env.S3_BUCKET,
                    CopySource: `/${this.env.S3_BUCKET}/${attachment.previewKey
                      .split("/")
                      .map(encodeURIComponent)
                      .join("/")}`,
                    Key: previewKey,
                  }),
                );
                copiedKeys.push(previewKey);
              }

              await tx.attachment.create({
                data: {
                  projectId: clone.id,
                  taskId,
                  checklistItemId,
                  uploaderId: actor.id,
                  fileName: attachment.fileName,
                  mime: attachment.mime,
                  size: attachment.size,
                  storageKey,
                  thumbKey,
                  previewKey,
                  width: attachment.width,
                  height: attachment.height,
                  confirmedAt: new Date(),
                  note: attachment.note,
                  takenAt: attachment.takenAt,
                  lat: attachment.lat,
                  lng: attachment.lng,
                },
              });
            }
          }

          await tx.activityLog.create({
            data: audit(
              "project",
              clone.id,
              actor.id,
              "project.cloned",
              { sourceProjectId: source.id },
              {
                projectId: clone.id,
                includeMembers: options.includeMembers ?? false,
                includeFiles: options.includeFiles ?? false,
              },
              clone.id,
            ),
          });
          return clone;
        },
        { maxWait: 10000, timeout: 120000 },
      );
    } catch (error) {
      const cleanup = await Promise.allSettled(
        copiedKeys.map((Key) =>
          this.s3.send(
            new DeleteObjectCommand({ Bucket: this.env.S3_BUCKET, Key }),
          ),
        ),
      );
      cleanup.forEach((result) => {
        if (result.status === "rejected") {
          this.logger.error({
            message: "Failed to clean up cloned project object",
            error: String(result.reason),
          });
        }
      });
      throw error;
    }
  }

  async addProjectMember(
    actor: Actor,
    projectId: string,
    userId: string,
    role: ProjectRole,
  ) {
    const project = await this.requireProjectManager(actor, projectId);
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId: actor.organizationId,
        status: UserStatus.active,
      },
    });
    if (!user)
      throw new BadRequestException(
        "Thành viên phải tồn tại và đang hoạt động",
      );
    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (existing)
      throw new ConflictException("Người dùng đã là thành viên dự án");
    return this.prisma.$transaction(
      async (tx) => {
        const member = await tx.projectMember.create({
          data: { projectId, userId, role },
          include: { user: { select: { id: true, name: true, email: true } } },
        });
        await tx.activityLog.create({
          data: audit(
            "project_member",
            userId,
            actor.id,
            "project.member_added",
            undefined,
            member,
            project.id,
          ),
        });
        return member;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async updateProjectMemberRole(
    actor: Actor,
    projectId: string,
    userId: string,
    role: ProjectRole,
  ) {
    const project = await this.requireProjectManager(actor, projectId);
    return this.prisma.$transaction(
      async (tx) => {
        const before = await tx.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId } },
        });
        if (!before) throw new NotFoundException();
        if (before.role === ProjectRole.owner && role !== ProjectRole.owner) {
          const replacement = await tx.projectMember.findFirst({
            where: {
              projectId,
              role: ProjectRole.owner,
              userId: { not: userId },
            },
          });
          if (!replacement)
            throw new BadRequestException(
              "Không thể gỡ vai trò của chủ dự án cuối cùng",
            );
          if (project.ownerId === userId) {
            await tx.project.update({
              where: { id: projectId },
              data: { ownerId: replacement.userId },
            });
          }
        }
        const member = await tx.projectMember.update({
          where: { projectId_userId: { projectId, userId } },
          data: { role },
          include: { user: { select: { id: true, name: true, email: true } } },
        });
        await tx.activityLog.create({
          data: audit(
            "project_member",
            userId,
            actor.id,
            "project.member_role_changed",
            before,
            member,
            project.id,
          ),
        });
        return member;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async removeProjectMember(actor: Actor, projectId: string, userId: string) {
    const project = await this.requireProjectManager(actor, projectId);
    return this.prisma.$transaction(
      async (tx) => {
        const before = await tx.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId } },
        });
        if (!before) throw new NotFoundException();
        if (before.role === ProjectRole.owner) {
          const replacement = await tx.projectMember.findFirst({
            where: {
              projectId,
              role: ProjectRole.owner,
              userId: { not: userId },
            },
          });
          if (!replacement)
            throw new BadRequestException("Không thể gỡ chủ dự án cuối cùng");
          if (project.ownerId === userId) {
            await tx.project.update({
              where: { id: projectId },
              data: { ownerId: replacement.userId },
            });
          }
        }
        await tx.projectMember.delete({
          where: { projectId_userId: { projectId, userId } },
        });
        await tx.activityLog.create({
          data: audit(
            "project_member",
            userId,
            actor.id,
            "project.member_removed",
            before,
            undefined,
            project.id,
          ),
        });
        return { userId, removed: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listProjectMembers(actor: Actor, projectId: string) {
    await this.findProject(actor, projectId);
    return this.prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: { select: { id: true, name: true, email: true, status: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async listProjectLabels(actor: Actor, projectId: string) {
    const project = await this.findProject(actor, projectId);
    return this.prisma.label.findMany({
      where: {
        organizationId: actor.organizationId,
        OR: [{ projectId: null }, { projectId: project.id }],
      },
      orderBy: [{ projectId: "asc" }, { name: "asc" }],
    });
  }

  async createProjectLabel(
    actor: Actor,
    projectId: string,
    input: { name: string; color: string },
  ) {
    const project = await this.requireProjectManager(actor, projectId);
    const name = input.name.trim();
    const existing = await this.prisma.label.findFirst({
      where: {
        organizationId: actor.organizationId,
        projectId,
        name: { equals: name, mode: "insensitive" },
      },
    });
    if (existing) return existing;
    return this.prisma.label.create({
      data: {
        organizationId: actor.organizationId,
        projectId: project.id,
        name,
        color: input.color,
      },
    });
  }

  async createCompanyLabel(
    actor: Actor,
    input: { name: string; color: string },
  ) {
    this.requireSystemAdmin(actor);
    const name = input.name.trim();
    const existing = await this.prisma.label.findFirst({
      where: {
        organizationId: actor.organizationId,
        projectId: null,
        name: { equals: name, mode: "insensitive" },
      },
    });
    if (existing) return existing;
    return this.prisma.label.create({
      data: {
        organizationId: actor.organizationId,
        projectId: null,
        name,
        color: input.color,
      },
    });
  }

  async mergeProjectLabel(
    actor: Actor,
    projectId: string,
    sourceLabelId: string,
    targetLabelId: string,
  ) {
    const project = await this.requireProjectManager(actor, projectId);
    if (sourceLabelId === targetLabelId) {
      throw new BadRequestException("Không thể hợp nhất một nhãn với chính nó");
    }
    return this.prisma.$transaction(async (tx) => {
      const [source, target] = await Promise.all([
        tx.label.findFirst({
          where: {
            id: sourceLabelId,
            organizationId: actor.organizationId,
            projectId,
          },
        }),
        tx.label.findFirst({
          where: {
            id: targetLabelId,
            organizationId: actor.organizationId,
            OR: [{ projectId: null }, { projectId }],
          },
        }),
      ]);
      if (!source || !target || source.projectId !== project.id) {
        throw new NotFoundException();
      }
      const links = await tx.taskLabel.findMany({
        where: { labelId: source.id, task: { projectId } },
        select: { taskId: true },
      });
      if (links.length) {
        await tx.taskLabel.createMany({
          data: links.map(({ taskId }) => ({ taskId, labelId: target.id })),
          skipDuplicates: true,
        });
        await tx.taskLabel.deleteMany({
          where: { labelId: source.id, task: { projectId } },
        });
      }
      await tx.label.delete({ where: { id: source.id } });
      await tx.activityLog.create({
        data: audit(
          "label",
          target.id,
          actor.id,
          "label.merged",
          source,
          target,
          project.id,
        ),
      });
      return { merged: source.id, into: target.id, taskCount: links.length };
    });
  }

  async listAvailableProjectMembers(
    actor: Actor,
    projectId: string,
    search?: string,
  ) {
    const project = await this.requireProjectManager(actor, projectId);
    const normalizedSearch = search?.trim();
    return this.prisma.user.findMany({
      where: {
        organizationId: actor.organizationId,
        branchId: project.branchId,
        status: UserStatus.active,
        id: { not: actor.id },
        projectMemberships: { none: { projectId } },
        ...(normalizedSearch
          ? {
              OR: [
                { name: { contains: normalizedSearch, mode: "insensitive" } },
                { email: { contains: normalizedSearch, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 50,
    });
  }

  private async findProject(actor: Actor, id: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id,
        deletedAt: null,
        branch: { organizationId: actor.organizationId },
        OR: [
          { ownerId: actor.id },
          { members: { some: { userId: actor.id } } },
          ...(actor.systemRole === "branch_director" && actor.branchId
            ? [
                {
                  branchId: actor.branchId,
                  confidentiality: Confidentiality.normal,
                },
              ]
            : []),
        ],
      },
      include: {
        branch: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        members: { where: { userId: actor.id }, select: { role: true } },
      },
    });
    if (!project) throw new NotFoundException();
    return project;
  }

  private async requireProjectManager(actor: Actor, id: string) {
    const project = await this.findProject(actor, id);
    const role = project.members[0]?.role;
    const branchManager =
      actor.systemRole === "branch_director" &&
      actor.branchId === project.branchId &&
      project.confidentiality === Confidentiality.normal;
    if (!branchManager && !canInProject(role, "project.settings")) {
      throw new ForbiddenException();
    }
    return project;
  }

  private requireSystemAdmin(actor: Actor): void {
    if (actor.systemRole !== SystemRole.system_admin)
      throw new ForbiddenException();
  }

  private async requireBranch(organizationId: string, id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, organizationId, isActive: true },
    });
    if (!branch)
      throw new BadRequestException(
        "Chi nhánh không tồn tại hoặc đã ngừng hoạt động",
      );
    return branch;
  }

  private async requireDepartment(organizationId: string, id: string) {
    const department = await this.prisma.department.findFirst({
      where: { id, organizationId, isActive: true },
    });
    if (!department)
      throw new BadRequestException(
        "Phòng ban không tồn tại hoặc đã ngừng hoạt động",
      );
    return department;
  }
}
