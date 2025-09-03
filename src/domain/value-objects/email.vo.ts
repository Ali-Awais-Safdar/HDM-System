import { EmailAddress, asEmailAddress } from "../../shared/types/brand";

/**
 * Email value object with validation rules.
 * Ensures valid email format and normalization.
 */
export class Email {
  private constructor(private readonly _value: EmailAddress) {}

  static create(value: string): Email {
    const normalized = Email.normalize(value);
    Email.validate(normalized);
    return new Email(asEmailAddress(normalized));
  }

  private static normalize(value: string): string {
    return value.toLowerCase().trim();
  }

  private static validate(value: string): void {
    if (!value) {
      throw new Error("Email cannot be empty");
    }

    // RFC 5322 compliant email regex (simplified version)
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    if (!emailRegex.test(value)) {
      throw new Error("Invalid email format");
    }

    if (value.length > 254) {
      throw new Error("Email cannot exceed 254 characters");
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
