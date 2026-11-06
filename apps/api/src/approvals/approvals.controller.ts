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
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { ApprovalsService } from "./approvals.service";

const uuid = z.string().uuid();
const projectParams = z.object({ projectId: uuid });

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

const flowInput = z.object({
  name: z.string().trim().min(1).max(120),
  requestType: z.enum([
    "task_result",
    "task_extension",
    "project_milestone",
    "phase_gate",
    "template_publish",
    "confidential_export",
    "guest_invite",
  ]),
  steps: z
    .array(
      z.object({
        userId: uuid.optional(),
        role: z
          .enum([
            "owner",
            "manager",
            "member",
            "restricted",
            "commenter",
            "viewer",
          ])
          .optional(),
        slaHours: z.number().int().min(1).max(8760),
        canForward: z.boolean().default(false),
        important: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(20),
});

@Controller("projects/:projectId")
@UseGuards(AuthGuard)
@ApiTags("approvals")
@ApiBearerAuth()
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get("approval-flows")
  flows(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    return this.approvals.listFlows(
      actor(request),
      parse(projectParams, params).projectId,
    );
  }

  @Post("approval-flows")
  createFlow(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    return this.approvals.createFlow(
      actor(request),
      parse(projectParams, params).projectId,
      parse(flowInput, body),
    );
  }

  @Post("approval-requests")
  createRequest(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const input = parse(
      z.object({
        flowId: uuid,
        subjectType: z.enum(["task", "project"]),
        subjectId: uuid,
      }),
      body,
    );
    return this.approvals.createRequest(
      actor(request),
      parse(projectParams, params).projectId,
      input,
    );
  }

  @Get("approval-requests")
  requests(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    return this.approvals.listRequests(
      actor(request),
      parse(projectParams, params).projectId,
    );
  }

  @Post("approval-requests/:requestId/action")
  action(
    @Req() request: AuthenticatedRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const route = parse(projectParams.extend({ requestId: uuid }), params);
    const input = parse(
      z.object({
        action: z.enum(["approve", "reject", "request_changes", "forward"]),
        note: z.string().trim().max(2000).optional(),
        forwardToUserId: uuid.optional(),
      }),
      body,
    );
    return this.approvals.act(
      actor(request),
      route.projectId,
      route.requestId,
      input,
    );
  }

  @Get("approval-delegations")
  delegations(@Req() request: AuthenticatedRequest) {
    return this.approvals.listDelegations(actor(request));
  }

  @Post("approval-delegations")
  createDelegation(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const input = parse(
      z.object({
        granteeId: uuid,
        projectId: uuid.optional(),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
      }),
      body,
    );
    return this.approvals.createDelegation(actor(request), input);
  }

  @Patch("approval-delegations/:delegationId/revoke")
  revokeDelegation(
    @Req() request: AuthenticatedRequest,
    @Param("delegationId") delegationId: string,
  ) {
    return this.approvals.revokeDelegation(
      actor(request),
      parse(uuid, delegationId),
    );
  }
}
