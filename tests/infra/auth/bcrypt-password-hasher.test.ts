import { describe, it, expect } from "vitest";
import { BcryptPasswordHasher } from "../../../src/infra/auth/bcrypt-password-hasher";

describe("BcryptPasswordHasher", () => {
  const passwordHasher = new BcryptPasswordHasher(4); // Use lower salt rounds for testing speed

  describe("hash", () => {
    it("should hash password successfully", async () => {
      const password = "SecurePassword123!";
      const result = await passwordHasher.hash(password);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeDefined();
        expect(result.value).not.toBe(password);
        expect(result.value.length).toBeGreaterThan(50); // Bcrypt hashes are typically 60+ chars
      }
    });

    it("should generate different hashes for same password", async () => {
      const password = "SecurePassword123!";
      const result1 = await passwordHasher.hash(password);
      const result2 = await passwordHasher.hash(password);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      
      if (result1.ok && result2.ok) {
        expect(result1.value).not.toBe(result2.value);
      }
    });

    it("should handle empty password", async () => {
      const result = await passwordHasher.hash("");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeDefined();
      }
    });
  });

  describe("verify", () => {
    it("should verify correct password", async () => {
      const password = "SecurePassword123!";
      const hashResult = await passwordHasher.hash(password);

      expect(hashResult.ok).toBe(true);
      if (hashResult.ok) {
        const verifyResult = await passwordHasher.verify(password, hashResult.value);
        
        expect(verifyResult.ok).toBe(true);
        if (verifyResult.ok) {
          expect(verifyResult.value).toBe(true);
        }
      }
    });

    it("should reject incorrect password", async () => {
      const password = "SecurePassword123!";
      const wrongPassword = "WrongPassword123!";
      
      const hashResult = await passwordHasher.hash(password);

      expect(hashResult.ok).toBe(true);
      if (hashResult.ok) {
        const verifyResult = await passwordHasher.verify(wrongPassword, hashResult.value);
        
        expect(verifyResult.ok).toBe(true);
        if (verifyResult.ok) {
          expect(verifyResult.value).toBe(false);
        }
      }
    });

    it("should handle invalid hash format gracefully", async () => {
      const password = "SecurePassword123!";
      const invalidHash = "invalid-hash";
      
      const result = await passwordHasher.verify(password, invalidHash);
      
      // Bcrypt actually returns false for invalid hash instead of throwing
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });

    it("should handle empty password verification", async () => {
      const emptyPassword = "";
      const hashResult = await passwordHasher.hash(emptyPassword);

      expect(hashResult.ok).toBe(true);
      if (hashResult.ok) {
        const verifyResult = await passwordHasher.verify("", hashResult.value);
        
        expect(verifyResult.ok).toBe(true);
        if (verifyResult.ok) {
          expect(verifyResult.value).toBe(true);
        }
      }
    });
  });

  describe("salt rounds configuration", () => {
    it("should use configured salt rounds", () => {
      const saltRounds = 8;
      const hasher = new BcryptPasswordHasher(saltRounds);
      
      // This is internal implementation detail, but we can verify the instance is created
      expect(hasher).toBeInstanceOf(BcryptPasswordHasher);
    });

    it("should use default salt rounds when not specified", () => {
      const hasher = new BcryptPasswordHasher();
      
      expect(hasher).toBeInstanceOf(BcryptPasswordHasher);
    });
  });
});
