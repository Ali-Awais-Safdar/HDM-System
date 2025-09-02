/**
 * Lightweight Result type (Ok/Err) to avoid throwing for business flow.
 * This reflects your guidance to prefer explicit results over exceptions for expected errors.
 */
export type Ok<T> = { ok: true; value: T };
export type Err<E extends Error> = { ok: false; error: E };

export const Result = {
  ok<T>(value: T): Ok<T> { return { ok: true, value }; },
  err<E extends Error>(error: E): Err<E> { return { ok: false, error }; },
} as const;
