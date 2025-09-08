import { describe, it, expect } from "vitest";
import { Password } from "../../../src/domain/value-objects/password.vo";

describe("Password Value Object", () => {
  describe("creation", () => {
    it("should create password with valid input", () => {
      const validPassword = "SecurePass123!";
      const result = Password.create(validPassword);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.value).toBe(validPassword);
      }
    });

    it("should accept password with all required character types", () => {
      const password = "MySecure123!";
      const result = Password.create(password);
      expect(result.ok).toBe(true);
    });
  });

  describe("validation", () => {
    it("should return error for password shorter than 8 characters", () => {
      const result = Password.create("Short1!");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Password must be at least 8 characters long");
      }
    });

    it("should return error for password without uppercase letter", () => {
      const result = Password.create("lowercase123!");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Password must contain at least one uppercase letter");
      }
    });

    it("should return error for password without lowercase letter", () => {
      const result = Password.create("UPPERCASE123!");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Password must contain at least one lowercase letter");
      }
    });

    it("should return error for password without number", () => {
      const result = Password.create("NoNumbers!");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Password must contain at least one number");
      }
    });

    it("should return error for password without special character", () => {
      const result = Password.create("NoSpecialChars123");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Password must contain at least one special character");
      }
    });

    it("should return error for password longer than 128 characters", () => {
      const longPassword = "A".repeat(125) + "1a!"; // 128 characters
      const result = Password.create(longPassword + "EXTRA");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Password cannot exceed 128 characters");
      }
    });

    it("should return error for empty password", () => {
      const result = Password.create("");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Password must be at least 8 characters long");
      }
    });
  });

  describe("comparison", () => {
    it("should correctly compare equal passwords", () => {
      const result1 = Password.create("SecurePass123!");
      const result2 = Password.create("SecurePass123!");
      
      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      if (result1.ok && result2.ok) {
        expect(result1.value.equals(result2.value)).toBe(true);
      }
    });

    it("should correctly compare different passwords", () => {
      const result1 = Password.create("SecurePass123!");
      const result2 = Password.create("DifferentPass456@");
      
      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      if (result1.ok && result2.ok) {
        expect(result1.value.equals(result2.value)).toBe(false);
      }
    });
  });
});
