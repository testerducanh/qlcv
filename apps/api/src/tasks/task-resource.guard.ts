import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Confidentiality, type ProjectRole } from "@prisma/client";
import type { Request } from "express";
import type { AuthenticatedUser } from "../auth/auth.service";
import { PrismaService } from "../infra/infra.module";
import type { PermissionResource } from "../permissions/permissions";

type RequestWithActor = Request & {
  user?: AuthenticatedUser;
  permissionResource?: PermissionResource;
};

const taskInclude = {
  project: {
    include: {
      branch: { select: { organizationId: true, id: true } },
      members: { select: { userId: true, role: true } },
    },
  },
  creator: { select: { departmentId: true } },
  assignee: { select: { departmentId: true } },
};

@Injectable()
export class TaskResourceGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithActor>();
    const user = request.user;
    if (!user) throw new NotFoundException();

    const params = request.params as Record<string, string | undefined>;
    const projectId = params.projectId;
    const taskId = params.taskId;
    const body = request.body as Record<string, unknown> | undefined;
    const query = request.query as Record<string, unknown>;
    const parentId =
      typeof body?.destinationParentId === "string"
        ? body.destinationParentId
        : typeof body?.parentId === "string"
          ? body.parentId
          : typeof query.parentId === "string"
            ? query.parentId
            : null;

    const targetId = taskId ?? parentId;
    if (targetId) {
      const task = await this.prisma.task.findFirst({
        where: {
          id: targetId,
          deletedAt: null,
          project: {
            deletedAt: null,
            branch: { organizationId: user.organizationId },
          },
          ...(projectId ? { projectId } : {}),
        },
        include: taskInclude,
      });
      if (!task) throw new NotFoundException();
      request.permissionResource = this.fromTask(task, user.id);
      return true;
    }

    if (!projectId) throw new NotFoundException();
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        deletedAt: null,
        branch: { organizationId: user.organizationId },
      },
      include: {
        branch: { select: { organizationId: true, id: true } },
        members: { select: { userId: true, role: true } },
      },
    });
    if (!project) throw new NotFoundException();
    const projectRole =
      project.members.find((member) => member.userId === user.id)?.role ?? null;
    request.permissionResource = {
      type: "task",
      organizationId: project.branch.organizationId,
      projectId: project.id,
      branchId: project.branchId,
      confidentiality: project.confidentiality,
      projectRole,
      creatorId: user.id,
    };
    return true;
  }

  private fromTask(
    task: {
      id: string;
      projectId: string;
      creatorId: string;
      assigneeId: string | null;
      creator: { departmentId: string | null };
      assignee: { departmentId: string | null } | null;
      project: {
        id: string;
        branchId: string;
        confidentiality: Confidentiality;
        branch: { organizationId: string };
        members: Array<{ userId: string; role: ProjectRole }>;
      };
    },
    userId: string,
  ): PermissionResource {
    return {
      type: "task",
      organizationId: task.project.branch.organizationId,
      projectId: task.projectId,
      branchId: task.project.branchId,
      confidentiality: task.project.confidentiality,
      projectRole:
        task.project.members.find((member) => member.userId === userId)?.role ??
        null,
      creatorId: task.creatorId,
      assigneeId: task.assigneeId,
      departmentIds: [
        task.creator.departmentId,
        task.assignee?.departmentId,
      ].filter((id): id is string => id !== null && id !== undefined),
    };
  }
}
