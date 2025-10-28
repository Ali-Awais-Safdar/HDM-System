export interface LogContext {
  readonly [key: string]: unknown
}

export abstract class LoggerPort {
  abstract trace(message: string, context?: LogContext): void

  abstract debug(message: string, context?: LogContext): void

  abstract info(message: string, context?: LogContext): void

  abstract warn(message: string, context?: LogContext): void

  abstract error(message: string, context?: LogContext): void

  abstract fatal(message: string, context?: LogContext): void

  abstract child(context: LogContext): LoggerPort
}

