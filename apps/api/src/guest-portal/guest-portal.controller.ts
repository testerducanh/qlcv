import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { GuestPortalService } from "./guest-portal.service";

const uuid = z.string().uuid();

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

function sendFile(
  response: Response,
  file: { buffer: Buffer; fileName: string; mime: string },
) {
  response.setHeader("Content-Type", file.mime);
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
  );
  response.send(file.buffer);
}

@Controller()
@ApiTags("guest-portal")
export class GuestPortalController {
  constructor(private readonly guests: GuestPortalService) {}

  @Post("projects/:projectId/guest-access")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  createInvite(
    @Req() request: AuthenticatedRequest,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z.object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email().max(320),
        expiresInDays: z.number().int().min(1).max(90),
        taskIds: z.array(uuid).min(1).max(50),
        attachmentIds: z.array(uuid).max(100).default([]),
        approvalFlowId: uuid.optional(),
      }),
      body,
    );
    return this.guests.createInvite(
      actor(request),
      parse(uuid, projectId),
      input,
    );
  }

  @Get("projects/:projectId/guest-access")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  listInvites(
    @Req() request: AuthenticatedRequest,
    @Param("projectId") projectId: string,
  ) {
    return this.guests.listInvites(actor(request), parse(uuid, projectId));
  }

  @Post("projects/:projectId/guest-access/:guestAccessId/revoke")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  revokeInvite(
    @Req() request: AuthenticatedRequest,
    @Param("projectId") projectId: string,
    @Param("guestAccessId") guestAccessId: string,
  ) {
    return this.guests.revokeInvite(
      actor(request),
      parse(uuid, projectId),
      parse(uuid, guestAccessId),
    );
  }

  @Post("projects/:projectId/guest-access/:guestAccessId/approval")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  requestApproval(
    @Req() request: AuthenticatedRequest,
    @Param("projectId") projectId: string,
    @Param("guestAccessId") guestAccessId: string,
    @Body() body: unknown,
  ) {
    const { flowId } = parse(z.object({ flowId: uuid }), body);
    return this.guests.requestInviteApproval(
      actor(request),
      parse(uuid, projectId),
      parse(uuid, guestAccessId),
      flowId,
    );
  }

  @Get("guest/me")
  me(@Headers("x-guest-token") token?: string) {
    return this.guests.me(token);
  }

  @Get("guest/tasks")
  tasks(@Headers("x-guest-token") token?: string) {
    return this.guests.listTasks(token);
  }

  @Get("guest/tasks/:taskId")
  task(
    @Headers("x-guest-token") token: string | undefined,
    @Param("taskId") taskId: string,
  ) {
    return this.guests.getTask(token, parse(uuid, taskId));
  }

  @Get("guest/tasks/:taskId/submissions")
  submissions(
    @Headers("x-guest-token") token: string | undefined,
    @Param("taskId") taskId: string,
  ) {
    return this.guests.listSubmissions(token, parse(uuid, taskId));
  }

  @Post("guest/tasks/:taskId/submissions")
  submit(
    @Headers("x-guest-token") token: string | undefined,
    @Param("taskId") taskId: string,
    @Body() body: unknown,
  ) {
    const { body: text } = parse(
      z.object({ body: z.string().trim().min(1).max(20000) }),
      body,
    );
    return this.guests.submit(token, parse(uuid, taskId), text);
  }

  @Post("guest/submissions/:submissionId/files/upload-url")
  createUpload(
    @Headers("x-guest-token") token: string | undefined,
    @Param("submissionId") submissionId: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z.object({
        fileName: z.string().trim().min(1).max(255),
        mime: z.string().trim().min(1).max(127),
        size: z.number().int().positive(),
      }),
      body,
    );
    return this.guests.createSubmissionUpload(
      token,
      parse(uuid, submissionId),
      input,
    );
  }

  @Post("guest/submissions/:submissionId/files/:fileId/confirm")
  confirmUpload(
    @Headers("x-guest-token") token: string | undefined,
    @Param("submissionId") submissionId: string,
    @Param("fileId") fileId: string,
  ) {
    return this.guests.confirmSubmissionUpload(
      token,
      parse(uuid, submissionId),
      parse(uuid, fileId),
    );
  }

  @Get("guest/shared-files/:attachmentId/download")
  async downloadSharedFile(
    @Headers("x-guest-token") token: string | undefined,
    @Param("attachmentId") attachmentId: string,
    @Res() response: Response,
  ) {
    sendFile(
      response,
      await this.guests.downloadSharedFile(token, parse(uuid, attachmentId)),
    );
  }

  @Get("guest/submission-files/:fileId/download")
  async downloadSubmissionFile(
    @Headers("x-guest-token") token: string | undefined,
    @Param("fileId") fileId: string,
    @Res() response: Response,
  ) {
    sendFile(
      response,
      await this.guests.downloadSubmissionFile(token, parse(uuid, fileId)),
    );
  }
}
