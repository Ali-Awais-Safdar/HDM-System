import { Handler } from "./chain";
import { Request, Response, NextFunction } from "express";
import { createRequestLogger, logPerformance } from "../../shared/logging/logger";
import { randomUUID } from "crypto";

export class RequestLogger extends Handler {
  override handle(req: Request, res: Response, next: NextFunction) {
    // Generate correlation ID for this request
    const correlationId = req.headers['x-correlation-id'] as string || randomUUID();
    const requestLogger = createRequestLogger(correlationId);
    
    // Attach correlation ID and logger to request
    req.correlationId = correlationId;
    req.logger = requestLogger;
    
    // Set correlation ID in response headers for client tracking
    res.setHeader('X-Correlation-ID', correlationId);
    
    const startTime = Date.now();
    const { method, url, ip } = req;
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    requestLogger.info({
      method,
      url,
      ip,
      userAgent,
      correlationId
    }, "Incoming request");
    
    // Log response when request completes
    res.on('finish', () => {
      const { statusCode } = res;
      logPerformance(requestLogger, `${method} ${url}`, startTime, {
        statusCode,
        ip,
        userAgent
      });
    });
    
    return super.handle(req, res, next);
  }
}
