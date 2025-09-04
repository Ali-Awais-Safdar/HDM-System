import pino from "pino";
import { randomUUID } from "crypto";

/**
 * Enhanced logger with structured logging and correlation ID support.
 * Provides context-aware logging throughout the application.
 */

// Get config from process.env to avoid circular dependencies
const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const LOG_FORMAT = process.env.LOG_FORMAT || "json";
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_DEVELOPMENT = NODE_ENV === "development";

// Create base logger instance
const baseLogger = pino({
  level: LOG_LEVEL,
  transport: IS_DEVELOPMENT && LOG_FORMAT === "pretty" ? { 
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    }
  } : undefined,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    pid: process.pid,
    hostname: process.env.HOSTNAME || 'localhost',
    service: 'dms-headless',
    version: process.env.npm_package_version || '0.1.0',
  },
});

export const logger = baseLogger;

/**
 * Create a child logger with correlation ID for request tracing.
 * This helps track requests across the entire application flow.
 */
export function createRequestLogger(correlationId?: string): pino.Logger {
  const reqId = correlationId || randomUUID();
  return logger.child({ correlationId: reqId });
}

/**
 * Create a child logger with additional context.
 */
export function createContextLogger(context: Record<string, unknown>): pino.Logger {
  return logger.child(context);
}

/**
 * Create a logger for a specific service/module.
 */
export function createServiceLogger(service: string): pino.Logger {
  return logger.child({ service });
}

/**
 * Create a logger for database operations with query context.
 */
export function createDatabaseLogger(): pino.Logger {
  return logger.child({ component: 'database' });
}

/**
 * Create a logger for authentication operations.
 */
export function createAuthLogger(): pino.Logger {
  return logger.child({ component: 'auth' });
}

/**
 * Log performance metrics for operations.
 */
export function logPerformance(
  logger: pino.Logger, 
  operation: string, 
  startTime: number,
  metadata?: Record<string, unknown>
): void {
  const duration = Date.now() - startTime;
  logger.info({
    operation,
    duration,
    ...metadata
  }, `Operation completed: ${operation}`);
}

/**
 * Log security events (authentication, authorization failures, etc.)
 */
export function logSecurityEvent(
  event: string,
  userId?: string,
  metadata?: Record<string, unknown>
): void {
  logger.warn({
    event,
    userId,
    component: 'security',
    timestamp: new Date().toISOString(),
    ...metadata
  }, `Security event: ${event}`);
}
