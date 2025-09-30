import { Schema as S } from "effect"

/**
 * Password validation schema using Effect Schema for consistent validation.
 */
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

// Factory function for creating Password from unknown input
export const makePassword = (input: unknown) => S.decodeUnknownSync(Password)(input)

/**
 * Password value object with validation rules.
 * Ensures strong password requirements are enforced at the domain level using Effect Schema.
 */
export class PasswordVO {
  private constructor(private readonly _value: Password) {}

  static create(value: string): PasswordVO {
    const validatedPassword = S.decodeUnknownSync(Password)(value);
    return new PasswordVO(validatedPassword);
  }

  get value(): Password {
    return this._value;
  }

  equals(other: PasswordVO): boolean {
    return this._value === other._value;
  }
}
