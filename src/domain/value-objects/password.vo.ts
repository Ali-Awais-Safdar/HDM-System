import { z } from "zod";
import { Result, ok, err } from "../../shared/result/result";

/**
 * Password validation schema using Zod for consistent validation.
 */
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .max(128, "Password cannot exceed 128 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/\d/, "Password must contain at least one number")
  .regex(/[!@#$%^&*(),.?":{}|<>]/, "Password must contain at least one special character");

/**
 * Password value object with validation rules.
 * Ensures strong password requirements are enforced at the domain level using Zod schemas.
 */
export class Password {
  private constructor(private readonly _value: string) {}

  static create(value: string): Result<Password, Error> {
    try {
      const validatedPassword = passwordSchema.parse(value);
      return ok(new Password(validatedPassword));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return err(new Error(error.issues[0]?.message || "Validation error"));
      }
      return err(error as Error);
    }
  }

  get value(): string {
    return this._value;
  }

  equals(other: Password): boolean {
    return this._value === other._value;
  }
}
