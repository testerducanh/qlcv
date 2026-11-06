import {
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
  BadRequestException,
} from "@nestjs/common";
import {
  AssignmentLevel,
  DependencyType,
  TaskPriority,
  TaskStatus,
  TaskType,
} from "@prisma/client";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { RequirePermission } from "../permissions/permissions.guard";
import { TaskResourceGuard } from "./task-resource.guard";
import { TasksService } from "./tasks.service";
import { ASSIGNMENT_ACTIONS } from "../assignments/assignment.machine";

const uuid = z.string().uuid();
const projectParams = z.object({ projectId: uuid });
const taskParams = projectParams.extend({ taskId: uuid });
const extensionParams = taskParams.extend({ requestId: uuid });
const checklistParams = taskParams.extend({ itemId: uuid });
const dependencyParams = taskParams.extend({ dependencyId: uuid });
const name = z.string().trim().min(1).max(500);
const date = z.string().date();

const createTask = z
  .object({
    title: name,
    parentId: uuid.nullable().optional(),
    type: z.nativeEnum(TaskType).optional(),
    description: z.string().max(20000).nullable().optional(),
    priority: z.nativeEnum(TaskPriority).optional(),
    startDate: date.nullable().optional(),
    durationDays: z.number().int().min(0).nullable().optional(),
    dueDate: date.nullable().optional(),
    assigneeId: uuid.nullable().optional(),
    assignmentLevel: z.nativeEnum(AssignmentLevel).optional(),
    reviewerId: uuid.nullable().optional(),
    progress: z.number().int().min(0).max(100).optional(),
    customFields: z
      .record(
        z.string().max(50),
        z.union([
          z.string().max(500),
          z.number().finite(),
          z.boolean(),
          z.null(),
        ]),
      )
      .optional(),
  })
  .refine(
    (task) =>
      !task.startDate || !task.dueDate || task.startDate <= task.dueDate,
    { path: ["dueDate"], message: "Ngày kết thúc phải từ ngày bắt đầu trở đi" },
  );

const updateTask = z
  .object({
    version: z.number().int().min(1),
    title: name.optional(),
    description: z.string().max(20000).nullable().optional(),
    type: z.nativeEnum(TaskType).optional(),
    status: z.nativeEnum(TaskStatus).optional(),
    blockedReason: z.string().trim().max(2000).nullable().optional(),
    priority: z.nativeEnum(TaskPriority).optional(),
    startDate: date.nullable().optional(),
    durationDays: z.number().int().min(0).nullable().optional(),
    dueDate: date.nullable().optional(),
    assigneeId: uuid.nullable().optional(),
    assignmentLevel: z.nativeEnum(AssignmentLevel).nullable().optional(),
    reviewerId: uuid.nullable().optional(),
    progress: z.number().int().min(0).max(100).optional(),
    customFields: z
      .record(
        z.string().max(50),
        z.union([
          z.string().max(500),
          z.number().finite(),
          z.boolean(),
          z.null(),
        ]),
      )
      .optional(),
  })
  .refine(
    (task) =>
      task.status !== TaskStatus.blocked || Boolean(task.blockedReason?.trim()),
    {
      path: ["blockedReason"],
      message: "Cần nhập lý do khi tạm dừng hoặc chặn việc",
    },
  )
  .refine((task) => Object.keys(task).some((key) => key !== "version"), {
    message: "Cần có ít nhất một trường cần cập nhật",
  });

const moveTask = z.object({
  version: z.number().int().min(1),
  parentId: uuid.nullable(),
  beforeTaskId: uuid.optional(),
});
const pasteTasks = z.object({
  text: z.string().min(1).max(100000),
  preview: z.boolean().default(false),
  parentId: uuid.optional(),
});
const createChecklistItem = z.object({
  title: name,
  assigneeId: uuid.nullable().optional(),
});
const updateChecklistItem = z
  .object({
    title: name.optional(),
    done: z.boolean().optional(),
    assigneeId: uuid.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
const moveChecklistItem = z.object({ beforeItemId: uuid.optional() });
const createDependency = z.object({
  predecessorId: uuid,
  type: z.nativeEnum(DependencyType).optional(),
  lagDays: z.number().int().min(-3650).max(3650).optional(),
  autoReschedule: z.boolean().default(false),
});
const updateDependency = z
  .object({
    type: z.nativeEnum(DependencyType).optional(),
    lagDays: z.number().int().min(-3650).max(3650).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
const bulkUpdate = z
  .object({
    taskIds: z
      .array(uuid)
      .min(1)
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length),
    assigneeId: uuid.nullable().optional(),
    dueDate: date.nullable().optional(),
    status: z.nativeEnum(TaskStatus).optional(),
    blockedReason: z.string().trim().max(2000).nullable().optional(),
    labelIds: z
      .array(uuid)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length)
      .optional(),
  })
  .refine(
    (value) =>
      value.assigneeId !== undefined ||
      value.dueDate !== undefined ||
      value.status !== undefined ||
      value.labelIds !== undefined,
    { message: "Cần chọn ít nhất một trường cần cập nhật" },
  )
  .refine(
    (value) =>
      value.status !== TaskStatus.blocked ||
      Boolean(value.blockedReason?.trim()),
    {
      path: ["blockedReason"],
      message: "Cần nhập lý do khi tạm dừng hoặc chặn việc",
    },
  )
  .refine(
    (value) =>
      value.status === TaskStatus.blocked || value.blockedReason === undefined,
    {
      path: ["blockedReason"],
      message: "Chỉ nhập lý do khi chuyển việc sang trạng thái bị chặn",
    },
  );
const undo = z.object({ undoToken: z.string().uuid() });
const schedulePreview = z
  .object({
    version: z.number().int().min(1),
    startDate: date.nullable().optional(),
    dueDate: date.nullable().optional(),
  })
  .refine(
    (input) => input.startDate !== undefined || input.dueDate !== undefined,
    { message: "Cần đổi ngày bắt đầu hoặc ngày kết thúc" },
  );
const importedTasksInput = z
  .object({
    tasks: z
      .array(
        z
          .object({
            title: name,
            depth: z.number().int().min(0).max(4),
            startDate: date.nullable().optional(),
            durationDays: z
              .number()
              .int()
              .min(0)
              .max(36500)
              .nullable()
              .optional(),
            dueDate: date.nullable().optional(),
            description: z.string().max(20000).nullable().optional(),
            checklist: z.array(name).max(100).default([]),
          })
          .refine(
            (task) =>
              !task.startDate ||
              !task.dueDate ||
              task.startDate <= task.dueDate,
            {
              path: ["dueDate"],
              message: "Ngày kết thúc phải từ ngày bắt đầu trở đi",
            },
          ),
      )
      .min(1)
      .max(1000),
  })
  .refine(
    ({ tasks }) =>
      tasks[0]?.depth === 0 &&
      tasks.every(
        (task, index) =>
          index === 0 || task.depth <= tasks[index - 1].depth + 1,
      ),
    {
      path: ["tasks"],
      message: "Cấp việc phải bắt đầu từ 0 và không được nhảy cấp",
    },
  );
const recurrenceInput = z.object({
  title: name,
  startDate: date,
  until: date.optional(),
  description: z.string().max(20000).nullable().optional(),
  count: z.number().int().min(1).max(52),
  parentId: uuid.nullable().optional(),
  checklist: z.array(name).max(100).default([]),
  rule: z
    .object({
      frequency: z.enum([
        "daily",
        "weekly",
        "monthly",
        "quarterly",
        "working_day",
      ]),
      interval: z.number().int().min(1).max(365).default(1),
      weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
      dayOfMonth: z.number().int().min(1).max(31).optional(),
    })
    .refine(
      (rule) =>
        !rule.weekdays || new Set(rule.weekdays).size === rule.weekdays.length,
      { path: ["weekdays"], message: "Không được lặp thứ trong tuần" },
    ),
});
const recurrenceFutureUpdate = z
  .object({
    title: name.optional(),
    description: z.string().max(20000).nullable().optional(),
    checklist: z.array(name).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Cần có ít nhất một trường cần cập nhật",
  });
const assignmentTransition = z.object({
  version: z.number().int().min(1),
  action: z.enum(ASSIGNMENT_ACTIONS),
  reason: z.string().trim().max(2000).optional(),
  evidenceNote: z.string().trim().max(5000).optional(),
});
const groupAssignment = z.object({
  version: z.number().int().min(1),
  dueDate: date,
  reviewerId: uuid.optional(),
});
const claimGroupAssignment = z.object({
  version: z.number().int().min(1),
});
const taskReassignment = z.object({
  version: z.number().int().min(1),
  assigneeId: uuid,
  handoffNote: z.string().trim().min(1).max(2000),
});
const confirmTaskReassignment = z.object({
  version: z.number().int().min(1),
});
const assignmentExtension = z.object({
  version: z.number().int().min(1),
  requestedDueDate: date,
  reason: z.string().trim().min(1).max(2000),
});
const assignmentExtensionDecision = z.object({
  version: z.number().int().min(1),
  approved: z.boolean(),
  reason: z.string().trim().max(2000).optional(),
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

@Controller("projects/:projectId/tasks")
@UseGuards(AuthGuard, TaskResourceGuard)
@ApiTags("tasks")
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @ApiOperation({ summary: "Liệt kê việc trong dự án" })
  list(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Query() query: Record<string, unknown>,
  ) {
    const { projectId } = parse(projectParams, params);
    const pagination = parse(
      z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(200).default(50),
          parentId: uuid.optional(),
          customFieldKey: z
            .string()
            .regex(/^[a-z][a-z0-9_]{0,49}$/)
            .optional(),
          customFieldValue: z.string().max(500).optional(),
        })
        .refine(
          ({ customFieldKey, customFieldValue }) =>
            (customFieldKey === undefined) === (customFieldValue === undefined),
          { message: "Cần truyền cả mã trường và giá trị lọc" },
        ),
      query,
    );
    return this.tasks.listTasks(actor(request), projectId, pagination);
  }

  @Post()
  @RequirePermission("task.write")
  @ApiOperation({ summary: "Tạo việc hoặc nhóm việc trong dự án" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["title"],
      properties: {
        title: { type: "string", maxLength: 500 },
        parentId: { type: "string", format: "uuid", nullable: true },
        type: { type: "string", enum: Object.values(TaskType) },
        description: { type: "string", nullable: true },
        priority: { type: "string", enum: Object.values(TaskPriority) },
        startDate: { type: "string", format: "date", nullable: true },
        durationDays: { type: "integer", minimum: 0, nullable: true },
        dueDate: { type: "string", format: "date", nullable: true },
        assigneeId: { type: "string", format: "uuid", nullable: true },
        assignmentLevel: {
          type: "string",
          enum: Object.values(AssignmentLevel),
        },
        reviewerId: { type: "string", format: "uuid", nullable: true },
        customFields: { type: "object", additionalProperties: true },
      },
    },
  })
  create(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId } = parse(projectParams, params);
    return this.tasks.createTask(
      actor(request),
      projectId,
      parse(createTask, body),
    );
  }

  @Post("paste")
  @RequirePermission("task.write")
  @ApiBody({
    schema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string", maxLength: 100000 },
        preview: { type: "boolean", default: false },
        parentId: { type: "string", format: "uuid" },
      },
    },
  })
  paste(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId } = parse(projectParams, params);
    const input = parse(pasteTasks, body);
    return this.tasks.pasteTasks(
      actor(request),
      projectId,
      input.text,
      input.preview,
      input.parentId,
    );
  }

  @Post("import")
  @RequirePermission("task.write")
  @ApiOperation({
    summary: "Nhập cây việc đã xem trước từ tệp được xử lý cục bộ",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["tasks"],
      properties: {
        tasks: {
          type: "array",
          minItems: 1,
          maxItems: 1000,
          items: {
            type: "object",
            required: ["title", "depth"],
            properties: {
              title: { type: "string", maxLength: 500 },
              depth: { type: "integer", minimum: 0, maximum: 4 },
              startDate: { type: "string", format: "date", nullable: true },
              durationDays: { type: "integer", minimum: 0, nullable: true },
              dueDate: { type: "string", format: "date", nullable: true },
              description: { type: "string", nullable: true },
              checklist: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
  })
  importTasks(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId } = parse(projectParams, params);
    return this.tasks.importTasks(
      actor(request),
      projectId,
      parse(importedTasksInput, body).tasks,
    );
  }

  @Post("import/undo")
  @RequirePermission("task.write")
  undoImport(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId } = parse(projectParams, params);
    return this.tasks.undoImportedTasks(
      actor(request),
      projectId,
      parse(undo, body).undoToken,
    );
  }

  @Post("recurring")
  @RequirePermission("task.write")
  @ApiOperation({ summary: "Tạo các kỳ việc lặp theo lịch dự án" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["title", "startDate", "count", "rule"],
      properties: {
        title: { type: "string", maxLength: 500 },
        startDate: { type: "string", format: "date" },
        until: { type: "string", format: "date" },
        count: { type: "integer", minimum: 1, maximum: 52 },
        parentId: { type: "string", format: "uuid", nullable: true },
        checklist: { type: "array", items: { type: "string" } },
        rule: {
          type: "object",
          required: ["frequency"],
          properties: {
            frequency: {
              type: "string",
              enum: ["daily", "weekly", "monthly", "quarterly", "working_day"],
            },
            interval: { type: "integer", minimum: 1, maximum: 365 },
            weekdays: {
              type: "array",
              items: { type: "integer", minimum: 0, maximum: 6 },
            },
            dayOfMonth: { type: "integer", minimum: 1, maximum: 31 },
          },
        },
      },
    },
  })
  createRecurring(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId } = parse(projectParams, params);
    return this.tasks.createRecurringTasks(
      actor(request),
      projectId,
      parse(recurrenceInput, body),
    );
  }

  @Patch(":taskId/recurrence/future")
  @RequirePermission("task.write")
  @ApiOperation({ summary: "Sửa kỳ hiện tại và các kỳ lặp về sau" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 500 },
        description: { type: "string", nullable: true },
        checklist: { type: "array", items: { type: "string" } },
      },
      minProperties: 1,
    },
  })
  updateRecurrenceFuture(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId, taskId } = parse(taskParams, params);
    return this.tasks.updateRecurrenceFuture(
      actor(request),
      projectId,
      taskId,
      parse(recurrenceFutureUpdate, body),
    );
  }

  @Get("critical-path")
  @RequirePermission("task.view")
  @ApiOperation({
    summary: "Tính đường găng và độ dự trữ theo lịch ngày làm việc dự án",
  })
  criticalPath(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { projectId } = parse(projectParams, params);
    return this.tasks.criticalPath(actor(request), projectId);
  }

  @Post("schedule/preview/:taskId")
  @RequirePermission("task.write")
  @ApiOperation({
    summary: "Xem trước các việc bị ảnh hưởng khi tự dời lịch",
  })
  previewAutoReschedule(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId, taskId } = parse(taskParams, params);
    return this.tasks.previewAutoReschedule(
      actor(request),
      projectId,
      taskId,
      parse(schedulePreview, body),
    );
  }

  @Post("schedule/apply")
  @RequirePermission("task.write")
  applyAutoReschedule(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId } = parse(projectParams, params);
    return this.tasks.applyAutoReschedule(
      actor(request),
      projectId,
      parse(undo, body).undoToken,
    );
  }

  @Post("schedule/undo")
  @RequirePermission("task.write")
  undoAutoReschedule(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId } = parse(projectParams, params);
    return this.tasks.undoAutoReschedule(
      actor(request),
      projectId,
      parse(undo, body).undoToken,
    );
  }

  @Post("bulk")
  @RequirePermission("task.write")
  @ApiBody({
    schema: {
      type: "object",
      required: ["taskIds"],
      properties: {
        taskIds: {
          type: "array",
          maxItems: 500,
          items: { type: "string", format: "uuid" },
        },
        assigneeId: { type: "string", format: "uuid", nullable: true },
        dueDate: { type: "string", format: "date", nullable: true },
        status: { type: "string", enum: Object.values(TaskStatus) },
        blockedReason: { type: "string" },
        labelIds: { type: "array", items: { type: "string", format: "uuid" } },
      },
    },
  })
  bulkUpdate(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId } = parse(projectParams, params);
    return this.tasks.bulkUpdateTasks(
      actor(request),
      projectId,
      parse(bulkUpdate, body),
    );
  }

  @Post("bulk/undo")
  @RequirePermission("task.write")
  @ApiOperation({
    summary: "Hoàn tác cập nhật hàng loạt trong thời hạn cho phép",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["undoToken"],
      properties: { undoToken: { type: "string", format: "uuid" } },
    },
  })
  undoBulkUpdate(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const { undoToken } = parse(undo, body);
    return this.tasks.undoBulkUpdate(actor(request), undoToken);
  }

  @Get(":taskId")
  @RequirePermission("task.view")
  get(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { projectId, taskId } = parse(taskParams, params);
    return this.tasks.getTask(actor(request), projectId, taskId);
  }

  @Patch(":taskId")
  @RequirePermission("task.write")
  @ApiBody({
    schema: {
      type: "object",
      required: ["version"],
      properties: {
        version: { type: "integer", minimum: 1 },
        title: { type: "string" },
        description: { type: "string", nullable: true },
        type: { type: "string", enum: Object.values(TaskType) },
        status: { type: "string", enum: Object.values(TaskStatus) },
        blockedReason: { type: "string", nullable: true },
        priority: { type: "string", enum: Object.values(TaskPriority) },
        startDate: { type: "string", format: "date", nullable: true },
        durationDays: { type: "integer", minimum: 0, nullable: true },
        dueDate: { type: "string", format: "date", nullable: true },
        assigneeId: { type: "string", format: "uuid", nullable: true },
        assignmentLevel: {
          type: "string",
          enum: Object.values(AssignmentLevel),
          nullable: true,
        },
        reviewerId: { type: "string", format: "uuid", nullable: true },
        progress: { type: "integer", minimum: 0, maximum: 100 },
        customFields: { type: "object", additionalProperties: true },
      },
    },
  })
  update(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId, taskId } = parse(taskParams, params);
    return this.tasks.updateTask(
      actor(request),
      projectId,
      taskId,
      parse(updateTask, body),
    );
  }

  @Post(":taskId/assignment-transition")
  @ApiOperation({ summary: "Chuyển trạng thái giao việc theo mức dự án" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["version", "action"],
      properties: {
        version: { type: "integer", minimum: 1 },
        action: { type: "string", enum: [...ASSIGNMENT_ACTIONS] },
        reason: { type: "string", maxLength: 2000 },
        evidenceNote: { type: "string", maxLength: 5000 },
      },
    },
  })
  transitionAssignment(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId, taskId } = parse(taskParams, params);
    return this.tasks.transitionAssignment(
      actor(request),
      projectId,
      taskId,
      parse(assignmentTransition, body),
    );
  }

  @Post(":taskId/group-assignment")
  @ApiOperation({ summary: "Giao việc vào hàng đợi nhóm" })
  groupAssign(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId, taskId } = parse(taskParams, params);
    return this.tasks.assignTaskToGroup(
      actor(request),
      projectId,
      taskId,
      parse(groupAssignment, body),
    );
  }

  @Post(":taskId/claim")
  @ApiOperation({ summary: "Nhận việc từ hàng đợi nhóm về mình" })
  claimGroupAssignment(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId, taskId } = parse(taskParams, params);
    return this.tasks.claimGroupAssignment(
      actor(request),
      projectId,
      taskId,
      parse(claimGroupAssignment, body),
    );
  }

  @Post(":taskId/reassignment")
  @ApiOperation({ summary: "Đề nghị chuyển người nhận việc" })
  requestTaskReassignment(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId, taskId } = parse(taskParams, params);
    return this.tasks.requestTaskReassignment(
      actor(request),
      projectId,
      taskId,
      parse(taskReassignment, body),
    );
  }

  @Post(":taskId/reassignment/accept")
  @ApiOperation({ summary: "Người nhận mới xác nhận nhận việc" })
  acceptTaskReassignment(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId, taskId } = parse(taskParams, params);
    return this.tasks.acceptTaskReassignment(
      actor(request),
      projectId,
      taskId,
      parse(confirmTaskReassignment, body),
    );
  }

  @Post(":taskId/extensions")
  @ApiOperation({ summary: "Xin gia hạn việc được giao" })
  requestAssignmentExtension(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId, taskId } = parse(taskParams, params);
    return this.tasks.requestAssignmentExtension(
      actor(request),
      projectId,
      taskId,
      parse(assignmentExtension, body),
    );
  }

  @Post(":taskId/extensions/:requestId/decision")
  @ApiOperation({ summary: "Người giao duyệt hoặc từ chối yêu cầu gia hạn" })
  decideAssignmentExtension(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId, taskId, requestId } = parse(extensionParams, params);
    return this.tasks.decideAssignmentExtension(
      actor(request),
      projectId,
      taskId,
      requestId,
      parse(assignmentExtensionDecision, body),
    );
  }

  @Delete(":taskId")
  @RequirePermission("task.write")
  delete(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { projectId, taskId } = parse(taskParams, params);
    return this.tasks.deleteTask(actor(request), projectId, taskId);
  }

  @Post(":taskId/move")
  @RequirePermission("task.write")
  @ApiBody({
    schema: {
      type: "object",
      required: ["version", "parentId"],
      properties: {
        version: { type: "integer", minimum: 1 },
        parentId: { type: "string", format: "uuid", nullable: true },
        beforeTaskId: { type: "string", format: "uuid" },
      },
    },
  })
  move(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId, taskId } = parse(taskParams, params);
    return this.tasks.moveTask(
      actor(request),
      projectId,
      taskId,
      parse(moveTask, body),
    );
  }

  @Post(":taskId/clone")
  @RequirePermission("task.write")
  @ApiBody({
    schema: {
      type: "object",
      properties: { includeFiles: { type: "boolean", default: false } },
    },
  })
  clone(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId, taskId } = parse(taskParams, params);
    const options = parse(
      z.object({ includeFiles: z.boolean().default(false) }),
      body ?? {},
    );
    return this.tasks.cloneTask(actor(request), projectId, taskId, options);
  }

  @Get(":taskId/checklist")
  @RequirePermission("task.view")
  checklist(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { projectId, taskId } = parse(taskParams, params);
    return this.tasks.listChecklist(actor(request), projectId, taskId);
  }

  @Post(":taskId/checklist")
  @RequirePermission("task.write")
  @ApiBody({
    schema: {
      type: "object",
      required: ["title"],
      properties: {
        title: { type: "string", maxLength: 500 },
        assigneeId: { type: "string", format: "uuid", nullable: true },
      },
    },
  })
  addChecklistItem(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId, taskId } = parse(taskParams, params);
    return this.tasks.createChecklistItem(
      actor(request),
      projectId,
      taskId,
      parse(createChecklistItem, body),
    );
  }

  @Patch(":taskId/checklist/:itemId")
  @RequirePermission("task.write")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 500 },
        done: { type: "boolean" },
        assigneeId: { type: "string", format: "uuid", nullable: true },
      },
    },
  })
  updateChecklistItem(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId, taskId, itemId } = parse(checklistParams, params);
    return this.tasks.updateChecklistItem(
      actor(request),
      projectId,
      taskId,
      itemId,
      parse(updateChecklistItem, body),
    );
  }

  @Post(":taskId/checklist/:itemId/move")
  @RequirePermission("task.write")
  @ApiBody({
    schema: {
      type: "object",
      properties: { beforeItemId: { type: "string", format: "uuid" } },
    },
  })
  moveChecklistItem(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId, taskId, itemId } = parse(checklistParams, params);
    const input = parse(moveChecklistItem, body);
    return this.tasks.moveChecklistItem(
      actor(request),
      projectId,
      taskId,
      itemId,
      input.beforeItemId,
    );
  }

  @Delete(":taskId/checklist/:itemId")
  @RequirePermission("task.write")
  deleteChecklistItem(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
  ) {
    const { projectId, taskId, itemId } = parse(checklistParams, params);
    return this.tasks.deleteChecklistItem(
      actor(request),
      projectId,
      taskId,
      itemId,
    );
  }

  @Post(":taskId/checklist/:itemId/convert-to-task")
  @RequirePermission("task.write")
  convertChecklistItem(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
  ) {
    const { projectId, taskId, itemId } = parse(checklistParams, params);
    return this.tasks.convertChecklistItemToTask(
      actor(request),
      projectId,
      taskId,
      itemId,
    );
  }

  @Post(":taskId/children/:childTaskId/convert-to-checklist")
  @RequirePermission("task.write")
  convertTask(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { projectId, taskId, childTaskId } = parse(
      taskParams.extend({ childTaskId: uuid }),
      params,
    );
    return this.tasks.convertTaskToChecklistItem(
      actor(request),
      projectId,
      taskId,
      childTaskId,
    );
  }

  @Get(":taskId/dependencies")
  @RequirePermission("task.view")
  dependencies(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { projectId, taskId } = parse(taskParams, params);
    return this.tasks.listDependencies(actor(request), projectId, taskId);
  }

  @Post(":taskId/dependencies")
  @RequirePermission("task.write")
  @ApiBody({
    schema: {
      type: "object",
      required: ["predecessorId"],
      properties: {
        predecessorId: { type: "string", format: "uuid" },
        type: { type: "string", enum: Object.values(DependencyType) },
        lagDays: { type: "integer", minimum: -3650, maximum: 3650 },
        autoReschedule: { type: "boolean", default: false },
      },
    },
  })
  addDependency(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId, taskId } = parse(taskParams, params);
    return this.tasks.createDependency(
      actor(request),
      projectId,
      taskId,
      parse(createDependency, body),
    );
  }

  @Patch(":taskId/dependencies/:dependencyId")
  @RequirePermission("task.write")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: Object.values(DependencyType) },
        lagDays: { type: "integer", minimum: -3650, maximum: 3650 },
      },
    },
  })
  updateDependency(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { projectId, taskId, dependencyId } = parse(dependencyParams, params);
    return this.tasks.updateDependency(
      actor(request),
      projectId,
      taskId,
      dependencyId,
      parse(updateDependency, body),
    );
  }

  @Delete(":taskId/dependencies/:dependencyId")
  @RequirePermission("task.write")
  deleteDependency(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
  ) {
    const { projectId, taskId, dependencyId } = parse(dependencyParams, params);
    return this.tasks.deleteDependency(
      actor(request),
      projectId,
      taskId,
      dependencyId,
    );
  }
}
