import { describe, it, expect } from "vitest"
//
import { DownloadTokenEntity } from "@domain/downloadToken/download-token.entity"
import { DownloadTokenValidationError, DownloadTokenAlreadyUsedError } from "@domain/downloadToken/download-token.error"
import { generateDownloadToken, createDownloadTokenEntity } from "../factories/download-token.factory"
import { expectSuccess, expectFailure } from "../../utils/test.helpers"
import { withTestClock } from "../setup/test-clock"
import { BusinessRuleViolationError } from "@domain/utils/base.errors"

describe("DownloadTokenEntity", () => {
  describe("creation", () => {
    it("creates successfully with valid data", () => {
      const token = expectSuccess(DownloadTokenEntity.create(generateDownloadToken()))
      expect(token.token).toBeDefined()
      expect(token.createdAt).toBeInstanceOf(Date)
      expect(token.expiresAt).toBeInstanceOf(Date)
      expect(token.hasBeenUsed).toBe(false)
    })

    it("fails with invalid token format", () => {
      const bad = generateDownloadToken({ token: " short invalid token " as any })
      const error = expectFailure(
        DownloadTokenEntity.create(bad),
        DownloadTokenValidationError
      )
      expect(error.code).toBe("DOWNLOAD_TOKEN_VALIDATION_ERROR")
      expect(error.message).toMatch(/Token must be URL-safe base64/)
    })

    it("fails when expiry is in the past", () => {
      const past = new Date(Date.now() - 60_000).toISOString()
      const bad = generateDownloadToken({ expiresAt: past })
      const error = expectFailure(
        DownloadTokenEntity.create(bad),
        DownloadTokenValidationError
      )
      expect(error.message).toMatch(/Expiry must be in the future/)
    })
  })

  describe("expiry and validity (with test clock)", () => {
    it("isExpired and isValid reflect time before and after expiry", () => {
      // Set a fixed expiry time
      const expiry = new Date("2025-01-03T01:00:00.000Z")
      const issuedAt = new Date("2025-01-03T00:00:00.000Z")
      const entity = createDownloadTokenEntity({ expiresAt: expiry.toISOString(), createdAt: issuedAt.toISOString() })

      // Before expiry
      const beforeMs = Date.parse("2025-01-03T00:59:00.000Z") // 1 minute before
      const expiredBefore = expectSuccess(withTestClock(entity.isExpired(), beforeMs))
      const validBefore = expectSuccess(withTestClock(entity.isValid(), beforeMs))
      expect(expiredBefore).toBe(false)
      expect(validBefore).toBe(true)

      // After expiry
      const afterMs = Date.parse("2025-01-03T01:00:30.000Z") // 30s after
      const expiredAfter = expectSuccess(withTestClock(entity.isExpired(), afterMs))
      const validAfter = expectSuccess(withTestClock(entity.isValid(), afterMs))
      expect(expiredAfter).toBe(true)
      expect(validAfter).toBe(false)
    })
  })

  describe("time to expiry calculations", () => {
    it("millisecondsUntilExpiry returns remaining ms clamped at 0", () => {
      const expiry = new Date("2025-01-03T01:00:00.000Z")
      const entity = createDownloadTokenEntity({ expiresAt: expiry.toISOString() })

      // 2.5 seconds before expiry
      const beforeMs = Date.parse("2025-01-03T00:59:57.500Z")
      const msLeft = expectSuccess(withTestClock(entity.millisecondsUntilExpiry(), beforeMs))
      expect(msLeft).toBe(2500)

      // After expiry → clamped to 0
      const afterMs = Date.parse("2025-01-03T01:00:01.000Z")
      const msLeftAfter = expectSuccess(withTestClock(entity.millisecondsUntilExpiry(), afterMs))
      expect(msLeftAfter).toBe(0)
    })

    it("secondsUntilExpiry returns floored seconds from remaining ms", () => {
      const expiry = new Date("2025-01-03T01:00:00.000Z")
      const entity = createDownloadTokenEntity({ expiresAt: expiry.toISOString() })

      // 2.9 seconds before expiry → floor to 2
      const beforeMs = Date.parse("2025-01-03T00:59:57.100Z")
      const secsLeft = expectSuccess(withTestClock(entity.secondsUntilExpiry(), beforeMs))
      expect(secsLeft).toBe(2)

      // After expiry → 0
      const afterMs = Date.parse("2025-01-03T01:00:00.500Z")
      const secsLeftAfter = expectSuccess(withTestClock(entity.secondsUntilExpiry(), afterMs))
      expect(secsLeftAfter).toBe(0)
    })
  })

  describe("markAsUsed and validateForUse", () => {
    it("markAsUsed succeeds once, then fails with DownloadTokenAlreadyUsedError on repeat", () => {
      const expiry = new Date("2025-01-03T01:00:00.000Z")
      const issuedAt = new Date("2025-01-03T00:00:00.000Z")
      const entity = createDownloadTokenEntity({ expiresAt: expiry.toISOString(), createdAt: issuedAt.toISOString() })

      // Use the token before expiry
      const beforeMs = Date.parse("2025-01-03T00:10:00.000Z")
      const used = expectSuccess(withTestClock(entity.markAsUsed(), beforeMs))
      expect(used.hasBeenUsed).toBe(true)

      // Repeat should fail
      const err = expectFailure(
        withTestClock(used.markAsUsed(), beforeMs) as any,
        DownloadTokenAlreadyUsedError
      )
      expect(err.code).toBe("DOWNLOAD_TOKEN_ALREADY_USED")
    })

    it("markAsUsed fails with BusinessRuleViolationError when token is expired", () => {
      const expiry = new Date("2025-01-03T01:00:00.000Z")
      const entity = createDownloadTokenEntity({ expiresAt: expiry.toISOString() })

      // Move time after expiry
      const afterMs = Date.parse("2025-01-03T01:05:00.000Z")
      const err = expectFailure(
        withTestClock(entity.markAsUsed(), afterMs) as any,
        BusinessRuleViolationError
      )
      expect(err.code).toBe("BUSINESS_RULE_VIOLATION")
    })

    it("validateForUse fails for user mismatch with BusinessRuleViolationError", () => {
      const expiry = new Date("2025-01-03T01:00:00.000Z")
      const issuedAt = new Date("2025-01-03T00:00:00.000Z")
      const entity = createDownloadTokenEntity({ expiresAt: expiry.toISOString(), createdAt: issuedAt.toISOString() })

      const beforeMs = Date.parse("2025-01-03T00:30:00.000Z")
      const err = expectFailure(
        withTestClock(entity.validateForUse("some-other-user" as any), beforeMs) as any,
        BusinessRuleViolationError
      )
      expect(err.code).toBe("BUSINESS_RULE_VIOLATION")
    })

    it("validateForUse fails for expiry with BusinessRuleViolationError", () => {
      const expiry = new Date("2025-01-03T01:00:00.000Z")
      const entity = createDownloadTokenEntity({ expiresAt: expiry.toISOString() })

      // After expiry
      const afterMs = Date.parse("2025-01-03T01:10:00.000Z")
      const err = expectFailure(
        withTestClock(entity.validateForUse(entity.issuedTo), afterMs) as any,
        BusinessRuleViolationError
      )
      expect(err.code).toBe("BUSINESS_RULE_VIOLATION")
    })
  })
})


