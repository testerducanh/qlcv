import {
  Body,
  BadRequestException,
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
import { ApiBearerAuth, ApiBody, ApiTags } from "@nestjs/swagger";
import { TaskPriority, TaskStatus, ViewMode } from "@prisma/client";
import { z } from "zod";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { MyWorkService } from "./my-work.service";

const uuid = z.string().uuid();
const enumList = <T extends z.ZodType>(item: T) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.split(",") : value),
    z.array(item).max(100).optional(),
  );
const booleanQuery = z.preprocess(
  (value) => (value === "true" ? true : value === "false" ? false : value),
  z.boolean().optional(),
);

const filters = z
  .object({
    assigneeId: uuid.optional(),
    dueFrom: z.string().date().optional(),
    dueTo: z.string().date().optional(),
    statuses: enumList(z.nativeEnum(TaskStatus)),
    labelIds: enumList(uuid),
    projectId: uuid.optional(),
    priorities: enumList(z.nativeEnum(TaskPriority)),
    hasAttachment: booleanQuery,
  })
  .refine(
    (value) => !value.dueFrom || !value.dueTo || value.dueFrom <= value.dueTo,
    { path: ["dueTo"], message: "Ngày kết thúc phải từ ngày bắt đầu trở đi" },
  );

const taskQuery = z
  .object({
    tab: z
      .enum(["today", "overdue", "upcoming", "all", "following", "assigned"])
      .default("all"),
    days: z.coerce.number().int().min(1).max(365).default(7),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
  })
  .and(filters);

const searchQuery = z.object({
  q: z.string().trim().min(1).max(100),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const savedViewInput = z.object({
  name: z.string().trim().min(1).max(120),
  filter: filters.default({}),
  viewMode: z.nativeEnum(ViewMode).default(ViewMode.list),
  projectId: uuid.optional(),
  isShared: z.boolean().default(false),
});
const savedViewPatch = savedViewInput
  .partial()
  .omit({ projectId: true })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Cần có ít nhất một trường cần cập nhật",
  });
const idParams = z.object({ id: uuid });

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

@Controller("me")
@UseGuards(AuthGuard)
@ApiTags("my-work")
@ApiBearerAuth()
export class MyWorkController {
  constructor(private readonly myWork: MyWorkService) {}

  @Get("tasks")
  tasks(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.myWork.listTasks(actor(request), parse(taskQuery, query));
  }

  @Get("tasks/search")
  search(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    const input = parse(searchQuery, query);
    return this.myWork.search(
      actor(request),
      input.q,
      input.page,
      input.pageSize,
    );
  }

  @Get("saved-views")
  savedViews(@Req() request: AuthenticatedRequest) {
    return this.myWork.listSavedViews(actor(request));
  }

  @Post("saved-views")
  @ApiBody({
    schema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", maxLength: 120 },
        filter: { type: "object" },
        viewMode: { type: "string", enum: Object.values(ViewMode) },
        projectId: { type: "string", format: "uuid" },
        isShared: { type: "boolean", default: false },
      },
    },
  })
  createSavedView(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parse(savedViewInput, body);
    return this.myWork.createSavedView(actor(request), {
      ...input,
      filter: JSON.parse(JSON.stringify(input.filter)),
    });
  }

  @Patch("saved-views/:id")
  updateSavedView(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id } = parse(idParams, params);
    const input = parse(savedViewPatch, body);
    return this.myWork.updateSavedView(actor(request), id, {
      ...input,
      ...(input.filter
        ? { filter: JSON.parse(JSON.stringify(input.filter)) }
        : {}),
    });
  }

  @Delete("saved-views/:id")
  deleteSavedView(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
  ) {
    const { id } = parse(idParams, params);
    return this.myWork.deleteSavedView(actor(request), id);
  }
}
