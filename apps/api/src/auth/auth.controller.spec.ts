jest.mock("@nestjs/common", () => {
  class HttpError extends Error {
    constructor(message = "HTTP error") {
      super(message);
    }
  }
  const decorator = () => () => {};
  return {
    BadRequestException: HttpError,
    Body: decorator,
    Controller: decorator,
    Get: decorator,
    HttpCode: decorator,
    Inject: decorator,
    Patch: decorator,
    Post: decorator,
    Req: decorator,
    Res: decorator,
    UnauthorizedException: HttpError,
    UseGuards: decorator,
  };
});

jest.mock("@nestjs/swagger", () => ({
  ApiBearerAuth: () => () => {},
  ApiBody: () => () => {},
  ApiCookieAuth: () => () => {},
  ApiOperation: () => () => {},
  ApiTags: () => () => {},
}));

jest.mock("./auth.guard", () => ({ AuthGuard: class AuthGuard {} }));
jest.mock("./auth.service", () => ({ AuthService: class AuthService {} }));
jest.mock("../infra/infra.module", () => ({ ENV: "ENV" }));

import type { Response } from "express";
import { UnauthorizedException } from "@nestjs/common";
import type { Env } from "../config/env";
import type { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";

describe("AuthController refresh cookie", () => {
  const env = {
    NODE_ENV: "test",
  } as Env;
  const session = {
    accessToken: "access-token",
    refreshToken: "r".repeat(64),
    user: {
      id: "user-1",
      email: "person@example.com",
      name: "Person",
      systemRole: "member",
    },
  };

  it("sets an httpOnly refresh cookie on login without returning it in the body", async () => {
    const auth = {
      login: jest.fn().mockResolvedValue(session),
    };
    const response = { cookie: jest.fn(), clearCookie: jest.fn() };
    const controller = new AuthController(auth as unknown as AuthService, env);

    const result = await controller.login(
      { email: "person@example.com", password: "a valid password" },
      { ip: "127.0.0.1" } as never,
      response as unknown as Response,
    );

    expect(result).toEqual({
      accessToken: session.accessToken,
      user: session.user,
    });
    expect(response.cookie).toHaveBeenCalledWith(
      "qlcv_refresh",
      session.refreshToken,
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/auth",
      }),
    );
  });

  it("sets a rotated refresh token as httpOnly, same-site cookie", async () => {
    const auth = {
      refresh: jest.fn().mockResolvedValue(session),
    };
    const response = { cookie: jest.fn(), clearCookie: jest.fn() };
    const controller = new AuthController(auth as unknown as AuthService, env);

    await controller.refresh(
      {
        headers: { cookie: `other=x; qlcv_refresh=${"o".repeat(64)}` },
      } as never,
      response as unknown as Response,
    );

    expect(auth.refresh).toHaveBeenCalledWith("o".repeat(64));
    expect(response.cookie).toHaveBeenCalledWith(
      "qlcv_refresh",
      session.refreshToken,
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/auth",
      }),
    );
  });

  it("clears the refresh cookie when the session is rejected", async () => {
    const auth = {
      refresh: jest.fn().mockRejectedValue(new UnauthorizedException()),
    };
    const response = { cookie: jest.fn(), clearCookie: jest.fn() };
    const controller = new AuthController(auth as unknown as AuthService, env);

    await expect(
      controller.refresh(
        { headers: { cookie: `qlcv_refresh=${"o".repeat(64)}` } } as never,
        response as unknown as Response,
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(response.clearCookie).toHaveBeenCalledWith(
      "qlcv_refresh",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/auth",
      }),
    );
  });

  it("revokes the refresh token and clears the cookie on logout", async () => {
    const auth = { logout: jest.fn().mockResolvedValue(undefined) };
    const response = { cookie: jest.fn(), clearCookie: jest.fn() };
    const controller = new AuthController(auth as unknown as AuthService, env);

    await controller.logout(
      { headers: { cookie: `qlcv_refresh=${"o".repeat(64)}` } } as never,
      response as unknown as Response,
    );

    expect(auth.logout).toHaveBeenCalledWith("o".repeat(64));
    expect(response.clearCookie).toHaveBeenCalledWith(
      "qlcv_refresh",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/auth",
      }),
    );
  });
});
