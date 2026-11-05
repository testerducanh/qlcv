import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { P16Service } from "./p16.service";

const uuid = z.string().uuid();
const projectParams = z.object({ projectId: uuid });
const taskParams = projectParams.extend({ taskId: uuid });

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException({
      message: "Dữ liệu không hợp lệ",
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

function actor(request: AuthenticatedRequest) {
  if (!request.user) throw new UnauthorizedException();
  return request.user;
}

@Controller()
@UseGuards(AuthGuard)
@ApiTags("comments-notifications-activity-trash")
@ApiBearerAuth()
export class P16Controller {
  constructor(private readonly p16: P16Service) {}

  @Get("projects/:projectId/tasks/:taskId/comments")
  @ApiOperation({ summary: "Liệt kê nhận xét của việc" })
  comments(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { projectId, taskId } = parse(taskParams, params);
    return this.p16.listComments(actor(request), projectId, taskId);
  }

  @Post("projects/:projectId/tasks/:taskId/comments")
  @ApiOperation({ summary: "Tạo nhận xét và nhắc thành viên" })
  createComment(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const input = parse(
      z.object({
        body: z.string().trim().min(1).max(20000),
        parentId: uuid.optional(),
        isQuestion: z.boolean().default(false),
        mentionIds: z.array(uuid).max(100).default([]),
        attachmentIds: z.array(uuid).max(20).default([]),
      }),
      body,
    );
    const { projectId, taskId } = parse(taskParams, params);
    return this.p16.createComment(actor(request), projectId, taskId, input);
  }

  @Patch("projects/:projectId/tasks/:taskId/comments/:commentId")
  editComment(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId, taskId, commentId } = parse(
      taskParams.extend({ commentId: uuid }),
      params,
    );
    const input = parse(
      z.object({
        body: z.string().trim().min(1).max(20000),
        isQuestion: z.boolean().optional(),
      }),
      body,
    );
    return this.p16.editComment(
      actor(request),
      projectId,
      taskId,
      commentId,
      input,
    );
  }

  @Post("projects/:projectId/tasks/:taskId/comments/:commentId/hide")
  hideComment(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { projectId, taskId, commentId } = parse(
      taskParams.extend({ commentId: uuid }),
      params,
    );
    return this.p16.hideComment(actor(request), projectId, taskId, commentId);
  }

  @Get("notifications")
  @ApiOperation({ summary: "Liệt kê thông báo của người dùng hiện tại" })
  notifications(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    const input = parse(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50),
        unreadOnly: z.coerce.boolean().default(false),
      }),
      query,
    );
    return this.p16.listNotifications(actor(request), input);
  }

  @Post("notifications/:notificationId/read")
  readNotification(
    @Req() request: AuthenticatedRequest,
    @Param("notificationId") notificationId: string,
  ) {
    return this.p16.readNotification(
      actor(request),
      parse(uuid, notificationId),
    );
  }

  @Post("notifications/read-all")
  readAllNotifications(@Req() request: AuthenticatedRequest) {
    return this.p16.readAllNotifications(actor(request));
  }

  @Get("projects/:projectId/tasks/:taskId/activity")
  taskActivity(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Query() query: Record<string, unknown>,
  ) {
    const { projectId, taskId } = parse(taskParams, params);
    return this.p16.taskActivity(
      actor(request),
      projectId,
      taskId,
      this.page(query),
    );
  }

  @Get("projects/:projectId/activity")
  projectActivity(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Query() query: Record<string, unknown>,
  ) {
    const { projectId } = parse(projectParams, params);
    return this.p16.projectActivity(
      actor(request),
      projectId,
      this.page(query),
    );
  }

  @Get("projects/:projectId/trash")
  @ApiOperation({ summary: "Liệt kê nội dung trong thùng rác dự án" })
  trash(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Query() query: Record<string, unknown>,
  ) {
    const { projectId } = parse(projectParams, params);
    const page = this.page(query);
    return this.p16.listTrash(actor(request), projectId, page);
  }

  @Get("trash/projects")
  projectTrash(@Req() request: AuthenticatedRequest) {
    return this.p16.listDeletedProjects(actor(request));
  }

  @Post("trash/projects/:projectId/restore")
  restoreProject(
    @Req() request: AuthenticatedRequest,
    @Param("projectId") projectId: string,
  ) {
    return this.p16.restoreProject(actor(request), parse(uuid, projectId));
  }

  @Delete("trash/projects/:projectId")
  permanentlyDeleteProject(
    @Req() request: AuthenticatedRequest,
    @Param("projectId") projectId: string,
  ) {
    return this.p16.permanentlyDeleteProject(
      actor(request),
      parse(uuid, projectId),
    );
  }

  @Delete("projects/:projectId")
  softDeleteProject(
    @Req() request: AuthenticatedRequest,
    @Param("projectId") projectId: string,
  ) {
    return this.p16.softDeleteProject(actor(request), parse(uuid, projectId));
  }

  @Post("projects/:projectId/trash/:entityType/:entityId/restore")
  restore(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const input = parse(
      projectParams.extend({
        entityType: z.enum(["task", "attachment"]),
        entityId: uuid,
      }),
      params,
    );
    return this.p16.restoreTrash(
      actor(request),
      input.projectId,
      input.entityType,
      input.entityId,
    );
  }

  @Delete("projects/:projectId/trash/:entityType/:entityId")
  permanentlyDelete(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
  ) {
    const input = parse(
      projectParams.extend({
        entityType: z.enum(["task", "attachment"]),
        entityId: uuid,
      }),
      params,
    );
    return this.p16.permanentlyDelete(
      actor(request),
      input.projectId,
      input.entityType,
      input.entityId,
    );
  }

  private page(query: Record<string, unknown>) {
    return parse(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
      }),
      query,
    );
  }
}
