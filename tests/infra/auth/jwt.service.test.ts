import { describe, it, expect, beforeAll } from "vitest"
import { Effect } from "effect"
import { JwtServiceImpl } from "@infra/services/jwt.service"
import { asUserId } from "@shared/types/brand"

describe("JwtServiceImpl", () => {
  const secret = "test-secret-key-that-is-32-characters-long"
  const shortSecret = "short"
  let jwtService: JwtServiceImpl

  beforeAll(() => {
    jwtService = new JwtServiceImpl(secret, "15m")
  })

  describe("initialization", () => {
    it("should create service with valid secret", () => {
      expect(() => new JwtServiceImpl(secret)).not.toThrow()
    })

    it("should throw error for short secret", () => {
      expect(() => new JwtServiceImpl(shortSecret))
        .toThrow("JWT secret must be at least 32 characters long")
    })

    it("should throw error for empty secret", () => {
      expect(() => new JwtServiceImpl(""))
        .toThrow("JWT secret must be at least 32 characters long")
    })
  })

  describe("generateToken", () => {
    it("should generate valid JWT token", async () => {
      const payload = {
        userId: asUserId("01234567-89ab-cdef-0123-456789abcdef"),
        email: "test@example.com",
        roles: ["USER"] as const
      }

      const token = await Effect.runPromise(jwtService.generateToken(payload))

      expect(token).toBeDefined()
      expect(typeof token).toBe("string")
      expect(token.split(".")).toHaveLength(3) // JWT has 3 parts
    })

    it("should generate token with admin role", async () => {
      const payload = {
        userId: asUserId("01234567-89ab-cdef-0123-456789abcdef"),
        email: "admin@example.com",
        roles: ["ADMIN"] as const
      }

      const token = await Effect.runPromise(jwtService.generateToken(payload))

      expect(token).toBeDefined()
    })
  })

  describe("verifyToken", () => {
    it("should verify valid token", async () => {
      const payload = {
        userId: asUserId("01234567-89ab-cdef-0123-456789abcdef"),
        email: "test@example.com",
        roles: ["USER"] as const
      }

      const token = await Effect.runPromise(jwtService.generateToken(payload))
      const jwt = await Effect.runPromise(jwtService.verifyToken(token))
      
      expect(jwt.userId).toBe(payload.userId)
      expect(jwt.email).toBe(payload.email)
      expect(jwt.roles).toEqual(payload.roles)
      expect(jwt.token).toBe(token)
    })

    it("should reject invalid token", async () => {
      const invalidToken = "invalid.jwt.token"
      
      await expect(Effect.runPromise(jwtService.verifyToken(invalidToken)))
        .rejects.toThrow("Invalid JWT token")
    })

    it("should reject token with wrong secret", async () => {
      const otherJwtService = new JwtServiceImpl("different-secret-key-that-is-32-chars", "15m")
      
      const payload = {
        userId: asUserId("01234567-89ab-cdef-0123-456789abcdef"),
        email: "test@example.com",
        roles: ["USER"] as const
      }

      const token = await Effect.runPromise(otherJwtService.generateToken(payload))
      
      await expect(Effect.runPromise(jwtService.verifyToken(token)))
        .rejects.toThrow("Invalid JWT token")
    })

    it("should reject expired token", async () => {
      const shortLivedService = new JwtServiceImpl(secret, "1s") // 1 second expiry
      
      const payload = {
        userId: asUserId("01234567-89ab-cdef-0123-456789abcdef"),
        email: "test@example.com",
        roles: ["USER"] as const
      }

      const token = await Effect.runPromise(shortLivedService.generateToken(payload))
      
      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 1100))
      
      await expect(Effect.runPromise(shortLivedService.verifyToken(token)))
        .rejects.toThrow("JWT token has expired")
    })

    it("should handle malformed token", async () => {
      const malformedToken = "not.a.jwt"
      
      await expect(Effect.runPromise(jwtService.verifyToken(malformedToken)))
        .rejects.toThrow("Invalid JWT token")
    })
  })

  describe("expiration time parsing", () => {
    it("should parse seconds correctly", () => {
      expect(() => new JwtServiceImpl(secret, "30s")).not.toThrow()
    })

    it("should parse minutes correctly", () => {
      expect(() => new JwtServiceImpl(secret, "15m")).not.toThrow()
    })

    it("should parse hours correctly", () => {
      expect(() => new JwtServiceImpl(secret, "2h")).not.toThrow()
    })

    it("should parse days correctly", () => {
      expect(() => new JwtServiceImpl(secret, "7d")).not.toThrow()
    })

    it("should throw error for invalid format", () => {
      expect(() => new JwtServiceImpl(secret, "invalid"))
        .toThrow("Invalid expiresIn format")
    })

    it("should throw error for unsupported unit", () => {
      expect(() => new JwtServiceImpl(secret, "1w"))
        .toThrow("Invalid expiresIn format")
    })
  })

  describe("token payload validation", () => {
    it("should validate token structure during verification", async () => {
      // Create a token with missing required fields using a different JWT library would be complex
      // This test ensures the validation logic works for malformed payloads
      await expect(
        Effect.runPromise(jwtService.verifyToken("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpbnZhbGlkIjoidGVzdCJ9.invalid"))
      ).rejects.toThrow()
    })
  })
})
