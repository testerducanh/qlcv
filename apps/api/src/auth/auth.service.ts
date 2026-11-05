import { randomBytes, randomUUID, createHash } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import type Redis from "ioredis";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { Env } from "../config/env";
import { ENV, PrismaService, REDIS } from "../infra/infra.module";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const LOGIN_LOCK_SECONDS = 15 * 60;
const LOGIN_FAILURE_LIMIT = 5;
const AUTH_RATE_LIMIT = 30;
const AUTH_RATE_WINDOW_SECONDS = 15 * 60;
const RESET_TOKEN_TTL_SECONDS = 60 * 60;
const JWT_ISSUER = "qlcv-api";
const JWT_AUDIENCE = "qlcv-web";
const INVALID_CREDENTIALS = "Email hoặc mật khẩu không đúng";

const incrementWithExpiry = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

let dummyPasswordHash: Promise<string> | undefined;

function getDummyPasswordHash(): Promise<string> {
  if (!dummyPasswordHash)
    dummyPasswordHash = hash("qlcv-invalid-account-password");
  return dummyPasswordHash;
}

export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  systemRole:
    | "system_admin"
    | "executive"
    | "branch_director"
    | "department_head"
    | "member";
  branchId: string | null;
  managedDepartmentIds: string[];
  email: string;
  name: string;
}

export interface AuthSession {
  accessToken: string;
  user: Pick<AuthenticatedUser, "id" | "email" | "name" | "systemRole">;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly mailer: Transporter;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {
    const auth =
      this.env.SMTP_USER && this.env.SMTP_PASSWORD
        ? { user: this.env.SMTP_USER, pass: this.env.SMTP_PASSWORD }
        : undefined;
    this.mailer = nodemailer.createTransport({
      host: this.env.SMTP_HOST,
      port: this.env.SMTP_PORT,
      secure: this.env.SMTP_SECURE,
      ...(auth ? { auth } : {}),
    });
  }

  async login(
    email: string,
    password: string,
    ip: string,
  ): Promise<AuthSession> {
    await this.enforceRateLimit("login", ip);
    const normalizedEmail = email.trim().toLowerCase();
    const emailDigest = this.digest(normalizedEmail);
    const failureKey = `auth:login-fail:${emailDigest}`;
    const failures = Number((await this.redis.get(failureKey)) ?? 0);
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (failures >= LOGIN_FAILURE_LIMIT) {
      await this.recordLoginFailure(user?.id);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const passwordMatches = await verify(
      user?.passwordHash ?? (await getDummyPasswordHash()),
      password,
    );
    if (
      !user ||
      !user.passwordHash ||
      user.status !== "active" ||
      !passwordMatches
    ) {
      await this.redis.eval(
        incrementWithExpiry,
        1,
        failureKey,
        LOGIN_LOCK_SECONDS,
      );
      await this.recordLoginFailure(user?.id);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    await this.redis.del(failureKey);
    const refreshToken = randomBytes(48).toString("base64url");
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: this.digest(refreshToken),
          expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000),
        },
      }),
      this.prisma.activityLog.create({
        data: {
          entityType: "auth",
          entityId: user.id,
          actorId: user.id,
          action: "auth.login",
        },
      }),
    ]);

    return {
      accessToken: this.createAccessToken(user.id),
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        systemRole: user.systemRole,
      },
    };
  }

  async refresh(rawToken: string | undefined): Promise<AuthSession> {
    if (!rawToken) throw new UnauthorizedException();
    const tokenHash = this.digest(rawToken);
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    const now = new Date();
    if (
      !token ||
      token.revokedAt ||
      token.expiresAt <= now ||
      token.user.status !== "active"
    ) {
      throw new UnauthorizedException();
    }

    const newRawToken = randomBytes(48).toString("base64url");
    const expiresAt = new Date(
      now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000,
    );
    await this.prisma.$transaction(async (transaction) => {
      const revoked = await transaction.refreshToken.updateMany({
        where: { id: token.id, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
      if (revoked.count !== 1) throw new UnauthorizedException();

      await transaction.refreshToken.create({
        data: {
          userId: token.userId,
          tokenHash: this.digest(newRawToken),
          expiresAt,
        },
      });
    });

    return {
      accessToken: this.createAccessToken(token.userId),
      refreshToken: newRawToken,
      user: {
        id: token.user.id,
        email: token.user.email,
        name: token.user.name,
        systemRole: token.user.systemRole,
      },
    };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.digest(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      !user.passwordHash ||
      user.status !== "active" ||
      !(await verify(user.passwordHash, currentPassword))
    ) {
      throw new UnauthorizedException("Mật khẩu hiện tại không đúng");
    }

    const passwordHash = await hash(newPassword);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.activityLog.create({
        data: {
          entityType: "auth",
          entityId: user.id,
          actorId: user.id,
          action: "auth.password_changed",
        },
      }),
    ]);
  }

  async requestPasswordReset(email: string, ip: string): Promise<void> {
    await this.enforceRateLimit("password-reset", ip);
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user || user.status !== "active") return;

    const token = randomBytes(32).toString("base64url");
    await this.redis.set(
      `auth:password-reset:${this.digest(token)}`,
      user.id,
      "EX",
      RESET_TOKEN_TTL_SECONDS,
    );
    const resetUrl = new URL("/reset-password", this.env.WEB_BASE_URL);
    resetUrl.searchParams.set("token", token);
    try {
      await this.mailer.sendMail({
        from: this.env.SMTP_FROM,
        to: user.email,
        subject: "Đặt lại mật khẩu QLCV",
        text: `Mở liên kết sau để đặt lại mật khẩu (có hiệu lực trong 1 giờ): ${resetUrl.toString()}`,
      });
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? error.code
          : undefined;
      this.logger.error({
        message: "Không gửi được email đặt lại mật khẩu",
        code,
      });
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const userId = await this.redis.getdel(
      `auth:password-reset:${this.digest(token)}`,
    );
    if (!userId)
      throw new UnauthorizedException(
        "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn",
      );

    const now = new Date();
    const passwordHash = await hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.activityLog.create({
        data: {
          entityType: "auth",
          entityId: userId,
          actorId: userId,
          action: "auth.password_reset",
        },
      }),
    ]);
  }

  async validateAccessToken(token: string): Promise<AuthenticatedUser | null> {
    const decoded = jwt.verify(token, this.env.JWT_ACCESS_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ["HS256"],
    });
    if (typeof decoded === "string" || typeof decoded.sub !== "string")
      return null;

    const user = await this.prisma.user.findUnique({
      where: { id: decoded.sub },
      include: {
        departmentLinks: {
          where: { isHead: true },
          select: { departmentId: true },
        },
      },
    });
    if (!user || user.status !== "active") return null;

    return {
      id: user.id,
      organizationId: user.organizationId,
      systemRole: user.systemRole,
      branchId: user.branchId,
      managedDepartmentIds: user.departmentLinks.map(
        (link) => link.departmentId,
      ),
      email: user.email,
      name: user.name,
    };
  }

  private createAccessToken(userId: string): string {
    return jwt.sign({ sub: userId }, this.env.JWT_ACCESS_SECRET, {
      expiresIn: ACCESS_TOKEN_TTL,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithm: "HS256",
    });
  }

  private async enforceRateLimit(scope: string, ip: string): Promise<void> {
    const key = `auth:rate:${scope}:${this.digest(ip || "unknown")}`;
    const count = Number(
      await this.redis.eval(
        incrementWithExpiry,
        1,
        key,
        AUTH_RATE_WINDOW_SECONDS,
      ),
    );
    if (count > AUTH_RATE_LIMIT) {
      throw new HttpException(
        "Quá nhiều yêu cầu. Vui lòng thử lại sau.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordLoginFailure(userId?: string): Promise<void> {
    await this.prisma.activityLog.create({
      data: {
        entityType: "auth",
        entityId: userId ?? randomUUID(),
        actorId: userId ?? null,
        action: "auth.login_failed",
      },
    });
  }

  private digest(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
}
