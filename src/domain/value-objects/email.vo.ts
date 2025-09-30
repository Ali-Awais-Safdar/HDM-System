import { Schema as S } from "effect"

/**
 * Email validation schema using Effect Schema for consistent validation.
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

// Factory function for creating EmailAddress from unknown input
export const makeEmailAddress = (input: unknown) => S.decodeUnknownSync(EmailAddress)(input)

/**
 * Email value object with validation rules.
 * Ensures valid email format and normalization using Effect Schema.
 */
export class Email {
  private constructor(private readonly _value: EmailAddress) {}

  static create(value: string): Email {
    // Normalize the email first
    const normalized = value.toLowerCase().trim();
    
    // Validate the normalized email using Effect Schema
    const validated = S.decodeUnknownSync(EmailAddress)(normalized);
    return new Email(validated);
  }

  get value(): EmailAddress {
    return this._value;
  }

  get domain(): string {
    const parts = this._value.split('@');
    return parts[1] || '';
  }

  get localPart(): string {
    const parts = this._value.split('@');
    return parts[0] || '';
  }

  equals(other: Email): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
