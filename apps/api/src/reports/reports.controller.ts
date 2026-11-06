import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { ReportsService } from "./reports.service";

const routeParams = z.object({ projectId: z.string().uuid() });

function actor(request: AuthenticatedRequest) {
  if (!request.user) throw new UnauthorizedException();
  return request.user;
}

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

@Controller("projects/:projectId/reports")
@UseGuards(AuthGuard)
@ApiTags("reports")
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("export-data")
  @ApiOperation({
    summary: "Xuất dữ liệu dự án đã được phân quyền và ghi nhật ký",
  })
  exportData(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Query("format") formatInput: unknown,
  ) {
    const format = parse(
      z.enum(["csv", "xlsx", "json", "pdf"]).default("json"),
      formatInput,
    );
    return this.reports.exportProjectData(
      actor(request),
      parse(routeParams, params).projectId,
      format,
    );
  }

  @Get("baselines")
  listBaselines(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
  ) {
    return this.reports.listBaselines(
      actor(request),
      parse(routeParams, params).projectId,
    );
  }

  @Post("baselines")
  createBaseline(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    return this.reports.createBaseline(
      actor(request),
      parse(routeParams, params).projectId,
      parse(z.object({ name: z.string().trim().min(1).max(120) }), body).name,
    );
  }
}
