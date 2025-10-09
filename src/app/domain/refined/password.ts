import { Schema as S } from "effect"

export const PASSWORD_POLICY = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBERS: true,
  REQUIRE_SPECIAL_CHARS: true,
  SPECIAL_CHARS: /[!@#$%^&*(),.?":{}|<>]/
} as const

export const Password = S.String.pipe(
  S.filter(
    (value) => value.length >= PASSWORD_POLICY.MIN_LENGTH,
    { message: () => `Password must be at least ${PASSWORD_POLICY.MIN_LENGTH} characters long` }
  ),
  S.filter(
    (value) => value.length <= PASSWORD_POLICY.MAX_LENGTH,
    { message: () => `Password cannot exceed ${PASSWORD_POLICY.MAX_LENGTH} characters` }
  ),
  S.filter(
    (value) => !PASSWORD_POLICY.REQUIRE_UPPERCASE || /[A-Z]/.test(value),
    { message: () => "Password must contain at least one uppercase letter" }
  ),
  S.filter(
    (value) => !PASSWORD_POLICY.REQUIRE_LOWERCASE || /[a-z]/.test(value),
    { message: () => "Password must contain at least one lowercase letter" }
  ),
  S.filter(
    (value) => !PASSWORD_POLICY.REQUIRE_NUMBERS || /\d/.test(value),
    { message: () => "Password must contain at least one number" }
  ),
  S.filter(
    (value) =>
      !PASSWORD_POLICY.REQUIRE_SPECIAL_CHARS ||
      PASSWORD_POLICY.SPECIAL_CHARS.test(value),
    { message: () => "Password must contain at least one special character" }
  ),
  S.brand("Password")
)

export type Password = S.Schema.Type<typeof Password>

export const makePassword = (input: unknown) => S.decodeUnknown(Password)(input)
export const makePasswordSync = (input: unknown) =>
  S.decodeUnknownSync(Password)(input)
