import { ParseResult } from "effect"

/**
 * Helper to map ParseResult.ParseError to a string message, used when reporting serialization issues.
 */
export const formatParseError = (error: ParseResult.ParseError): string => {
  // Extract error message from ParseResult.ParseError
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }
  return String(error)
}

/**
 * Helper to map ParseResult.ParseError to a custom error type.
 */
export const mapParseError = <E>(
  error: ParseResult.ParseError,
  build: (message: string) => E
): E => build(formatParseError(error))