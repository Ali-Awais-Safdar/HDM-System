import { NextFunction, Request, Response } from "express";
import { AppError } from "../../shared/errors/app-error";
import { logger } from "../../shared/logging/logger";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const isApp = err instanceof AppError;
  const status = isApp ? err.status : 500;
  const code = isApp ? err.code : "INTERNAL_ERROR";
  const message = isApp ? err.message : "Internal Server Error";

  if (!isApp) logger.error({ err }, "Unhandled error");

  res.status(status).json({ error: { code, message } });
}
