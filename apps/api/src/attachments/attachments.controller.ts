import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { AttachmentsService } from "./attachments.service";

const uuid = z.string().uuid();
const projectParams = z.object({ projectId: uuid });
const attachmentParams = projectParams.extend({ attachmentId: uuid });
const uploadInput = z
  .object({
    taskId: uuid.optional(),
    checklistItemId: uuid.optional(),
    commentId: uuid.optional(),
    fileName: z.string().trim().min(1).max(255),
    mime: z.string().trim().min(1).max(127),
    size: z
      .number()
      .int()
      .positive()
      .max(250 * 1024 * 1024),
    note: z.string().trim().max(2000).optional(),
    takenAt: z.string().datetime({ offset: true }).optional(),
    lat: z.number().finite().min(-90).max(90).optional(),
    lng: z.number().finite().min(-180).max(180).optional(),
    versionGroupId: uuid.optional(),
  })
  .refine(
    (input) =>
      [input.taskId, input.checklistItemId, input.commentId].filter(Boolean)
        .length === 1,
    {
      message: "Cần chọn đúng một vị trí gắn tệp",
      path: ["taskId"],
    },
  );
const libraryQuery = z
  .object({
    taskId: uuid.optional(),
    uploaderId: uuid.optional(),
    mime: z.string().trim().min(1).max(127).optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    path: ["to"],
    message: "Ngày kết thúc phải từ ngày bắt đầu trở đi",
  });
const trashQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
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

@Controller("projects/:projectId/attachments")
@UseGuards(AuthGuard)
@ApiTags("attachments")
@ApiBearerAuth()
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post("upload-url")
  @ApiOperation({ summary: "Tạo URL tải tệp lên có thời hạn" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["fileName", "mime", "size"],
      properties: {
        taskId: { type: "string", format: "uuid" },
        checklistItemId: { type: "string", format: "uuid" },
        commentId: { type: "string", format: "uuid" },
        fileName: { type: "string", maxLength: 255 },
        mime: { type: "string" },
        size: { type: "integer", minimum: 1 },
        note: { type: "string", maxLength: 2000 },
        takenAt: { type: "string", format: "date-time" },
        lat: { type: "number", minimum: -90, maximum: 90 },
        lng: { type: "number", minimum: -180, maximum: 180 },
        versionGroupId: { type: "string", format: "uuid" },
      },
    },
  })
  createUpload(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId } = parse(projectParams, params);
    return this.attachments.createUpload(
      actor(request),
      projectId,
      parse(uploadInput, body),
    );
  }

  @Post(":attachmentId/confirm")
  @ApiOperation({ summary: "Xác minh nội dung tệp vừa tải lên" })
  confirmUpload(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
  ) {
    const { projectId, attachmentId } = parse(attachmentParams, params);
    return this.attachments.confirmUpload(
      actor(request),
      projectId,
      attachmentId,
    );
  }

  @Get()
  library(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Query() query: unknown,
  ) {
    const { projectId } = parse(projectParams, params);
    return this.attachments.listLibrary(
      actor(request),
      projectId,
      parse(libraryQuery, query),
    );
  }

  @Get("trash")
  trash(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Query() query: unknown,
  ) {
    const { projectId } = parse(projectParams, params);
    const input = parse(trashQuery, query);
    return this.attachments.listTrash(
      actor(request),
      projectId,
      input.page,
      input.pageSize,
    );
  }

  @Get(":attachmentId/history")
  history(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { projectId, attachmentId } = parse(attachmentParams, params);
    return this.attachments.history(actor(request), projectId, attachmentId);
  }

  @Get(":attachmentId/download")
  @ApiOperation({ summary: "Tạo URL tải tệp xuống có kiểm tra quyền" })
  download(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Query("variant") variant?: string,
  ) {
    const { projectId, attachmentId } = parse(attachmentParams, params);
    const normalized = variant ?? "original";
    if (!["original", "preview", "thumbnail"].includes(normalized))
      throw new BadRequestException("Biến thể tải tệp không hợp lệ");
    return this.attachments.download(
      actor(request),
      projectId,
      attachmentId,
      normalized as "original" | "preview" | "thumbnail",
    );
  }

  @Delete(":attachmentId")
  softDelete(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { projectId, attachmentId } = parse(attachmentParams, params);
    return this.attachments.softDelete(actor(request), projectId, attachmentId);
  }

  @Post(":attachmentId/restore")
  restore(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { projectId, attachmentId } = parse(attachmentParams, params);
    return this.attachments.restore(actor(request), projectId, attachmentId);
  }
}
