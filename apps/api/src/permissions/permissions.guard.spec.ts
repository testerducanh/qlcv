jest.mock("@nestjs/common", () => {
  class NotFoundException extends Error {
    constructor() {
      super("NotFoundException");
    }
  }
  class UnauthorizedException extends Error {
    constructor() {
      super("UnauthorizedException");
    }
  }

  type Decorator = (
    target: object,
    propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor,
  ) => void;

  const SetMetadata =
    (key: string, value: unknown): Decorator =>
    (_target, _propertyKey, descriptor) => {
      if (descriptor?.value)
        Object.defineProperty(descriptor.value, key, { value });
    };
  const noopDecorator: Decorator = () => {};

  return {
    applyDecorators:
      (...decorators: Decorator[]): Decorator =>
      (target, propertyKey, descriptor) => {
        decorators.forEach((decorator) =>
          decorator(target, propertyKey, descriptor),
        );
      },
    createParamDecorator: () => noopDecorator,
    Injectable: () => noopDecorator,
    NotFoundException,
    SetMetadata,
    UnauthorizedException,
    UseGuards: () => noopDecorator,
  };
});

jest.mock("@nestjs/core", () => ({
  Reflector: class {
    getAllAndOverride(
      key: string,
      targets: Array<Record<string, unknown> | undefined>,
    ): unknown {
      return targets.find((target) => target?.[key])?.[key];
    }
  },
}));

import {
  NotFoundException,
  UnauthorizedException,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RequirePermission, PermissionsGuard } from "./permissions.guard";
import type { PermissionResource, PermissionUser } from "./permissions";

class ProtectedController {
  @RequirePermission("task.view")
  readTask() {}
}

describe("PermissionsGuard", () => {
  const user: PermissionUser = {
    id: "manager",
    organizationId: "org-1",
    systemRole: "branch_director",
    branchId: "branch-1",
  };
  const restrictedTask: PermissionResource = {
    type: "task",
    organizationId: "org-1",
    projectId: "project-1",
    branchId: "branch-1",
    confidentiality: "restricted",
    creatorId: "someone-else",
  };

  function executionContext(request: {
    user?: PermissionUser;
    permissionResource?: PermissionResource;
    permissionVisibility?: string;
  }): ExecutionContext {
    return {
      getHandler: () => ProtectedController.prototype.readTask,
      getClass: () => ProtectedController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  it("allows limited access and exposes visibility for safe response shaping", () => {
    const request: {
      user?: PermissionUser;
      permissionResource?: PermissionResource;
      permissionVisibility?: string;
    } = { user, permissionResource: restrictedTask };
    const guard = new PermissionsGuard(new Reflector());

    expect(guard.canActivate(executionContext(request))).toBe(true);
    expect(request.permissionVisibility).toBe("limited");
  });

  it("returns 404 for a resource outside the caller's scope", () => {
    const request = {
      user: { ...user, branchId: "branch-2" },
      permissionResource: restrictedTask,
    };
    const guard = new PermissionsGuard(new Reflector());

    expect(() => guard.canActivate(executionContext(request))).toThrow(
      NotFoundException,
    );
  });

  it("returns 404 when trusted resource facts have not been loaded", () => {
    const guard = new PermissionsGuard(new Reflector());

    expect(() => guard.canActivate(executionContext({ user }))).toThrow(
      NotFoundException,
    );
  });

  it("requires an authenticated principal", () => {
    const guard = new PermissionsGuard(new Reflector());

    expect(() =>
      guard.canActivate(
        executionContext({ permissionResource: restrictedTask }),
      ),
    ).toThrow(UnauthorizedException);
  });
});
