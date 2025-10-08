import { Schema as S } from "effect"

/**
 * Email validation schema using Effect Schema for consistent validation.
 * This is the single source of truth for email validation rules.
 */
export const EmailAddress = S.String.pipe(
  S.filter((s) => s.trim().length > 0, { message: () => "Email cannot be empty" }),
  S.filter((s) => s.length <= 254, { message: () => "Email cannot exceed 254 characters" }),
  S.filter((s) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(s);
  }, { message: () => "Invalid email format" }),
  S.brand("EmailAddress")
)
export type EmailAddress = S.Schema.Type<typeof EmailAddress>

export const makeEmailAddress = (input: unknown) => {
  // Normalize if it's a string
  const normalized = typeof input === 'string' ? input.toLowerCase().trim() : input
  return S.decodeUnknown(EmailAddress)(normalized)
}

/**
 * Utility functions for working with EmailAddress values
 */
export const getEmailDomain = (email: EmailAddress): string => {
  const parts = email.split('@')
  return parts[1] || ''
}

export const getEmailLocalPart = (email: EmailAddress): string => {
  const parts = email.split('@')
  return parts[0] || ''
}
