import { NextFunction, Request, Response } from "express";
import { AppError } from "../../shared/errors/app-error";
import { logger } from "../../shared/logging/logger";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const isApp = err instanceof AppError;
  const status = isApp ? err.status : 500;
  const code = isApp ? err.code : "INTERNAL_ERROR";
  const message = isApp ? err.message : "Internal Server Error";

  // Use request logger if available for correlation tracking
  const requestLogger = req.logger || logger;
  
  const errorContext = {
    err: isApp ? { message: err.message, code: err.code } : err,
    method: req.method,
    url: req.url,
    correlationId: req.correlationId,
    userId: req.user?.id,
    userAgent: req.headers['user-agent'],
    ip: req.ip
  };

  if (!isApp) {
    requestLogger.error(errorContext, "Unhandled error");
  } else {
    requestLogger.warn(errorContext, `Application error: ${code}`);
  }

  res.status(status).json({ 
    error: { code, message },
    correlationId: req.correlationId 
  });
}
