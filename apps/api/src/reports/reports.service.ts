import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ProjectRole, type Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.service";
import { PrismaService } from "../infra/infra.module";
import { canInProject } from "../permissions/permissions";

type Actor = AuthenticatedUser;

function dateOnly(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function jsonSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async exportProjectData(
    actor: Actor,
    projectId: string,
    format: "csv" | "xlsx" | "json" | "pdf",
  ) {
    const project = await this.requireExportAccess(actor, projectId);
    if (project.confidentiality === "restricted") {
      const approval = await this.prisma.approvalRequest.findFirst({
        where: {
          projectId,
          subjectType: "project",
          subjectId: projectId,
          status: "approved",
          flow: { requestType: "confidential_export" },
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      if (!approval) {
        await this.prisma.activityLog.create({
          data: {
            entityType: "project",
            entityId: projectId,
            projectId,
            actorId: actor.id,
            action: "project.export_blocked",
            before: { reason: "confidential_approval_required", format },
          },
        });
        throw new ForbiddenException(
          "Xuất dự án mật cần có phiếu xuất dữ liệu đã được duyệt",
        );
      }
    }

    const [tasks, labels] = await Promise.all([
      this.prisma.task.findMany({
        where: { projectId, deletedAt: null },
        orderBy: [{ depth: "asc" }, { position: "asc" }],
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          labels: {
            include: {
              label: { select: { id: true, name: true, color: true } },
            },
          },
          checklistItems: { orderBy: { position: "asc" } },
          predecessorLinks: {
            include: { predecessor: { select: { id: true, title: true } } },
          },
          successorLinks: {
            include: { successor: { select: { id: true, title: true } } },
          },
        },
      }),
      this.prisma.label.findMany({
        where: { projectId },
        select: { id: true, name: true, color: true },
        orderBy: { name: "asc" },
      }),
    ]);

    await this.prisma.activityLog.create({
      data: {
        entityType: "project",
        entityId: projectId,
        projectId,
        actorId: actor.id,
        action: "project.data_exported",
        after: { taskCount: tasks.length, format },
      },
    });

    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        startDate: dateOnly(project.startDate),
        dueDate: dateOnly(project.dueDate),
        confidentiality: project.confidentiality,
        branch: project.branch.name,
        progressMode: project.progressMode,
      },
      labels,
      tasks: tasks.map((task) => ({
        id: task.id,
        parentId: task.parentId,
        depth: task.depth,
        type: task.type,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        startDate: dateOnly(task.startDate),
        durationDays: task.durationDays,
        dueDate: dateOnly(task.dueDate),
        progress: task.progress,
        assignee: task.assignee,
        customFields: task.customFields,
        labels: task.labels.map(({ label }) => label),
        checklist: task.checklistItems.map((item) => ({
          title: item.title,
          done: item.done,
        })),
        predecessors: task.predecessorLinks.map((link) => ({
          title: link.predecessor.title,
          type: link.type,
          lagDays: link.lagDays,
        })),
        successors: task.successorLinks.map((link) => ({
          title: link.successor.title,
          type: link.type,
          lagDays: link.lagDays,
        })),
      })),
      exportedAt: new Date().toISOString(),
    };
  }

  async createBaseline(actor: Actor, projectId: string, name: string) {
    const project = await this.requireProjectSettingAccess(actor, projectId);
    if (!project.baselineEnabled) {
      throw new ForbiddenException("Baseline chưa được bật cho dự án");
    }
    const tasks = await this.prisma.task.findMany({
      where: { projectId, deletedAt: null },
      orderBy: [{ depth: "asc" }, { position: "asc" }],
      select: {
        id: true,
        parentId: true,
        title: true,
        type: true,
        startDate: true,
        dueDate: true,
        durationDays: true,
        progress: true,
      },
    });
    const baseline = await this.prisma.$transaction(async (tx) => {
      const created = await tx.projectBaseline.create({
        data: {
          projectId,
          createdById: actor.id,
          name,
          snapshot: jsonSnapshot({
            projectStartDate: dateOnly(project.startDate),
            projectDueDate: dateOnly(project.dueDate),
            tasks: tasks.map((task) => ({
              ...task,
              startDate: dateOnly(task.startDate),
              dueDate: dateOnly(task.dueDate),
            })),
          }),
        },
      });
      await tx.activityLog.create({
        data: {
          entityType: "project_baseline",
          entityId: created.id,
          projectId,
          actorId: actor.id,
          action: "project.baseline_created",
          after: { name, taskCount: tasks.length },
        },
      });
      return created;
    });
    return {
      id: baseline.id,
      name: baseline.name,
      createdAt: baseline.createdAt,
      taskCount: tasks.length,
    };
  }

  async listBaselines(actor: Actor, projectId: string) {
    await this.requireProjectViewAccess(actor, projectId);
    const [baselines, tasks] = await Promise.all([
      this.prisma.projectBaseline.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.task.findMany({
        where: { projectId, deletedAt: null },
        select: {
          id: true,
          title: true,
          startDate: true,
          dueDate: true,
          progress: true,
        },
      }),
    ]);
    const currentById = new Map(tasks.map((task) => [task.id, task]));
    return baselines.map((baseline) => {
      const snapshot = baseline.snapshot as {
        tasks?: Array<{
          id: string;
          title: string;
          startDate: string | null;
          dueDate: string | null;
          progress: number;
        }>;
      };
      const items = snapshot.tasks ?? [];
      const changes = items.flatMap((item) => {
        const current = currentById.get(item.id);
        if (!current) {
          return [{ taskId: item.id, title: item.title, removed: true }];
        }
        const currentStart = dateOnly(current.startDate);
        const currentDue = dateOnly(current.dueDate);
        if (
          currentStart === item.startDate &&
          currentDue === item.dueDate &&
          current.progress === item.progress
        ) {
          return [];
        }
        return [
          {
            taskId: item.id,
            title: current.title,
            removed: false,
            baselineStartDate: item.startDate,
            currentStartDate: currentStart,
            baselineDueDate: item.dueDate,
            currentDueDate: currentDue,
            baselineProgress: item.progress,
            currentProgress: current.progress,
          },
        ];
      });
      return {
        id: baseline.id,
        name: baseline.name,
        createdAt: baseline.createdAt,
        taskCount: items.length,
        changedCount: changes.length,
        changes,
      };
    });
  }

  private async requireProject(
    actor: Actor,
    projectId: string,
    action: "project.view" | "project.settings" | "data.export",
  ) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        branch: { organizationId: actor.organizationId },
        deletedAt: null,
      },
      include: { branch: { select: { name: true } } },
    });
    if (!project) throw new NotFoundException();
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: actor.id } },
      select: { role: true },
    });
    const role =
      project.ownerId === actor.id ? ProjectRole.owner : (member?.role ?? null);
    const permitted = canInProject(role, action, {
      membersMayExport: project.membersMayExport,
    });
    if (!permitted) throw new ForbiddenException();
    return project;
  }

  private requireProjectViewAccess(actor: Actor, projectId: string) {
    return this.requireProject(actor, projectId, "project.view");
  }

  private requireProjectSettingAccess(actor: Actor, projectId: string) {
    return this.requireProject(actor, projectId, "project.settings");
  }

  private requireExportAccess(actor: Actor, projectId: string) {
    return this.requireProject(actor, projectId, "data.export");
  }
}
