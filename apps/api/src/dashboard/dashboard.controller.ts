import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { DashboardService } from "./dashboard.service";

const querySchema = z
  .object({
    from: z.string().date(),
    to: z.string().date(),
    branchId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
  })
  .refine((value) => value.from <= value.to, {
    path: ["to"],
    message: "Ngày kết thúc phải từ ngày bắt đầu trở đi",
  })
  .refine(
    (value) =>
      (Date.parse(`${value.to}T00:00:00Z`) -
        Date.parse(`${value.from}T00:00:00Z`)) /
        86_400_000 <
      366,
    {
      path: ["to"],
      message: "Khoảng thời gian không được vượt quá 366 ngày",
    },
  );

function actor(request: AuthenticatedRequest) {
  if (!request.user) throw new UnauthorizedException();
  return request.user;
}

@Controller("dashboard")
@UseGuards(AuthGuard)
@ApiTags("dashboard")
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiQuery({ name: "from", required: true, type: String, format: "date" })
  @ApiQuery({ name: "to", required: true, type: String, format: "date" })
  @ApiQuery({ name: "branchId", required: false, type: String, format: "uuid" })
  @ApiQuery({
    name: "departmentId",
    required: false,
    type: String,
    format: "uuid",
  })
  get(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    const parsed = querySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Bộ lọc dashboard không hợp lệ",
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    return this.dashboard.getDashboard(actor(request), {
      from: new Date(`${parsed.data.from}T00:00:00.000Z`),
      to: new Date(`${parsed.data.to}T23:59:59.999Z`),
      ...(parsed.data.branchId ? { branchId: parsed.data.branchId } : {}),
      ...(parsed.data.departmentId
        ? { departmentId: parsed.data.departmentId }
        : {}),
    });
  }
}
