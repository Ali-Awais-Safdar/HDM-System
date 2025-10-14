import { Effect } from "effect"

/**
 * Centralized clock utilities to standardize time creation and arithmetic.
 * Keep constructor-free; use static helpers or pure functions for testability.
 */
export class ClockService {
  /** Current Date instance */
  static now(): Date {
    return new Date()
  }

  /** Current epoch milliseconds */
  static nowMs(): number {
    return Date.now()
  }

  /** Add milliseconds to a date (default now) */
  static addMs(ms: number, base?: Date): Date {
    const start = base ?? ClockService.now()
    return new Date(start.getTime() + ms)
  }

  /** Add minutes to a date (default now) */
  static addMinutes(mins: number, base?: Date): Date {
    return ClockService.addMs(mins * 60 * 1000, base)
  }

  /** Effect-friendly getter for current Date */
  static nowEffect(): Effect.Effect<Date> {
    return Effect.sync(() => ClockService.now())
  }
}


