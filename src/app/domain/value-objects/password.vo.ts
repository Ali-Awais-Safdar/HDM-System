import { Schema as S } from "effect"

/**
 * Password policy configuration for domain-level validation.
 */
export const PASSWORD_POLICY = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBERS: true,
  REQUIRE_SPECIAL_CHARS: true,
  SPECIAL_CHARS: /[!@#$%^&*(),.?":{}|<>]/
} as const

/**
 * Password value object with comprehensive policy validation.
 * This represents the domain concept of a password with business rules.
 */
export const Password = S.String.pipe(
  S.filter((s) => s.length >= PASSWORD_POLICY.MIN_LENGTH, { 
    message: () => `Password must be at least ${PASSWORD_POLICY.MIN_LENGTH} characters long` 
  }),
  S.filter((s) => s.length <= PASSWORD_POLICY.MAX_LENGTH, { 
    message: () => `Password cannot exceed ${PASSWORD_POLICY.MAX_LENGTH} characters` 
  }),
  S.filter((s) => !PASSWORD_POLICY.REQUIRE_UPPERCASE || /[A-Z]/.test(s), { 
    message: () => "Password must contain at least one uppercase letter" 
  }),
  S.filter((s) => !PASSWORD_POLICY.REQUIRE_LOWERCASE || /[a-z]/.test(s), { 
    message: () => "Password must contain at least one lowercase letter" 
  }),
  S.filter((s) => !PASSWORD_POLICY.REQUIRE_NUMBERS || /\d/.test(s), { 
    message: () => "Password must contain at least one number" 
  }),
  S.filter((s) => !PASSWORD_POLICY.REQUIRE_SPECIAL_CHARS || PASSWORD_POLICY.SPECIAL_CHARS.test(s), { 
    message: () => "Password must contain at least one special character" 
  }),
  S.brand("Password")
)

export type Password = S.Schema.Type<typeof Password>

export const makePassword = (input: unknown) => S.decodeUnknown(Password)(input)
