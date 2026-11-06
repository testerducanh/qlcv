import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { JsonWebTokenError } from "jsonwebtoken";
import { AuthService, type AuthenticatedUser } from "./auth.service";

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const match = authorization?.match(/^Bearer ([A-Za-z0-9._~-]+)$/);
    if (!match) throw new UnauthorizedException();

    let user: AuthenticatedUser | null;
    try {
      user = await this.auth.validateAccessToken(match[1]);
    } catch (error) {
      if (error instanceof JsonWebTokenError) throw new UnauthorizedException();
      throw error;
    }

    if (!user) throw new UnauthorizedException();
    request.user = user;
    return true;
  }
}
