import { describe, it, expect } from "vitest";
import { Email } from "../../../src/domain/value-objects/email.vo";

describe("Email Value Object", () => {
  describe("creation", () => {
    it("should create email with valid input", () => {
      const validEmail = "test@example.com";
      const result = Email.create(validEmail);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.value).toBe(validEmail);
      }
    });

    it("should normalize email to lowercase", () => {
      const result = Email.create("TEST@EXAMPLE.COM");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.value).toBe("test@example.com");
      }
    });

    it("should trim whitespace", () => {
      const result = Email.create("  test@example.com  ");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.value).toBe("test@example.com");
      }
    });
  });

  describe("validation", () => {
    it("should return error for empty email", () => {
      const result = Email.create("");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Email cannot be empty");
      }
    });

    it("should return error for invalid email format", () => {
      const result = Email.create("invalid-email");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Invalid email format");
      }
    });

    it("should return error for email without @ symbol", () => {
      const result = Email.create("testexample.com");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Invalid email format");
      }
    });

    it("should return error for email without domain", () => {
      const result = Email.create("test@");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Invalid email format");
      }
    });

    it("should return error for email without local part", () => {
      const result = Email.create("@example.com");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Invalid email format");
      }
    });

    it("should return error for email longer than 254 characters", () => {
      const longLocalPart = "a".repeat(250);
      const longEmail = `${longLocalPart}@example.com`;
      const result = Email.create(longEmail);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Email cannot exceed 254 characters");
      }
    });
  });

  describe("domain and local part extraction", () => {
    it("should extract domain correctly", () => {
      const result = Email.create("user@example.com");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.domain).toBe("example.com");
      }
    });

    it("should extract local part correctly", () => {
      const result = Email.create("user@example.com");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.localPart).toBe("user");
      }
    });

    it("should handle complex email addresses", () => {
      const result = Email.create("user.name+tag@subdomain.example.com");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.localPart).toBe("user.name+tag");
        expect(result.value.domain).toBe("subdomain.example.com");
      }
    });
  });

  describe("comparison", () => {
    it("should correctly compare equal emails", () => {
      const result1 = Email.create("test@example.com");
      const result2 = Email.create("test@example.com");
      
      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      if (result1.ok && result2.ok) {
        expect(result1.value.equals(result2.value)).toBe(true);
      }
    });

    it("should correctly compare different emails", () => {
      const result1 = Email.create("test1@example.com");
      const result2 = Email.create("test2@example.com");
      
      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      if (result1.ok && result2.ok) {
        expect(result1.value.equals(result2.value)).toBe(false);
      }
    });

    it("should compare normalized emails", () => {
      const result1 = Email.create("TEST@EXAMPLE.COM");
      const result2 = Email.create("test@example.com");
      
      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      if (result1.ok && result2.ok) {
        expect(result1.value.equals(result2.value)).toBe(true);
      }
    });
  });

  describe("toString", () => {
    it("should return email string representation", () => {
      const result = Email.create("test@example.com");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.toString()).toBe("test@example.com");
      }
    });
  });
});
