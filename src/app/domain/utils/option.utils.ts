import { Option } from "effect"

/**
 * Converts a nullable value to an Option<T>.
 * Normalizes null/undefined values to Option.none() at domain boundaries.
 * This is the primary normalization function for incoming data.
 */
export const fromNullable = <T>(value: T | null | undefined): Option.Option<T> => {
  return value != null ? Option.some(value) : Option.none()
}

/**
 * Converts an Option<T> to a nullable value.
 * Used when converting from domain to external formats (database, API).
 * This is the primary denormalization function for outgoing data.
 */
export const toNullable = <T>(option: Option.Option<T>): T | null => {
  return Option.getOrNull(option)
}

/**
 * Specialized helper for Date fields.
 * Converts nullable Date from database to Option<Date>.
 */
export const dateFromNullable = (value: Date | null | undefined): Option.Option<Date> => {
  return fromNullable(value)
}

/**
 * Specialized helper for Date fields.
 * Converts Option<Date> to nullable Date for database storage.
 */
export const dateToNullable = (option: Option.Option<Date>): Date | null => {
  return toNullable(option)
}

/**
 * Maps over an Option<T> and converts the result back to nullable.
 * Useful for transforming values while maintaining the Option context.
 */
export const mapToNullable = <T, U>(
  option: Option.Option<T>, 
  fn: (value: T) => U
): U | null => {
  return Option.match(option, {
    onNone: () => null,
    onSome: fn
  })
}

/**
 * Gets the value from an Option or returns a default value.
 * Useful for providing fallbacks in domain logic.
 */
export const getOrElse = <T>(option: Option.Option<T>, defaultValue: T): T => {
  return Option.getOrElse(option, () => defaultValue)
}

/**
 * Gets the value from an Option or returns a default value from a function.
 * Lazy evaluation of default value.
 */
export const getOrElseLazy = <T>(option: Option.Option<T>, defaultValueFn: () => T): T => {
  return Option.getOrElse(option, defaultValueFn)
}

/**
 * Checks if an Option is present (Some).
 * Useful for conditional logic in domain methods.
 */
export const isSome = <T>(option: Option.Option<T>): boolean => {
  return Option.isSome(option)
}

/**
 * Checks if an Option is absent (None).
 * Useful for conditional logic in domain methods.
 */
export const isNone = <T>(option: Option.Option<T>): boolean => {
  return Option.isNone(option)
}

/**
 * Converts an array of nullable values to an array of Options.
 * Useful for batch processing of nullable data.
 */
export const arrayFromNullable = <T>(values: (T | null | undefined)[]): Option.Option<T>[] => {
  return values.map(fromNullable)
}

/**
 * Filters out None values from an array of Options, keeping only Some values.
 * Useful for processing arrays of optional data.
 */
export const compact = <T>(options: Option.Option<T>[]): T[] => {
  return options
    .filter(Option.isSome)
    .map(option => option.value)
}

/**
 * Maps over an array of Options, applying a function to Some values and skipping None values.
 * Returns an array of the results.
 */
export const mapSome = <T, U>(
  options: Option.Option<T>[],
  fn: (value: T) => U
): U[] => {
  return options
    .filter(Option.isSome)
    .map(option => fn(option.value))
}

/**
 * Creates an Option from a value that might be falsy.
 * Converts empty strings, 0, false, etc. to None, but keeps other falsy values like "" as Some("").
 */
export const fromFalsy = <T>(value: T): Option.Option<T> => {
  if (value === null || value === undefined) {
    return Option.none()
  }
  return Option.some(value)
}

/**
 * Creates an Option from a value that might be empty (for strings and arrays).
 * Converts empty strings and arrays to None.
 */
export const fromEmpty = <T extends string | unknown[]>(value: T): Option.Option<T> => {
  if (value === null || value === undefined) {
    return Option.none()
  }
  if (typeof value === 'string' && value.trim() === '') {
    return Option.none()
  }
  if (Array.isArray(value) && value.length === 0) {
    return Option.none()
  }
  return Option.some(value)
}

/**
 * Normalizes a value that might be null, undefined, or empty to Option<T>.
 * This is a comprehensive normalization function that handles all edge cases.
 */
export const normalizeToOption = <T>(value: T | null | undefined): Option.Option<T> => {
  if (value === null || value === undefined) {
    return Option.none()
  }
  
  // Handle empty strings
  if (typeof value === 'string' && value.trim() === '') {
    return Option.none()
  }
  
  // Handle empty arrays
  if (Array.isArray(value) && value.length === 0) {
    return Option.none()
  }
  
  return Option.some(value)
}

/**
 * Denormalizes an Option<T> to a value that can be stored in external systems.
 * This is the counterpart to normalizeToOption for outgoing data.
 */
export const denormalizeFromOption = <T>(option: Option.Option<T>): T | null => {
  return toNullable(option)
}
