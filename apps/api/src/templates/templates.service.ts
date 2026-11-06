import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  ProjectRole,
  SystemRole,
  AssignmentLevel,
  TaskType,
  TemplateOwnership,
  TemplateStatus,
} from "@prisma/client";
import { z } from "zod";
import {
  addWorkingDays,
  customFieldDefinitionsSchema,
  type WorkCalendar,
} from "@qlcv/shared";
import type { AuthenticatedUser } from "../auth/auth.service";
import { PrismaService } from "../infra/infra.module";
import { ApprovalsService } from "../approvals/approvals.service";
import { positionBetween } from "../tasks/fractional-position";

type Actor = AuthenticatedUser;

interface TemplateTask {
  title: string;
  type: "group" | "task" | "milestone";
  durationDays?: number;
  startOffsetWorkdays?: number;
  dueOffsetWorkdays?: number;
  role?: string;
  suggestedAssignmentLevel?: AssignmentLevel;
  checklist: string[];
  children: TemplateTask[];
}

const taskTypeSchema = z.enum(["group", "task", "milestone"]);
const templateTaskSchema: z.ZodType<TemplateTask> = z.lazy(() =>
  z
    .object({
      title: z.string().trim().min(1).max(500),
      type: taskTypeSchema.default("task"),
      durationDays: z.number().int().min(0).max(3650).optional(),
      startOffsetWorkdays: z.number().int().min(-3650).max(3650).optional(),
      dueOffsetWorkdays: z.number().int().min(-3650).max(3650).optional(),
      role: z.string().trim().min(1).max(80).optional(),
      suggestedAssignmentLevel: z.nativeEnum(AssignmentLevel).optional(),
      checklist: z
        .array(z.string().trim().min(1).max(500))
        .max(100)
        .default([]),
      children: z.array(templateTaskSchema).max(500).default([]),
    })
    .strict()
    .refine(
      (task) => task.children.length === 0 || task.type === "group",
      "Chỉ nhóm việc mới được có việc con",
    ),
);
const templateContentSchema = z
  .object({
    tasks: z.array(templateTaskSchema).max(500),
    customFieldDefinitions: customFieldDefinitionsSchema.optional(),
  })
  .strict();

export type TemplateInput = {
  name: string;
  description?: string;
  kind: "project" | "task";
  ownership: "personal" | "department" | "branch" | "company";
  departmentId?: string;
  branchId?: string;
  tags?: string[];
  content: unknown;
};

function parseContent(value: unknown) {
  const parsed = templateContentSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException({
      message: "Nội dung mẫu không hợp lệ",
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseCalendar(value: Prisma.JsonValue): WorkCalendar {
  const parsed = z
    .object({
      weeklyOff: z.array(z.number().int().min(0).max(6)),
      holidays: z.array(z.string().date()),
    })
    .safeParse(value);
  if (!parsed.success) {
    throw new Error("Stored project work calendar is invalid");
  }
  return parsed.data;
}

function shiftWorkingDays(
  date: string,
  offset: number,
  calendar: WorkCalendar,
): string {
  if (offset >= 0) return addWorkingDays(date, offset, calendar);
  const weeklyOff = new Set(calendar.weeklyOff);
  const holidays = new Set(calendar.holidays);
  const cursor = new Date(`${date}T00:00:00.000Z`);
  let remaining = -offset;
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const dateOnly = cursor.toISOString().slice(0, 10);
    if (!weeklyOff.has(cursor.getUTCDay()) && !holidays.has(dateOnly)) {
      remaining -= 1;
    }
  }
  return cursor.toISOString().slice(0, 10);
}

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalsService,
  ) {}

  async list(actor: Actor) {
    const visibleScopes: Prisma.TemplateWhereInput[] = [
      { ownership: "company" },
      ...(actor.branchId ? [{ branchId: actor.branchId }] : []),
      { departmentId: { in: actor.managedDepartmentIds } },
      ...(actor.systemRole === SystemRole.system_admin
        ? [
            {
              ownership: {
                in: [TemplateOwnership.branch, TemplateOwnership.department],
              },
            },
          ]
        : []),
    ];
    return this.prisma.template.findMany({
      where: {
        organizationId: actor.organizationId,
        OR: [
          {
            status: "published",
            OR: visibleScopes,
          },
          { createdById: actor.id },
          ...(actor.systemRole === SystemRole.system_admin
            ? [
                {
                  status: {
                    in: [TemplateStatus.draft, TemplateStatus.pending_approval],
                  },
                },
              ]
            : []),
        ],
      },
      include: {
        _count: { select: { usages: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
  }

  async get(actor: Actor, id: string) {
    const template = await this.prisma.template.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        OR: [
          { createdById: actor.id },
          ...(actor.systemRole === SystemRole.system_admin
            ? [{}]
            : [{ status: "published" as const }]),
        ],
      },
      include: {
        versions: { orderBy: { version: "desc" }, take: 20 },
        _count: { select: { usages: true } },
      },
    });
    if (!template || !this.canViewTemplate(actor, template)) {
      throw new NotFoundException();
    }
    return template;
  }

  async create(actor: Actor, input: TemplateInput) {
    const content = parseContent(input.content);
    const scope = await this.scopeData(actor, input);
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.template.create({
        data: {
          organizationId: actor.organizationId,
          createdById: actor.id,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          kind: input.kind,
          ownership: input.ownership,
          tags: input.tags ?? [],
          ...scope,
        },
      });
      await tx.templateVersion.create({
        data: {
          templateId: template.id,
          version: 1,
          createdById: actor.id,
          content: jsonInput(content),
        },
      });
      return tx.template.findUniqueOrThrow({
        where: { id: template.id },
        include: {
          versions: { orderBy: { version: "desc" }, take: 20 },
          _count: { select: { usages: true } },
        },
      });
    });
  }

  async update(
    actor: Actor,
    id: string,
    input: { name?: string; description?: string | null; content: unknown },
  ) {
    const before = await this.get(actor, id);
    if (
      before.createdById !== actor.id &&
      actor.systemRole !== "system_admin"
    ) {
      throw new ForbiddenException();
    }
    const content = parseContent(input.content);
    return this.prisma.$transaction(async (tx) => {
      const version = before.currentVersion + 1;
      const updated = await tx.template.updateMany({
        where: { id, currentVersion: before.currentVersion },
        data: {
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          ...(input.description === undefined
            ? {}
            : { description: input.description?.trim() || null }),
          currentVersion: version,
          status: "draft",
          updatedAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        throw new BadRequestException("Mẫu vừa được sửa bởi người khác");
      }
      await tx.templateVersion.create({
        data: {
          templateId: id,
          version,
          createdById: actor.id,
          content: jsonInput(content),
        },
      });
      return tx.template.findUniqueOrThrow({
        where: { id },
        include: { versions: { orderBy: { version: "desc" }, take: 20 } },
      });
    });
  }

  async requestPublication(
    actor: Actor,
    templateId: string,
    input: { projectId?: string; flowId?: string },
  ) {
    const template = await this.get(actor, templateId);
    if (template.createdById !== actor.id) throw new ForbiddenException();
    if (template.ownership === "personal") {
      return this.prisma.template.update({
        where: { id: template.id },
        data: { status: "published" },
      });
    }
    if (!input.projectId || !input.flowId) {
      throw new BadRequestException(
        "Mẫu cấp tổ chức cần dự án và luồng duyệt công bố",
      );
    }
    if (template.status !== "draft") {
      throw new BadRequestException("Chỉ mẫu nháp mới được gửi duyệt");
    }
    const request = await this.approvals.createTemplateRequest(
      actor,
      input.projectId,
      input.flowId,
      template.id,
    );
    return request;
  }

  async apply(
    actor: Actor,
    templateId: string,
    input: {
      projectId: string;
      startDate?: string;
      roleAssignments?: Record<string, string>;
    },
  ) {
    const template = await this.get(actor, templateId);
    if (template.status !== "published" && template.createdById !== actor.id) {
      throw new NotFoundException();
    }
    const project = await this.prisma.project.findFirst({
      where: {
        id: input.projectId,
        deletedAt: null,
        branch: { organizationId: actor.organizationId },
      },
      include: { members: { where: { userId: actor.id } } },
    });
    if (!project) throw new NotFoundException();
    const role = project.members[0]?.role;
    const branchManager =
      actor.systemRole === "branch_director" &&
      actor.branchId === project.branchId &&
      project.confidentiality === "normal";
    if (
      !branchManager &&
      role !== ProjectRole.owner &&
      role !== ProjectRole.manager
    ) {
      throw new ForbiddenException();
    }
    const content = parseContent(
      template.versions.find(
        (version) => version.version === template.currentVersion,
      )?.content,
    );
    const roleAssignments = input.roleAssignments ?? {};
    const userIds = [...new Set(Object.values(roleAssignments))];
    if (userIds.length) {
      const members = await this.prisma.projectMember.findMany({
        where: { projectId: project.id, userId: { in: userIds } },
        select: { userId: true },
      });
      if (members.length !== userIds.length) {
        throw new BadRequestException("Người được ánh xạ phải thuộc dự án");
      }
    }
    const startDate =
      input.startDate ?? project.startDate?.toISOString().slice(0, 10);
    const calendar = parseCalendar(project.workCalendar);
    let taskCount = 0;
    return this.prisma.$transaction(
      async (tx) => {
        const createNodes = async (
          nodes: TemplateTask[],
          parentId: string | null,
        ): Promise<void> => {
          let previousPosition: string | null;
          if (parentId) {
            const last = await tx.task.findFirst({
              where: { projectId: project.id, parentId, deletedAt: null },
              orderBy: { position: "desc" },
              select: { position: true },
            });
            previousPosition = last?.position ?? null;
          } else {
            const last = await tx.task.findFirst({
              where: { projectId: project.id, parentId: null, deletedAt: null },
              orderBy: { position: "desc" },
              select: { position: true },
            });
            previousPosition = last?.position ?? null;
          }
          for (const node of nodes) {
            const position = positionBetween(previousPosition, null);
            previousPosition = position;
            const assigneeId = node.role
              ? roleAssignments[node.role]
              : undefined;
            const created = await tx.task.create({
              data: {
                projectId: project.id,
                parentId,
                type: node.type as TaskType,
                position,
                title: node.title,
                durationDays: node.durationDays ?? null,
                assignmentLevel: node.suggestedAssignmentLevel ?? null,
                startDate:
                  startDate && node.startOffsetWorkdays !== undefined
                    ? new Date(
                        `${shiftWorkingDays(
                          startDate,
                          node.startOffsetWorkdays,
                          calendar,
                        )}T00:00:00.000Z`,
                      )
                    : null,
                dueDate:
                  startDate && node.dueOffsetWorkdays !== undefined
                    ? new Date(
                        `${shiftWorkingDays(
                          startDate,
                          node.dueOffsetWorkdays,
                          calendar,
                        )}T00:00:00.000Z`,
                      )
                    : null,
                assigneeId: assigneeId ?? null,
                creatorId: actor.id,
              },
            });
            taskCount += 1;
            if (node.checklist.length) {
              await tx.checklistItem.createMany({
                data: node.checklist.map((title, index) => ({
                  taskId: created.id,
                  title,
                  position: String(index).padStart(6, "0"),
                })),
              });
            }
            if (node.children.length) {
              await createNodes(node.children, created.id);
            }
          }
        };
        await createNodes(content.tasks, null);
        const version = template.versions.find(
          (entry) => entry.version === template.currentVersion,
        );
        if (!version) throw new NotFoundException();
        await tx.templateUsage.create({
          data: {
            templateId: template.id,
            templateVersionId: version.id,
            projectId: project.id,
            appliedById: actor.id,
          },
        });
        return { projectId: project.id, taskCount };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async scopeData(
    actor: Actor,
    input: TemplateInput,
  ): Promise<{
    ownerUserId: string | null;
    departmentId: string | null;
    branchId: string | null;
  }> {
    if (input.ownership === "personal") {
      return { ownerUserId: actor.id, departmentId: null, branchId: null };
    }
    if (input.ownership === "company") {
      if (actor.systemRole !== "system_admin") throw new ForbiddenException();
      return { ownerUserId: null, departmentId: null, branchId: null };
    }
    if (input.ownership === "branch") {
      if (
        !input.branchId ||
        (actor.systemRole !== "system_admin" &&
          actor.branchId !== input.branchId)
      ) {
        throw new ForbiddenException();
      }
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: input.branchId,
          organizationId: actor.organizationId,
          isActive: true,
        },
      });
      if (!branch) throw new BadRequestException("Chi nhánh không hợp lệ");
      return {
        ownerUserId: null,
        departmentId: null,
        branchId: input.branchId,
      };
    }
    if (
      !input.departmentId ||
      !actor.managedDepartmentIds.includes(input.departmentId)
    ) {
      throw new ForbiddenException();
    }
    const department = await this.prisma.department.findFirst({
      where: {
        id: input.departmentId,
        organizationId: actor.organizationId,
        isActive: true,
      },
    });
    if (!department) throw new BadRequestException("Phòng ban không hợp lệ");
    return {
      ownerUserId: null,
      departmentId: input.departmentId,
      branchId: null,
    };
  }

  private canViewTemplate(
    actor: Actor,
    template: {
      createdById: string;
      ownership: string;
      ownerUserId: string | null;
      branchId: string | null;
      departmentId: string | null;
      status: string;
    },
  ) {
    if (
      actor.systemRole === "system_admin" ||
      template.createdById === actor.id
    )
      return true;
    if (template.status !== "published") return false;
    if (template.ownership === "company") return true;
    if (template.ownership === "branch")
      return template.branchId === actor.branchId;
    if (template.ownership === "department") {
      return Boolean(
        template.departmentId &&
        actor.managedDepartmentIds.includes(template.departmentId),
      );
    }
    return template.ownerUserId === actor.id;
  }
}
