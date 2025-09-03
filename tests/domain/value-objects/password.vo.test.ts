import { describe, it, expect } from "vitest";
import { Password } from "../../../src/domain/value-objects/password.vo";

describe("Password Value Object", () => {
  describe("creation", () => {
    it("should create password with valid input", () => {
      const validPassword = "SecurePass123!";
      const password = Password.create(validPassword);
      
      expect(password.value).toBe(validPassword);
    });

    it("should accept password with all required character types", () => {
      const password = "MySecure123!";
      expect(() => Password.create(password)).not.toThrow();
    });
  });

  describe("validation", () => {
    it("should throw error for password shorter than 8 characters", () => {
      expect(() => Password.create("Short1!")).toThrow("Password must be at least 8 characters long");
    });

    it("should throw error for password without uppercase letter", () => {
      expect(() => Password.create("lowercase123!")).toThrow("Password must contain at least one uppercase letter");
    });

    it("should throw error for password without lowercase letter", () => {
      expect(() => Password.create("UPPERCASE123!")).toThrow("Password must contain at least one lowercase letter");
    });

    it("should throw error for password without number", () => {
      expect(() => Password.create("NoNumbers!")).toThrow("Password must contain at least one number");
    });

    it("should throw error for password without special character", () => {
      expect(() => Password.create("NoSpecialChars123")).toThrow("Password must contain at least one special character");
    });

    it("should throw error for password longer than 128 characters", () => {
      const longPassword = "A".repeat(125) + "1a!"; // 128 characters
      expect(() => Password.create(longPassword + "EXTRA")).toThrow("Password cannot exceed 128 characters");
    });

    it("should throw error for empty password", () => {
      expect(() => Password.create("")).toThrow("Password must be at least 8 characters long");
    });
  });

  describe("comparison", () => {
    it("should correctly compare equal passwords", () => {
      const password1 = Password.create("SecurePass123!");
      const password2 = Password.create("SecurePass123!");
      
      expect(password1.equals(password2)).toBe(true);
    });

    it("should correctly compare different passwords", () => {
      const password1 = Password.create("SecurePass123!");
      const password2 = Password.create("DifferentPass456@");
      
      expect(password1.equals(password2)).toBe(false);
    });
  });
});
