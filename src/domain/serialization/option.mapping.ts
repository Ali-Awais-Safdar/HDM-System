import { Option } from "effect";

/**
 * Option mapping helpers for converting between database nullable values and domain Option<T>.
 * These helpers maintain the architectural separation between persistence and domain layers.
 */

/**
 * Converts a nullable database value to an Option<T>.
 * 
 * @param value - The nullable database value
 * @returns Option.some(value) if value is not null/undefined, Option.none() otherwise
 */
export function fromNullable<T>(value: T | null | undefined): Option.Option<T> {
  return value != null ? Option.some(value) : Option.none();
}

/**
 * Converts an Option<T> to a nullable database value.
 * 
 * @param option - The Option to convert
 * @returns The wrapped value if Option.some, null if Option.none
 */
export function toNullable<T>(option: Option.Option<T>): T | null {
  return Option.getOrNull(option);
}

/**
 * Specialized helper for Date fields commonly used in entities.
 * Converts nullable Date from database to Option<Date>.
 */
export function dateFromNullable(value: Date | null | undefined): Option.Option<Date> {
  return fromNullable(value);
}

/**
 * Specialized helper for Date fields commonly used in entities.
 * Converts Option<Date> to nullable Date for database storage.
 */
export function dateToNullable(option: Option.Option<Date>): Date | null {
  return toNullable(option);
}

/**
 * Maps over an Option<T> and converts the result back to nullable.
 * Useful for transforming values while maintaining the Option context.
 */
export function mapToNullable<T, U>(
  option: Option.Option<T>, 
  fn: (value: T) => U
): U | null {
  return Option.match(option, {
    onNone: () => null,
    onSome: fn
  });
}

/**
 * Utility to check if an Option is present (Some).
 * Useful for conditional logic in domain methods.
 */
export function isSome<T>(option: Option.Option<T>): boolean {
  return Option.isSome(option);
}

/**
 * Utility to check if an Option is absent (None).
 * Useful for conditional logic in domain methods.
 */
export function isNone<T>(option: Option.Option<T>): boolean {
  return Option.isNone(option);
}

/**
 * Gets the value from an Option or returns a default value.
 * Useful for providing fallbacks in domain logic.
 */
export function getOrElse<T>(option: Option.Option<T>, defaultValue: T): T {
  return Option.getOrElse(option, () => defaultValue);
}
