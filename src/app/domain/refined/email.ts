import { Schema as S } from "effect"

/**
 * Email validation schema using Effect Schema for consistent validation.
 * Provides the single source of truth for email validation rules.
 */
export const EmailAddress = S.String.pipe(
  S.filter((value) => value.trim().length > 0, {
    message: () => "Email cannot be empty"
  }),
  S.filter((value) => value.length <= 254, {
    message: () => "Email cannot exceed 254 characters"
  }),
  S.filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
    message: () => "Invalid email format"
  }),
  S.brand("EmailAddress")
)
export type EmailAddress = S.Schema.Type<typeof EmailAddress>

const normalizeEmail = (input: unknown) =>
  typeof input === "string" ? input.toLowerCase().trim() : input

export const makeEmailAddress = (input: unknown) =>
  S.decodeUnknown(EmailAddress)(normalizeEmail(input))

export const makeEmailAddressSync = (input: unknown) =>
  S.decodeUnknownSync(EmailAddress)(normalizeEmail(input))

export const getEmailDomain = (email: EmailAddress): string => {
  const [, domain = ""] = email.split("@")
  return domain
}

export const getEmailLocalPart = (email: EmailAddress): string => {
  const [local = ""] = email.split("@")
  return local
}
