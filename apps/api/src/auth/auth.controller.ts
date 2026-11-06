import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { Request, Response } from "express";
import type { Env } from "../config/env";
import { ENV } from "../infra/infra.module";
import { AuthGuard, type AuthenticatedRequest } from "./auth.guard";
import { AuthService } from "./auth.service";

const emailSchema = z.string().email().max(254);
const passwordSchema = z.string().min(12).max(128);
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
const resetPasswordSchema = z.object({
  token: z.string().min(32).max(128),
  newPassword: passwordSchema,
});
const emailRequestSchema = z.object({ email: emailSchema });

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
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

function refreshTokenFromCookie(request: Request): string | undefined {
  const cookie = request.headers.cookie;
  if (!cookie) return undefined;
  const entry = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("qlcv_refresh="));
  if (!entry) return undefined;
  const value = entry.slice("qlcv_refresh=".length);
  return /^[A-Za-z0-9_-]{64}$/.test(value) ? value : undefined;
}

@Controller("auth")
@ApiTags("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post("login")
  @ApiOperation({ summary: "Đăng nhập và cấp access token" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["email", "password"],
      properties: {
        email: { type: "string", format: "email" },
        password: { type: "string", maxLength: 128 },
      },
    },
  })
  async login(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = parseBody(loginSchema, body);
    const session = await this.auth.login(
      input.email,
      input.password,
      request.ip ?? "unknown",
    );
    this.setRefreshCookie(response, session.refreshToken);
    return { accessToken: session.accessToken, user: session.user };
  }

  @Post("refresh")
  @ApiOperation({ summary: "Xoay vòng refresh token" })
  @ApiCookieAuth("qlcv_refresh")
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const session = await this.auth.refresh(refreshTokenFromCookie(request));
      this.setRefreshCookie(response, session.refreshToken);
      return { accessToken: session.accessToken, user: session.user };
    } catch (error) {
      if (error instanceof UnauthorizedException)
        this.clearRefreshCookie(response);
      throw error;
    }
  }

  @Post("logout")
  @ApiOperation({ summary: "Đăng xuất và thu hồi refresh token" })
  @HttpCode(204)
  @ApiCookieAuth("qlcv_refresh")
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(refreshTokenFromCookie(request));
    this.clearRefreshCookie(response);
  }

  @Post("password/forgot")
  @HttpCode(202)
  @ApiBody({
    schema: {
      type: "object",
      required: ["email"],
      properties: { email: { type: "string", format: "email" } },
    },
  })
  async forgotPassword(@Body() body: unknown, @Req() request: Request) {
    const { email } = parseBody(emailRequestSchema, body);
    await this.auth.requestPasswordReset(email, request.ip ?? "unknown");
    return {
      message:
        "Nếu tài khoản hợp lệ, hướng dẫn đặt lại mật khẩu sẽ được gửi qua email.",
    };
  }

  @Post("password/reset")
  @HttpCode(204)
  @ApiBody({
    schema: {
      type: "object",
      required: ["token", "newPassword"],
      properties: {
        token: { type: "string" },
        newPassword: { type: "string", minLength: 12, maxLength: 128 },
      },
    },
  })
  async resetPassword(@Body() body: unknown): Promise<void> {
    const input = parseBody(resetPasswordSchema, body);
    await this.auth.resetPassword(input.token, input.newPassword);
  }

  @Get("me")
  @ApiOperation({ summary: "Lấy thông tin người dùng hiện tại" })
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  me(@Req() request: AuthenticatedRequest) {
    const {
      id,
      organizationId,
      systemRole,
      branchId,
      managedDepartmentIds,
      email,
      name,
    } = request.user!;
    return {
      id,
      organizationId,
      systemRole,
      branchId,
      managedDepartmentIds,
      email,
      name,
    };
  }

  @Patch("password")
  @UseGuards(AuthGuard)
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiBody({
    schema: {
      type: "object",
      required: ["currentPassword", "newPassword"],
      properties: {
        currentPassword: { type: "string" },
        newPassword: { type: "string", minLength: 12, maxLength: 128 },
      },
    },
  })
  async changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<void> {
    const input = parseBody(changePasswordSchema, body);
    await this.auth.changePassword(
      request.user!.id,
      input.currentPassword,
      input.newPassword,
    );
  }

  private setRefreshCookie(response: Response, token: string): void {
    response.cookie("qlcv_refresh", token, {
      httpOnly: true,
      secure: this.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/auth",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie("qlcv_refresh", {
      httpOnly: true,
      secure: this.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/auth",
    });
  }
}
