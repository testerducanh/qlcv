import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { JsonLogger } from "./json-logger";

export function requestLogger(logger: JsonLogger) {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = (req.headers["x-request-id"] as string) || randomUUID();
    res.setHeader("x-request-id", id);
    const start = Date.now();
    res.on("finish", () => {
      logger.log({
        requestId: id,
        method: req.method,
        url: req.originalUrl.split("?")[0],
        status: res.statusCode,
        ms: Date.now() - start,
      });
    });
    next();
  };
}
