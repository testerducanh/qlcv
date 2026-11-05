jest.mock("@nestjs/common", () => {
  class HttpException extends Error {
    constructor(
      private readonly response: unknown,
      private readonly status: number,
    ) {
      super(typeof response === "string" ? response : "HTTP error");
    }

    getStatus() {
      return this.status;
    }

    getResponse() {
      return this.response;
    }
  }

  return {
    ArgumentsHost: class {},
    Catch: () => () => {},
    HttpException,
    HttpStatus: {
      BAD_REQUEST: 400,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      TOO_MANY_REQUESTS: 429,
      INTERNAL_SERVER_ERROR: 500,
    },
    Logger: class {
      error = jest.fn();
    },
  };
});

import { HttpException, type ArgumentsHost } from "@nestjs/common";
import { ApiExceptionFilter } from "./api-exception.filter";

function host() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const request = { method: "POST", originalUrl: "/projects?secret=hidden" };
  const context = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { context, status, json };
}

describe("ApiExceptionFilter", () => {
  it("uses a stable Vietnamese error envelope and preserves field details", () => {
    const filter = new ApiExceptionFilter();
    const response = host();

    filter.catch(
      new HttpException(
        {
          message: "Dữ liệu không hợp lệ",
          errors: [{ field: "name", message: "Bắt buộc" }],
        },
        400,
      ),
      response.context,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      code: "INVALID_REQUEST",
      message: "Dữ liệu không hợp lệ",
      details: [{ field: "name", message: "Bắt buộc" }],
    });
  });

  it("keeps inaccessible-resource responses generic and localized", () => {
    const filter = new ApiExceptionFilter();
    const response = host();

    filter.catch(new HttpException("Not Found", 404), response.context);

    expect(response.json).toHaveBeenCalledWith({
      code: "RESOURCE_NOT_FOUND",
      message: "Không tìm thấy tài nguyên",
    });
  });

  it("does not expose unexpected internal error details", () => {
    const filter = new ApiExceptionFilter();
    const response = host();

    filter.catch(new Error("database credentials leaked"), response.context);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      code: "INTERNAL_ERROR",
      message: "Đã xảy ra lỗi hệ thống",
    });
  });
});
