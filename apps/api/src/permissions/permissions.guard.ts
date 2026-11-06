import {
  applyDecorators,
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  NotFoundException,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import {
  permissionVisibility,
  type PermissionAction,
  type PermissionResource,
  type PermissionUser,
  type PermissionVisibility,
} from "./permissions";

export const REQUIRED_PERMISSION = "required_permission";

type PermissionRequest = Request & {
  user?: PermissionUser;
  permissionResource?: PermissionResource;
  permissionVisibility?: PermissionVisibility;
};

export function RequirePermission(
  action: PermissionAction,
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(REQUIRED_PERMISSION, action),
    UseGuards(PermissionsGuard),
  );
}

/**
 * Reads only a server-resolved permissionResource. Middleware or an earlier
 * guard must populate it from storage, never from request input.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const action = this.reflector.getAllAndOverride<PermissionAction>(
      REQUIRED_PERMISSION,
      [context.getHandler(), context.getClass()],
    );
    if (!action) return true;

    const request = context.switchToHttp().getRequest<PermissionRequest>();
    if (!request.user) throw new UnauthorizedException();
    if (!request.permissionResource) throw new NotFoundException();

    const visibility = permissionVisibility(
      request.user,
      action,
      request.permissionResource,
    );
    if (visibility === "none") throw new NotFoundException();

    request.permissionVisibility = visibility;
    return true;
  }
}

export const PermissionVisibilityParam = createParamDecorator(
  (_: unknown, context: ExecutionContext): PermissionVisibility | undefined => {
    const request = context.switchToHttp().getRequest<PermissionRequest>();
    return request.permissionVisibility;
  },
);
