import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  BadRequestException,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { IntegrationsService } from "./integrations.service";

const uuid = z.string().uuid();
const apiKeyParams = z.object({ projectId: uuid, apiKeyId: uuid });
const projectParams = z.object({ projectId: uuid });
const taskParams = z.object({ projectId: uuid, taskId: uuid });
const createApiKeyBody = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(["task:read", "task:write"])).min(1),
  expiresAt: z.string().datetime({ offset: true }),
});
const createTaskBody = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(10000).optional(),
  assigneeId: uuid.optional(),
  dueDate: z.string().date().optional(),
  customFields: z.record(z.string(), z.json()).optional(),
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({
      message: "Dữ liệu không hợp lệ",
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

function actor(request: AuthenticatedRequest) {
  if (!request.user) throw new UnauthorizedException();
  return request.user;
}

@ApiTags("integrations")
@Controller()
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Post("integrations/projects/:projectId/api-keys")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  createApiKey(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId } = parse(projectParams, params);
    return this.integrations.createApiKey(actor(request), {
      projectId,
      ...parse(createApiKeyBody, body),
    });
  }

  @Get("integrations/projects/:projectId/api-keys")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  listApiKeys(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { projectId } = parse(projectParams, params);
    return this.integrations.listApiKeys(actor(request), projectId);
  }

  @Delete("integrations/projects/:projectId/api-keys/:apiKeyId")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  revokeApiKey(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { projectId, apiKeyId } = parse(apiKeyParams, params);
    return this.integrations.revokeApiKey(actor(request), projectId, apiKeyId);
  }

  @Get("api/v1/projects/:projectId/tasks/:taskId")
  @ApiHeader({ name: "X-API-Key", required: true })
  getTask(@Param() params: unknown, @Req() request: AuthenticatedRequest) {
    const { projectId, taskId } = parse(taskParams, params);
    return this.integrations.getTaskWithApiKey(
      typeof request.headers["x-api-key"] === "string"
        ? request.headers["x-api-key"]
        : undefined,
      projectId,
      taskId,
    );
  }

  @Post("api/v1/projects/:projectId/tasks")
  @ApiHeader({ name: "X-API-Key", required: true })
  createTask(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const { projectId } = parse(projectParams, params);
    const input = parse(createTaskBody, body);
    return this.integrations.createTaskWithApiKey(
      typeof request.headers["x-api-key"] === "string"
        ? request.headers["x-api-key"]
        : undefined,
      projectId,
      input,
    );
  }
}
