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
  UseGuards,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  AssignmentEvidenceRequirement,
  AssignmentLevel,
  Confidentiality,
  ProjectRole,
  ProjectStatus,
  ProgressMode,
  SystemRole,
  UserStatus,
} from "@prisma/client";
import { projectCreateSchema, projectUpdateSchema } from "@qlcv/shared";
import { z } from "zod";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { ManagementService } from "./management.service";
import { SystemAdminGuard } from "./system-admin.guard";

const uuid = z.string().uuid();
const email = z.string().email().max(254);
const name = z.string().trim().min(1).max(200);
const idParams = z.object({ id: uuid });

const branchCreate = z.object({
  name,
  code: z.string().trim().max(32).optional(),
});
const branchUpdate = z.object({
  name: name.optional(),
  code: z.string().trim().max(32).nullable().optional(),
  isActive: z.boolean().optional(),
});
const departmentCreate = z.object({
  name,
  branchId: uuid.nullable().optional(),
});
const departmentUpdate = z.object({
  name: name.optional(),
  branchId: uuid.nullable().optional(),
  isActive: z.boolean().optional(),
});
const inviteUser = z.object({
  email,
  name,
  systemRole: z.nativeEnum(SystemRole).optional(),
  branchId: uuid.nullable().optional(),
  departmentId: uuid.nullable().optional(),
});
const userRole = z.object({ systemRole: z.nativeEnum(SystemRole) });
const userUpdate = z.object({
  name: name.optional(),
  branchId: uuid.nullable().optional(),
  departmentId: uuid.nullable().optional(),
});
const acceptInvitation = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(12).max(128),
});

const addMember = z.object({
  userId: uuid,
  role: z.nativeEnum(ProjectRole).default(ProjectRole.member),
});
const updateMember = z.object({ role: z.nativeEnum(ProjectRole) });
const cloneProject = z.object({
  name: name.optional(),
  includeMembers: z.boolean().default(false),
  includeFiles: z.boolean().default(false),
});
const labelCreate = z.object({
  name: z.string().trim().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
const labelMerge = z.object({ targetLabelId: uuid });
const availableMemberQuery = z.object({
  search: z.string().trim().max(200).optional(),
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

function pagination(query: Record<string, unknown>) {
  const schema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(20),
    search: z.string().trim().max(200).optional(),
  });
  return parse(schema, query);
}

function actor(request: AuthenticatedRequest) {
  if (!request.user) throw new UnauthorizedException();
  return request.user;
}

@Controller("branches")
@UseGuards(AuthGuard, SystemAdminGuard)
@ApiTags("branches")
@ApiBearerAuth()
export class BranchesController {
  constructor(private readonly management: ManagementService) {}

  @Get()
  @ApiOperation({ summary: "Liệt kê chi nhánh trong phạm vi quản trị" })
  list(@Req() request: AuthenticatedRequest) {
    return this.management.listBranches(actor(request));
  }

  @Post()
  @ApiOperation({ summary: "Tạo chi nhánh" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", maxLength: 200 },
        code: { type: "string", maxLength: 32 },
      },
    },
  })
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.management.createBranch(
      actor(request),
      parse(branchCreate, body),
    );
  }

  @Patch(":id")
  update(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id } = parse(idParams, params);
    return this.management.updateBranch(
      actor(request),
      id,
      parse(branchUpdate, body),
    );
  }

  @Delete(":id")
  deactivate(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { id } = parse(idParams, params);
    return this.management.updateBranch(actor(request), id, {
      isActive: false,
    });
  }
}

@Controller("branches")
@UseGuards(AuthGuard)
@ApiTags("branches")
@ApiBearerAuth()
export class AvailableBranchesController {
  constructor(private readonly management: ManagementService) {}

  @Get("available")
  @ApiOperation({ summary: "Liệt kê chi nhánh trong phạm vi tạo dự án" })
  list(@Req() request: AuthenticatedRequest) {
    return this.management.listAvailableBranches(actor(request));
  }
}

@Controller("departments")
@UseGuards(AuthGuard, SystemAdminGuard)
@ApiTags("departments")
@ApiBearerAuth()
export class DepartmentsController {
  constructor(private readonly management: ManagementService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.management.listDepartments(actor(request));
  }

  @Post()
  @ApiBody({
    schema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", maxLength: 200 },
        branchId: { type: "string", format: "uuid", nullable: true },
      },
    },
  })
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.management.createDepartment(
      actor(request),
      parse(departmentCreate, body),
    );
  }

  @Patch(":id")
  update(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id } = parse(idParams, params);
    return this.management.updateDepartment(
      actor(request),
      id,
      parse(departmentUpdate, body),
    );
  }

  @Delete(":id")
  deactivate(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { id } = parse(idParams, params);
    return this.management.updateDepartment(actor(request), id, {
      isActive: false,
    });
  }
}

@Controller("users")
@UseGuards(AuthGuard, SystemAdminGuard)
@ApiTags("users")
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly management: ManagementService) {}

  @Get()
  @ApiOperation({ summary: "Liệt kê người dùng trong tổ chức" })
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    const page = pagination(query);
    const status = query.status
      ? parse(z.nativeEnum(UserStatus), query.status)
      : undefined;
    return this.management.listUsers(actor(request), { ...page, status });
  }

  @Post("invite")
  @ApiBody({
    schema: {
      type: "object",
      required: ["email", "name"],
      properties: {
        email: { type: "string", format: "email" },
        name: { type: "string", maxLength: 200 },
        systemRole: { type: "string", enum: Object.values(SystemRole) },
        branchId: { type: "string", format: "uuid", nullable: true },
        departmentId: { type: "string", format: "uuid", nullable: true },
      },
    },
  })
  invite(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.management.inviteUser(actor(request), parse(inviteUser, body));
  }

  @Patch(":id/role")
  changeRole(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id } = parse(idParams, params);
    const { systemRole } = parse(userRole, body);
    return this.management.changeUserRole(actor(request), id, systemRole);
  }

  @Patch(":id")
  update(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id } = parse(idParams, params);
    return this.management.updateUser(
      actor(request),
      id,
      parse(userUpdate, body),
    );
  }

  @Delete(":id")
  disable(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { id } = parse(idParams, params);
    return this.management.disableUser(actor(request), id);
  }
}

@Controller("invitations")
@ApiTags("invitations")
export class InvitationsController {
  constructor(private readonly management: ManagementService) {}

  @Post("accept")
  @ApiBody({
    schema: {
      type: "object",
      required: ["token", "password"],
      properties: {
        token: { type: "string" },
        password: { type: "string", minLength: 12, maxLength: 128 },
      },
    },
  })
  accept(@Body() body: unknown) {
    const input = parse(acceptInvitation, body);
    return this.management.completeInvitation(input.token, input.password);
  }
}

@Controller("projects")
@UseGuards(AuthGuard)
@ApiTags("projects")
@ApiBearerAuth()
export class ProjectsController {
  constructor(private readonly management: ManagementService) {}

  @Get()
  @ApiQuery({ name: "page", required: false, type: Number, minimum: 1 })
  @ApiQuery({
    name: "pageSize",
    required: false,
    type: Number,
    minimum: 1,
    maximum: 200,
  })
  @ApiQuery({ name: "branchId", required: false, type: String, format: "uuid" })
  @ApiQuery({
    name: "status",
    required: false,
    enum: Object.values(ProjectStatus),
  })
  @ApiQuery({ name: "search", required: false, type: String, maxLength: 200 })
  @ApiQuery({ name: "mine", required: false, enum: ["true", "false"] })
  @ApiQuery({
    name: "sort",
    required: false,
    enum: ["name", "createdAt", "dueDate"],
  })
  @ApiQuery({ name: "order", required: false, enum: ["asc", "desc"] })
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    const page = pagination(query);
    const schema = z.object({
      branchId: uuid.optional(),
      status: z.nativeEnum(ProjectStatus).optional(),
      search: z.string().trim().min(1).max(200).optional(),
      mine: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional(),
      sort: z.enum(["name", "createdAt", "dueDate"]).default("createdAt"),
      order: z.enum(["asc", "desc"]).default("desc"),
    });
    const filters = parse(schema, query);
    return this.management.listProjects(actor(request), {
      ...page,
      ...filters,
    });
  }

  @Post()
  @ApiOperation({ summary: "Tạo dự án mới" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["branchId", "name"],
      properties: {
        branchId: { type: "string", format: "uuid" },
        name: { type: "string", maxLength: 200 },
        description: { type: "string", maxLength: 10000 },
        startDate: { type: "string", format: "date" },
        dueDate: { type: "string", format: "date" },
        progressMode: { type: "string", enum: Object.values(ProgressMode) },
        confidentiality: {
          type: "string",
          enum: Object.values(Confidentiality),
        },
        assignmentLevel: {
          type: "string",
          enum: Object.values(AssignmentLevel),
        },
        strictEvidenceRequirement: {
          type: "string",
          enum: Object.values(AssignmentEvidenceRequirement),
        },
        workCalendar: {
          type: "object",
          properties: {
            weeklyOff: {
              type: "array",
              items: { type: "integer", minimum: 0, maximum: 6 },
            },
            holidays: {
              type: "array",
              items: { type: "string", format: "date" },
            },
          },
        },
        statusLabels: {
          type: "object",
          additionalProperties: { type: "string" },
        },
      },
    },
  })
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.management.createProject(
      actor(request),
      parse(projectCreateSchema, body),
    );
  }

  @Get(":id")
  get(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { id } = parse(idParams, params);
    return this.management.getProject(actor(request), id);
  }

  @Get(":id/available-members")
  @ApiOperation({ summary: "Liệt kê thành viên có thể thêm vào dự án" })
  @ApiQuery({ name: "search", required: false, type: String, maxLength: 200 })
  availableMembers(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Query() query: unknown,
  ) {
    const { id } = parse(idParams, params);
    const { search } = parse(availableMemberQuery, query);
    return this.management.listAvailableProjectMembers(
      actor(request),
      id,
      search,
    );
  }

  @Patch(":id")
  update(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id } = parse(idParams, params);
    return this.management.updateProject(
      actor(request),
      id,
      parse(projectUpdateSchema, body),
    );
  }

  @Post(":id/archive")
  archive(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { id } = parse(idParams, params);
    return this.management.archiveProject(actor(request), id);
  }

  @Post(":id/clone")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        name: { type: "string", maxLength: 200 },
        includeMembers: { type: "boolean", default: false },
        includeFiles: { type: "boolean", default: false },
      },
    },
  })
  clone(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id } = parse(idParams, params);
    return this.management.cloneProject(
      actor(request),
      id,
      parse(cloneProject, body),
    );
  }

  @Delete(":id")
  delete(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { id } = parse(idParams, params);
    return this.management.deleteProject(actor(request), id);
  }

  @Post(":id/members")
  @ApiBody({
    schema: {
      type: "object",
      required: ["userId"],
      properties: {
        userId: { type: "string", format: "uuid" },
        role: {
          type: "string",
          enum: Object.values(ProjectRole),
          default: "member",
        },
      },
    },
  })
  addMember(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id } = parse(idParams, params);
    const input = parse(addMember, body);
    return this.management.addProjectMember(
      actor(request),
      id,
      input.userId,
      input.role,
    );
  }

  @Get(":id/labels")
  @ApiOperation({ summary: "Liệt kê nhãn công ty và nhãn riêng của dự án" })
  labels(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { id } = parse(idParams, params);
    return this.management.listProjectLabels(actor(request), id);
  }

  @Post(":id/labels")
  @ApiOperation({ summary: "Tạo nhãn riêng của dự án" })
  createLabel(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id } = parse(idParams, params);
    return this.management.createProjectLabel(
      actor(request),
      id,
      parse(labelCreate, body),
    );
  }

  @Post(":id/labels/:labelId/merge")
  @ApiOperation({ summary: "Hợp nhất nhãn riêng vào nhãn khác" })
  mergeLabel(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id, labelId } = parse(idParams.extend({ labelId: uuid }), params);
    const { targetLabelId } = parse(labelMerge, body);
    return this.management.mergeProjectLabel(
      actor(request),
      id,
      labelId,
      targetLabelId,
    );
  }

  @Get(":id/members")
  listMembers(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { id } = parse(idParams, params);
    return this.management.listProjectMembers(actor(request), id);
  }

  @Patch(":id/members/:userId")
  @ApiBody({
    schema: {
      type: "object",
      required: ["role"],
      properties: {
        role: { type: "string", enum: Object.values(ProjectRole) },
      },
    },
  })
  updateMember(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id, userId } = parse(idParams.extend({ userId: uuid }), params);
    const { role } = parse(updateMember, body);
    return this.management.updateProjectMemberRole(
      actor(request),
      id,
      userId,
      role,
    );
  }

  @Delete(":id/members/:userId")
  removeMember(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { id, userId } = parse(idParams.extend({ userId: uuid }), params);
    return this.management.removeProjectMember(actor(request), id, userId);
  }
}

@Controller("labels")
@UseGuards(AuthGuard, SystemAdminGuard)
@ApiTags("labels")
@ApiBearerAuth()
export class CompanyLabelsController {
  constructor(private readonly management: ManagementService) {}

  @Post()
  @ApiOperation({ summary: "Tạo nhãn chuẩn cấp công ty" })
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.management.createCompanyLabel(
      actor(request),
      parse(labelCreate, body),
    );
  }
}
