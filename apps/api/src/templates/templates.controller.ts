import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { TemplatesService, type TemplateInput } from "./templates.service";

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

const templateCreate = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  kind: z.enum(["project", "task"]),
  ownership: z.enum(["personal", "department", "branch", "company"]),
  departmentId: uuid.optional(),
  branchId: uuid.optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  content: z.unknown(),
});
const templateUpdate = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  content: z.unknown(),
});
const publicationRequest = z.object({
  projectId: uuid.optional(),
  flowId: uuid.optional(),
});
const templateApply = z.object({
  projectId: uuid,
  startDate: z.string().date().optional(),
  roleAssignments: z.record(z.string().trim().min(1).max(80), uuid).optional(),
});
const idParams = z.object({ id: uuid });

@Controller("templates")
@UseGuards(AuthGuard)
@ApiTags("templates")
@ApiBearerAuth()
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @ApiOperation({ summary: "Liệt kê thư viện mẫu trong phạm vi được phép" })
  list(@Req() request: AuthenticatedRequest) {
    return this.templates.list(actor(request));
  }

  @Post()
  @ApiOperation({ summary: "Tạo mẫu nháp phiên bản đầu tiên" })
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.templates.create(
      actor(request),
      parse(templateCreate, body) as TemplateInput,
    );
  }

  @Get(":id")
  get(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    return this.templates.get(actor(request), parse(idParams, params).id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Tạo phiên bản mới của mẫu" })
  update(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    return this.templates.update(
      actor(request),
      parse(idParams, params).id,
      parse(templateUpdate, body),
    );
  }

  @Post(":id/request-publication")
  @ApiOperation({ summary: "Gửi mẫu cấp tổ chức qua duyệt P2.4" })
  requestPublication(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    return this.templates.requestPublication(
      actor(request),
      parse(idParams, params).id,
      parse(publicationRequest, body),
    );
  }

  @Post(":id/apply")
  @ApiOperation({ summary: "Nạp bản mẫu đã công bố vào dự án" })
  apply(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    return this.templates.apply(
      actor(request),
      parse(idParams, params).id,
      parse(templateApply, body),
    );
  }
}
