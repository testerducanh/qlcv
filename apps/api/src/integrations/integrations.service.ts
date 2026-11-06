import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma, ProjectRole } from "@prisma/client";
import type Redis from "ioredis";
import type { AuthenticatedUser } from "../auth/auth.service";
import { PrismaService, REDIS } from "../infra/infra.module";
import { TasksService } from "../tasks/tasks.service";

export const INTEGRATION_API_SCOPES = ["task:read", "task:write"] as const;
export type IntegrationApiScope = (typeof INTEGRATION_API_SCOPES)[number];

const API_KEY_PREFIX = "qlcv_live_";
const RATE_LIMIT_PER_MINUTE = 60;

const incrementRateLimit = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

type ApiKeyActor = AuthenticatedUser & { apiKeyId: string };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly tasks: TasksService,
  ) {}

  async createApiKey(
    actor: AuthenticatedUser,
    input: {
      projectId: string;
      name: string;
      scopes: string[];
      expiresAt: string;
    },
  ) {
    const project = await this.requireKeyManager(actor, input.projectId);
    const scopes = [...new Set(input.scopes)];
    if (
      !input.name.trim() ||
      input.name.length > 100 ||
      !scopes.length ||
      scopes.some(
        (scope) =>
          !INTEGRATION_API_SCOPES.includes(scope as IntegrationApiScope),
      )
    ) {
      throw new BadRequestException("Thông tin API key không hợp lệ");
    }

    const expiresAt = new Date(input.expiresAt);
    const now = new Date();
    if (
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt <= now ||
      expiresAt.getTime() > now.getTime() + 366 * 86400000
    ) {
      throw new BadRequestException(
        "API key phải có hạn dùng trong vòng một năm",
      );
    }

    const token = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
    const prefix = token.slice(0, 20);
    const apiKey = await this.prisma.integrationApiKey.create({
      data: {
        organizationId: actor.organizationId,
        projectId: project.id,
        createdById: actor.id,
        name: input.name.trim(),
        prefix,
        tokenHash: hashToken(token),
        scopes,
        expiresAt,
      },
      select: {
        id: true,
        projectId: true,
        name: true,
        prefix: true,
        scopes: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    await this.prisma.activityLog.create({
      data: {
        entityType: "integration_api_key",
        entityId: apiKey.id,
        projectId: project.id,
        actorId: actor.id,
        action: "integration.api_key_created",
        after: {
          name: apiKey.name,
          scopes,
          expiresAt: expiresAt.toISOString(),
        },
      },
    });
    return { ...apiKey, token };
  }

  async listApiKeys(actor: AuthenticatedUser, projectId: string) {
    await this.requireKeyManager(actor, projectId);
    return this.prisma.integrationApiKey.findMany({
      where: { organizationId: actor.organizationId, projectId },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async revokeApiKey(
    actor: AuthenticatedUser,
    projectId: string,
    apiKeyId: string,
  ) {
    await this.requireKeyManager(actor, projectId);
    const revokedAt = new Date();
    const result = await this.prisma.integrationApiKey.updateMany({
      where: {
        id: apiKeyId,
        organizationId: actor.organizationId,
        projectId,
        revokedAt: null,
      },
      data: { revokedAt },
    });
    if (!result.count) throw new NotFoundException();
    await this.prisma.activityLog.create({
      data: {
        entityType: "integration_api_key",
        entityId: apiKeyId,
        projectId,
        actorId: actor.id,
        action: "integration.api_key_revoked",
      },
    });
    return { revoked: true };
  }

  async getTaskWithApiKey(
    token: string | undefined,
    projectId: string,
    taskId: string,
  ) {
    const actor = await this.authenticateApiKey(token, projectId, "task:read");
    await this.recordUsage(actor, "integration.api.task_read");
    const result = await this.tasks.getTask(actor, projectId, taskId);
    return result;
  }

  async createTaskWithApiKey(
    token: string | undefined,
    projectId: string,
    input: {
      title: string;
      description?: string;
      assigneeId?: string;
      dueDate?: string;
      customFields?: Prisma.InputJsonValue;
    },
  ) {
    const actor = await this.authenticateApiKey(token, projectId, "task:write");
    await this.recordUsage(actor, "integration.api.task_created");
    const result = await this.tasks.createTask(actor, projectId, input);
    return result;
  }

  private async authenticateApiKey(
    token: string | undefined,
    projectId: string,
    requiredScope: IntegrationApiScope,
  ): Promise<ApiKeyActor> {
    if (!token?.startsWith(API_KEY_PREFIX)) throw new UnauthorizedException();
    const apiKey = await this.prisma.integrationApiKey.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        createdBy: {
          include: { departmentLinks: { where: { isHead: true } } },
        },
      },
    });
    const now = new Date();
    if (
      !apiKey ||
      apiKey.revokedAt ||
      apiKey.expiresAt <= now ||
      apiKey.projectId !== projectId ||
      apiKey.createdBy.status !== "active"
    ) {
      throw new UnauthorizedException();
    }
    if (!apiKey.scopes.includes(requiredScope))
      throw new ForbiddenException("API key thiếu phạm vi quyền cần thiết");

    const rateCount = Number(
      await this.redis.eval(
        incrementRateLimit,
        1,
        `integration:api-key:${apiKey.id}:${Math.floor(now.getTime() / 60000)}`,
        70,
      ),
    );
    if (rateCount > RATE_LIMIT_PER_MINUTE)
      throw new HttpException("API key vượt giới hạn tần suất", 429);

    const user = apiKey.createdBy;
    return {
      id: user.id,
      organizationId: apiKey.organizationId,
      systemRole: user.systemRole,
      branchId: user.branchId,
      managedDepartmentIds: user.departmentLinks.map(
        ({ departmentId }) => departmentId,
      ),
      email: user.email,
      name: user.name,
      apiKeyId: apiKey.id,
    };
  }

  private async recordUsage(actor: ApiKeyActor, action: string) {
    await this.prisma.$transaction([
      this.prisma.integrationApiKey.update({
        where: { id: actor.apiKeyId },
        data: { lastUsedAt: new Date() },
      }),
      this.prisma.activityLog.create({
        data: {
          entityType: "integration_api_key",
          entityId: actor.apiKeyId,
          actorId: actor.id,
          action,
        },
      }),
    ]);
  }

  private async requireKeyManager(actor: AuthenticatedUser, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        deletedAt: null,
        branch: { organizationId: actor.organizationId },
      },
      select: {
        id: true,
        ownerId: true,
        members: {
          where: { userId: actor.id },
          select: { role: true },
        },
      },
    });
    if (!project) throw new NotFoundException();
    const isManager =
      project.ownerId === actor.id ||
      project.members.some(
        ({ role }) =>
          role === ProjectRole.owner || role === ProjectRole.manager,
      ) ||
      ["system_admin", "executive"].includes(actor.systemRole);
    if (!isManager) throw new ForbiddenException();
    return project;
  }
}
