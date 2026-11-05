jest.mock("@nestjs/common", () => {
  class UnauthorizedException extends Error {}
  return {
    Inject: () => () => {},
    Injectable: () => () => {},
    UnauthorizedException,
  };
});

jest.mock("../infra/infra.module", () => ({
  ENV: "ENV",
  REDIS: "REDIS",
  PrismaService: class PrismaService {},
}));

import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { JsonWebTokenError } from "jsonwebtoken";
import type { AuthenticatedUser, AuthService } from "./auth.service";
import { AuthGuard, type AuthenticatedRequest } from "./auth.guard";

const user: AuthenticatedUser = {
  id: "user-1",
  organizationId: "org-1",
  systemRole: "department_head",
  branchId: "branch-1",
  managedDepartmentIds: ["department-1"],
  email: "person@example.com",
  name: "Person",
};

function context(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("AuthGuard", () => {
  it("loads the current user from the validated access token", async () => {
    const request = {
      headers: { authorization: "Bearer valid.jwt.token" },
    } as AuthenticatedRequest;
    const auth = { validateAccessToken: jest.fn().mockResolvedValue(user) };
    const guard = new AuthGuard(auth as unknown as AuthService);

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request.user).toEqual(user);
    expect(auth.validateAccessToken).toHaveBeenCalledWith("valid.jwt.token");
  });

  it("rejects absent or malformed authorization headers", async () => {
    const auth = { validateAccessToken: jest.fn() };
    const guard = new AuthGuard(auth as unknown as AuthService);

    await expect(
      guard.canActivate(context({ headers: {} } as AuthenticatedRequest)),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      guard.canActivate(
        context({
          headers: { authorization: "Basic not-a-token" },
        } as AuthenticatedRequest),
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(auth.validateAccessToken).not.toHaveBeenCalled();
  });

  it("converts invalid JWTs to an authentication failure", async () => {
    const auth = {
      validateAccessToken: jest
        .fn()
        .mockRejectedValue(new JsonWebTokenError("invalid token")),
    };
    const guard = new AuthGuard(auth as unknown as AuthService);
    const request = {
      headers: { authorization: "Bearer invalid.jwt.token" },
    } as AuthenticatedRequest;

    await expect(guard.canActivate(context(request))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
