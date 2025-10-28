import "reflect-metadata"
import { injectable, inject } from "tsyringe"
import pino, { type Logger as PinoLoggerInstance } from "pino"
import { LoggerPort, type LogContext } from "@application/services/ports/logger.port"
import { TOKENS } from "@infra/di/container"
import type { ConfigPort } from "@application/services/ports/config.port"

/**
 * Pino-backed Logger Adapter
 * 
 * Implements structured logging with:
 * - Automatic redaction of sensitive fields (JWT tokens, secrets, passwords)
 * - Context enrichment via child loggers
 * - LOG_LEVEL and LOG_FORMAT configuration from env
 * - Request correlation via requestId
 */
@injectable()
export class PinoLogger implements LoggerPort {
  private readonly logger: PinoLoggerInstance

  constructor(
    @inject(TOKENS.CONFIG_PORT)
    config: ConfigPort
  ) {
    // Configure Pino with redaction and formatting
    const baseOptions: pino.LoggerOptions = {
      level: config.LOG_LEVEL,
      // Redact sensitive fields to prevent leakage
      redact: {
        paths: [
          // JWT and authorization
          "*.token",
          "*.jwt",
          "*.accessToken",
          "*.refreshToken",
          "*.authorization",
          "*.Authorization",
          "context.token",
          "context.jwt",
          "context.accessToken",
          "context.refreshToken",
          "context.authorization",
          
          // Passwords and secrets
          "*.password",
          "*.secret",
          "*.apiKey",
          "*.privateKey",
          "context.password",
          "context.secret",
          "context.apiKey",
          "context.privateKey",
          
          // JWT payload fields that might contain sensitive data
          "*.rawPayload",
          "context.rawPayload",
          
          // Headers that might contain auth
          "*.headers.authorization",
          "*.headers.Authorization",
          "context.headers.authorization",
          "context.headers.Authorization"
        ],
        censor: "[REDACTED]"
      },
      // Base context for all logs
      base: {
        service: "dms-headless",
        environment: config.NODE_ENV
      },
      // Formatting
      formatters: {
        level: (label) => {
          return { level: label }
        }
      }
    }

    // Create logger with or without pretty transport
    if (config.LOG_FORMAT === "pretty") {
      this.logger = pino({
        ...baseOptions,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
            singleLine: false,
            messageFormat: "{msg} {if context}{context}{end}"
          }
        }
      })
    } else {
      this.logger = pino(baseOptions)
    }
  }

  trace(message: string, context?: LogContext): void {
    this.logger.trace(context || {}, message)
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(context || {}, message)
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(context || {}, message)
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(context || {}, message)
  }

  error(message: string, context?: LogContext): void {
    this.logger.error(context || {}, message)
  }

  fatal(message: string, context?: LogContext): void {
    this.logger.fatal(context || {}, message)
  }

  child(context: LogContext): LoggerPort {
    // Create a new instance wrapping a Pino child logger
    const childLogger = new PinoLoggerChild(this.logger.child(context))
    return childLogger
  }
}

class PinoLoggerChild implements LoggerPort {
  constructor(private readonly logger: PinoLoggerInstance) {}

  trace(message: string, context?: LogContext): void {
    this.logger.trace(context || {}, message)
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(context || {}, message)
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(context || {}, message)
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(context || {}, message)
  }

  error(message: string, context?: LogContext): void {
    this.logger.error(context || {}, message)
  }

  fatal(message: string, context?: LogContext): void {
    this.logger.fatal(context || {}, message)
  }

  child(context: LogContext): LoggerPort {
    return new PinoLoggerChild(this.logger.child(context))
  }
}

