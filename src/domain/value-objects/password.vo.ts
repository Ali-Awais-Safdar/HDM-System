/**
 * Password value object with validation rules.
 * Ensures strong password requirements are enforced at the domain level.
 */
export class Password {
  private constructor(private readonly _value: string) {}

  static create(value: string): Password {
    Password.validate(value);
    return new Password(value);
  }

  private static validate(value: string): void {
    if (!value || value.length < 8) {
      throw new Error("Password must be at least 8 characters long");
    }

    if (!/[A-Z]/.test(value)) {
      throw new Error("Password must contain at least one uppercase letter");
    }

    if (!/[a-z]/.test(value)) {
      throw new Error("Password must contain at least one lowercase letter");
    }

    if (!/\d/.test(value)) {
      throw new Error("Password must contain at least one number");
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(value)) {
      throw new Error("Password must contain at least one special character");
    }

    if (value.length > 128) {
      throw new Error("Password cannot exceed 128 characters");
    }
  }

  get value(): string {
    return this._value;
  }

  equals(other: Password): boolean {
    return this._value === other._value;
  }
}
