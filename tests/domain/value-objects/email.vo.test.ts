import { describe, it, expect } from "vitest";
import { Email } from "../../../src/domain/value-objects/email.vo";

describe("Email Value Object", () => {
  describe("creation", () => {
    it("should create email with valid input", () => {
      const validEmail = "test@example.com";
      const email = Email.create(validEmail);
      
      expect(email.value).toBe(validEmail);
    });

    it("should normalize email to lowercase", () => {
      const email = Email.create("TEST@EXAMPLE.COM");
      expect(email.value).toBe("test@example.com");
    });

    it("should trim whitespace", () => {
      const email = Email.create("  test@example.com  ");
      expect(email.value).toBe("test@example.com");
    });
  });

  describe("validation", () => {
    it("should throw error for empty email", () => {
      expect(() => Email.create("")).toThrow("Email cannot be empty");
    });

    it("should throw error for invalid email format", () => {
      expect(() => Email.create("invalid-email")).toThrow("Invalid email format");
    });

    it("should throw error for email without @ symbol", () => {
      expect(() => Email.create("testexample.com")).toThrow("Invalid email format");
    });

    it("should throw error for email without domain", () => {
      expect(() => Email.create("test@")).toThrow("Invalid email format");
    });

    it("should throw error for email without local part", () => {
      expect(() => Email.create("@example.com")).toThrow("Invalid email format");
    });

    it("should throw error for email longer than 254 characters", () => {
      const longLocalPart = "a".repeat(250);
      const longEmail = `${longLocalPart}@example.com`;
      expect(() => Email.create(longEmail)).toThrow("Email cannot exceed 254 characters");
    });
  });

  describe("domain and local part extraction", () => {
    it("should extract domain correctly", () => {
      const email = Email.create("user@example.com");
      expect(email.domain).toBe("example.com");
    });

    it("should extract local part correctly", () => {
      const email = Email.create("user@example.com");
      expect(email.localPart).toBe("user");
    });

    it("should handle complex email addresses", () => {
      const email = Email.create("user.name+tag@subdomain.example.com");
      expect(email.localPart).toBe("user.name+tag");
      expect(email.domain).toBe("subdomain.example.com");
    });
  });

  describe("comparison", () => {
    it("should correctly compare equal emails", () => {
      const email1 = Email.create("test@example.com");
      const email2 = Email.create("test@example.com");
      
      expect(email1.equals(email2)).toBe(true);
    });

    it("should correctly compare different emails", () => {
      const email1 = Email.create("test1@example.com");
      const email2 = Email.create("test2@example.com");
      
      expect(email1.equals(email2)).toBe(false);
    });

    it("should compare normalized emails", () => {
      const email1 = Email.create("TEST@EXAMPLE.COM");
      const email2 = Email.create("test@example.com");
      
      expect(email1.equals(email2)).toBe(true);
    });
  });

  describe("toString", () => {
    it("should return email string representation", () => {
      const email = Email.create("test@example.com");
      expect(email.toString()).toBe("test@example.com");
    });
  });
});
