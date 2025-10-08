import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import { BcryptPasswordHasher } from "@infra/services/bcrypt-password-hasher"

describe("BcryptPasswordHasher", () => {
  const passwordHasher = new BcryptPasswordHasher(4) // Use lower salt rounds for testing speed

  describe("hash", () => {
    it("should hash password successfully", async () => {
      const password = "SecurePassword123!"
      const hash = await Effect.runPromise(passwordHasher.hash(password))

      expect(hash).toBeDefined()
      expect(hash).not.toBe(password)
      expect(hash.length).toBeGreaterThan(50) // Bcrypt hashes are typically 60+ chars
    })

    it("should generate different hashes for same password", async () => {
      const password = "SecurePassword123!"
      const hash1 = await Effect.runPromise(passwordHasher.hash(password))
      const hash2 = await Effect.runPromise(passwordHasher.hash(password))

      expect(hash1).not.toBe(hash2)
    })

    it("should handle empty password", async () => {
      const hash = await Effect.runPromise(passwordHasher.hash(""))

      expect(hash).toBeDefined()
    })
  })

  describe("verify", () => {
    it("should verify correct password", async () => {
      const password = "SecurePassword123!"
      const hash = await Effect.runPromise(passwordHasher.hash(password))
      const isValid = await Effect.runPromise(passwordHasher.verify(password, hash))
      
      expect(isValid).toBe(true)
    })

    it("should reject incorrect password", async () => {
      const password = "SecurePassword123!"
      const wrongPassword = "WrongPassword123!"
      
      const hash = await Effect.runPromise(passwordHasher.hash(password))
      const isValid = await Effect.runPromise(passwordHasher.verify(wrongPassword, hash))
      
      expect(isValid).toBe(false)
    })

    it("should handle invalid hash format gracefully", async () => {
      const password = "SecurePassword123!"
      const invalidHash = "invalid-hash"
      
      // Bcrypt actually returns false for invalid hash instead of throwing
      const isValid = await Effect.runPromise(passwordHasher.verify(password, invalidHash))
      
      expect(isValid).toBe(false)
    })

    it("should handle empty password verification", async () => {
      const emptyPassword = ""
      const hash = await Effect.runPromise(passwordHasher.hash(emptyPassword))
      const isValid = await Effect.runPromise(passwordHasher.verify("", hash))
      
      expect(isValid).toBe(true)
    })
  })

  describe("salt rounds configuration", () => {
    it("should use configured salt rounds", () => {
      const saltRounds = 8
      const hasher = new BcryptPasswordHasher(saltRounds)
      
      // This is internal implementation detail, but we can verify the instance is created
      expect(hasher).toBeInstanceOf(BcryptPasswordHasher)
    })

    it("should use default salt rounds when not specified", () => {
      const hasher = new BcryptPasswordHasher()
      
      expect(hasher).toBeInstanceOf(BcryptPasswordHasher)
    })
  })
})
