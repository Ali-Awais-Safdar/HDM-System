import { Schema as S } from "effect"

export const Password = S.String.pipe(
  S.filter((s) => s.length >= 8, { message: () => "Password must be at least 8 characters long" }),
  S.filter((s) => s.length <= 128, { message: () => "Password cannot exceed 128 characters" }),
  S.filter((s) => /[A-Z]/.test(s), { message: () => "Password must contain at least one uppercase letter" }),
  S.filter((s) => /[a-z]/.test(s), { message: () => "Password must contain at least one lowercase letter" }),
  S.filter((s) => /\d/.test(s), { message: () => "Password must contain at least one number" }),
  S.filter((s) => /[!@#$%^&*(),.?":{}|<>]/.test(s), { message: () => "Password must contain at least one special character" }),
  S.brand("Password")
)
export type Password = S.Schema.Type<typeof Password>

export const makePassword = (input: unknown) => S.decodeUnknown(Password)(input)
