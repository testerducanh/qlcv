import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";

const STATUS_MESSAGES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: "Dữ liệu yêu cầu không hợp lệ",
  [HttpStatus.UNAUTHORIZED]: "Vui lòng đăng nhập để tiếp tục",
  [HttpStatus.FORBIDDEN]: "Bạn không có quyền thực hiện thao tác này",
  [HttpStatus.NOT_FOUND]: "Không tìm thấy tài nguyên",
  [HttpStatus.CONFLICT]: "Dữ liệu bị xung đột",
  [HttpStatus.TOO_MANY_REQUESTS]:
    "Bạn thao tác quá nhanh, vui lòng thử lại sau",
};
const DEFAULT_NEST_MESSAGES = new Set([
  "Bad Request Exception",
  "Unauthorized",
  "Forbidden",
  "Not Found",
  "Conflict",
  "Too Many Requests",
]);

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const mapped = this.mapException(exception);

    if (mapped.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({
        message: "Unhandled API error",
        method: request.method,
        path: request.originalUrl?.split("?")[0],
        error: exception instanceof Error ? exception.name : "UnknownError",
      });
    }

    response.status(mapped.status).json({
      code: mapped.code,
      message: mapped.message,
      ...(mapped.details ? { details: mapped.details } : {}),
    });
  }

  private mapException(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2002") {
        return {
          status: HttpStatus.CONFLICT,
          code: "DUPLICATE_RESOURCE",
          message: "Dữ liệu đã tồn tại",
          details: exception.meta?.target,
        };
      }
      if (exception.code === "P2025") {
        return {
          status: HttpStatus.NOT_FOUND,
          code: "RESOURCE_NOT_FOUND",
          message: STATUS_MESSAGES[HttpStatus.NOT_FOUND]!,
        };
      }
      if (exception.code === "P2003") {
        return {
          status: HttpStatus.BAD_REQUEST,
          code: "INVALID_REFERENCE",
          message: "Tham chiếu đến dữ liệu không hợp lệ",
          details: exception.meta?.field_name,
        };
      }
      if (exception.code === "P2034") {
        return {
          status: HttpStatus.CONFLICT,
          code: "CONCURRENT_MODIFICATION",
          message:
            "Dữ liệu vừa được thay đổi bởi thao tác khác, vui lòng thử lại",
        };
      }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        return {
          status,
          code: this.httpCode(status),
          message: DEFAULT_NEST_MESSAGES.has(body)
            ? (STATUS_MESSAGES[status] ?? "Yêu cầu không thể hoàn tất")
            : body,
        };
      }
      if (body && typeof body === "object") {
        const payload = body as {
          message?: unknown;
          errors?: unknown;
          details?: unknown;
        };
        const message =
          typeof payload.message === "string" &&
          !DEFAULT_NEST_MESSAGES.has(payload.message)
            ? payload.message
            : (STATUS_MESSAGES[status] ?? "Yêu cầu không thể hoàn tất");
        const details = payload.details ?? payload.errors;
        return {
          status,
          code: this.httpCode(status),
          message,
          ...(details === undefined ? {} : { details }),
        };
      }
      return {
        status,
        code: this.httpCode(status),
        message: STATUS_MESSAGES[status] ?? "Yêu cầu không thể hoàn tất",
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "INTERNAL_ERROR",
      message: "Đã xảy ra lỗi hệ thống",
    };
  }

  private httpCode(status: number): string {
    const names: Partial<Record<number, string>> = {
      [HttpStatus.BAD_REQUEST]: "INVALID_REQUEST",
      [HttpStatus.UNAUTHORIZED]: "UNAUTHENTICATED",
      [HttpStatus.FORBIDDEN]: "FORBIDDEN",
      [HttpStatus.NOT_FOUND]: "RESOURCE_NOT_FOUND",
      [HttpStatus.CONFLICT]: "CONFLICT",
      [HttpStatus.TOO_MANY_REQUESTS]: "RATE_LIMITED",
    };
    return names[status] ?? `HTTP_${status}`;
  }
}
