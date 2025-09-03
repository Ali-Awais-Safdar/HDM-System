/**
 * Lightweight Result type (Ok/Err) to avoid throwing for business flow.
 * This reflects your guidance to prefer explicit results over exceptions for expected errors.
 */
export type Ok<T> = { ok: true; value: T };
export type Err<E extends Error> = { ok: false; error: E };
export type Result<T, E extends Error = Error> = Ok<T> | Err<E>;

// Helper functions for working with Results
export function ok<T>(value: T): Ok<T> { 
  return { ok: true, value }; 
}

export function err<E extends Error>(error: E): Err<E> { 
  return { ok: false, error }; 
}

export function isOk<T, E extends Error>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E extends Error>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

// Map over the success value
export function map<T, U, E extends Error>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

// Chain operations that might fail
export function flatMap<T, U, E extends Error>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

// Get value or throw error
export function unwrap<T, E extends Error>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error;
}

// Get value or return default
export function unwrapOr<T, E extends Error>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}

// Namespace for backwards compatibility
export const ResultUtils = {
  ok,
  err,
  isOk,
  isErr,
  map,
  flatMap,
  unwrap,
  unwrapOr
} as const;
