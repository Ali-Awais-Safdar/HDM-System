import { describe, it, expect } from "vitest";
import { Jwt, JwtPayload } from "../../../src/domain/value-objects/jwt.vo";
import { asUserId } from "../../../src/shared/types/brand";

describe("JWT Value Object", () => {
  const validPayload: JwtPayload = {
    sub: asUserId("01234567-89ab-cdef-0123-456789abcdef"),
    email: "test@example.com",
    role: "user",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
  };

  const validToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

  describe("creation", () => {
    it("should create JWT with valid payload and token", () => {
      const result = Jwt.create(validPayload, validToken);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.payload).toEqual(validPayload);
        expect(result.value.token).toBe(validToken);
        expect(result.value.userId).toBe(validPayload.sub);
        expect(result.value.email).toBe(validPayload.email);
        expect(result.value.role).toBe(validPayload.role);
      }
    });
  });

  describe("validation", () => {
    it("should return error for missing subject", () => {
      const invalidPayload = { ...validPayload, sub: undefined as any };
      const result = Jwt.create(invalidPayload, validToken);
      expect(result.ok).toBe(false);
    });

    it("should return error for missing email", () => {
      const invalidPayload = { ...validPayload, email: undefined as any };
      const result = Jwt.create(invalidPayload, validToken);
      expect(result.ok).toBe(false);
    });

    it("should return error for invalid role", () => {
      const invalidPayload = { ...validPayload, role: "invalid" as any };
      const result = Jwt.create(invalidPayload, validToken);
      expect(result.ok).toBe(false);
    });

    it("should return error for missing role", () => {
      const invalidPayload = { ...validPayload, role: undefined as any };
      const result = Jwt.create(invalidPayload, validToken);
      expect(result.ok).toBe(false);
    });

    it("should return error for invalid issued at time", () => {
      const invalidPayload = { ...validPayload, iat: 0 };
      const result = Jwt.create(invalidPayload, validToken);
      expect(result.ok).toBe(false);
    });

    it("should return error for missing issued at time", () => {
      const invalidPayload = { ...validPayload, iat: undefined as any };
      const result = Jwt.create(invalidPayload, validToken);
      expect(result.ok).toBe(false);
    });

    it("should return error for invalid expiration time", () => {
      const invalidPayload = { ...validPayload, exp: validPayload.iat - 1 };
      const result = Jwt.create(invalidPayload, validToken);
      expect(result.ok).toBe(false);
    });

    it("should return error for missing expiration time", () => {
      const invalidPayload = { ...validPayload, exp: undefined as any };
      const result = Jwt.create(invalidPayload, validToken);
      expect(result.ok).toBe(false);
    });
  });

  describe("expiration checks", () => {
    it("should correctly identify non-expired token", () => {
      const result = Jwt.create(validPayload, validToken);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isExpired()).toBe(false);
      }
    });

    it("should correctly identify expired token", () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredPayload = {
        ...validPayload,
        iat: now - 7200, // 2 hours ago
        exp: now - 3600  // 1 hour ago  
      };
      const result = Jwt.create(expiredPayload, validToken);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isExpired()).toBe(true);
      }
    });

    it("should calculate expiration time correctly", () => {
      const result = Jwt.create(validPayload, validToken);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const expiresIn = result.value.expiresIn();
        expect(expiresIn).toBeGreaterThan(0);
        expect(expiresIn).toBeLessThanOrEqual(3600 * 1000); // Should be less than or equal to 1 hour in ms
      }
    });

    it("should return 0 for expired token expiration time", () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredPayload = {
        ...validPayload,
        iat: now - 7200, // 2 hours ago
        exp: now - 3600  // 1 hour ago
      };
      const result = Jwt.create(expiredPayload, validToken);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.expiresIn()).toBe(0);
      }
    });
  });

  describe("role validation", () => {
    it("should accept admin role", () => {
      const adminPayload = { ...validPayload, role: "admin" as const };
      const result = Jwt.create(adminPayload, validToken);
      expect(result.ok).toBe(true);
    });

    it("should accept user role", () => {
      const userPayload = { ...validPayload, role: "user" as const };
      const result = Jwt.create(userPayload, validToken);
      expect(result.ok).toBe(true);
    });
  });
});
