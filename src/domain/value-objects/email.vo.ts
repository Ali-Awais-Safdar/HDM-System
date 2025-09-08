import { z } from "zod";
import { EmailAddress, asEmailAddress } from "../../shared/types/brand";
import { Result, ok, err } from "../../shared/result/result";

/**
 * Email validation schema using Zod for consistent validation.
 */
const emailSchema = z
  .string()
  .min(1, "Email cannot be empty")
  .email("Invalid email format")
  .max(254, "Email cannot exceed 254 characters");

/**
 * Email value object with validation rules.
 * Ensures valid email format and normalization using Zod schemas.
 */
export class Email {
  private constructor(private readonly _value: EmailAddress) {}

  static create(value: string): Result<Email, Error> {
    try {
      // Normalize the email first
      const normalized = value.toLowerCase().trim();
      
      // Validate the normalized email
      const validated = emailSchema.parse(normalized);
      return ok(new Email(asEmailAddress(validated)));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return err(new Error(error.issues[0]?.message || "Validation error"));
      }
      return err(error as Error);
    }
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
