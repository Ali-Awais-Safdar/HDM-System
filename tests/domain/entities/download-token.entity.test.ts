import { describe, expect, it } from "vitest";
import { DownloadTokenEntity } from "../../../src/app/domain/downloadToken/download-token.entity";
import { ValidationError, BusinessRuleViolationError } from "../../../src/app/domain/utils/domain.errors";
import { 
  generateTestDownloadToken,
  createUnusedToken,
  createUsedToken,
  createExpiringSoonToken,
  downloadTokenArbitrary
} from "../../factories/download-token.factory";
import { TestPatterns } from "../../utils/test.helpers";
import * as fc from "fast-check";

describe("DownloadTokenEntity", () => {
  describe("Creation & Validation", () => {
    it("should create valid download token", () => {
      const tokenData = generateTestDownloadToken();
      const token = TestPatterns.Effect.expectSuccess(DownloadTokenEntity.create(tokenData));

      expect(token).toBeInstanceOf(DownloadTokenEntity);
      expect(token.token).toBeDefined();
      expect(token.token.length).toBeGreaterThanOrEqual(32);
    });

    it("should validate token length", () => {
      const invalidData = generateTestDownloadToken({ token: "short" });
      TestPatterns.Effect.expectFailure(DownloadTokenEntity.create(invalidData), ValidationError);
    });

    it("should validate expiry is in future", () => {
      const pastDate = new Date(Date.now() - 1000).toISOString();
      const invalidData = generateTestDownloadToken({ expiresAt: pastDate });
      TestPatterns.Effect.expectFailure(DownloadTokenEntity.create(invalidData), ValidationError);
    });
  });

  describe("Token State Logic", () => {
    it("should identify unused tokens", () => {
      const token = TestPatterns.Effect.expectSuccess(
        DownloadTokenEntity.create(createUnusedToken())
      );

      expect(token.hasBeenUsed).toBe(false);
      expect(token.isCurrentlyValid).toBe(true);
      expect(token.isValid()).toBe(true);
    });

    it("should identify used tokens", () => {
      // Create a token that was used in the past but hasn't expired yet
      const createdAt = new Date(Date.now() - 2 * 60 * 1000); // 2 min ago
      const usedAt = new Date(Date.now() - 1 * 60 * 1000); // 1 min ago
      const expiresAt = new Date(Date.now() + 3 * 60 * 1000); // 3 min from now (future)
      
      const token = TestPatterns.Effect.expectSuccess(
        DownloadTokenEntity.create(createUsedToken({
          createdAt: createdAt.toISOString(),
          usedAt: { _tag: "Some" as const, value: usedAt.toISOString() },
          expiresAt: expiresAt.toISOString(),
        }))
      );

      expect(token.hasBeenUsed).toBe(true);
      expect(token.isUsed()).toBe(true);
    });

    it("should identify expired tokens", () => {
      // Create token that will expire very soon, then wait for it to expire
      const token = TestPatterns.Effect.expectSuccess(
        DownloadTokenEntity.create(createExpiringSoonToken({
          expiresAt: new Date(Date.now() + 10).toISOString(), // Expires in 10ms
        }))
      );

      // Wait a bit for it to expire (20ms)
      const checkExpired = () => {
        expect(token.hasExpired).toBe(true);
        expect(token.isExpired()).toBe(true);
        expect(token.isCurrentlyValid).toBe(false);
      };
      
      setTimeout(checkExpired, 20);
    });

    it("should calculate time to expiry", () => {
      const token = TestPatterns.Effect.expectSuccess(
        DownloadTokenEntity.create(createExpiringSoonToken())
      );

      expect(token.secondsUntilExpiry).toBeLessThanOrEqual(60);
      expect(token.millisecondsUntilExpiry).toBeGreaterThan(0);
    });
  });

  describe("Token Operations", () => {
    it("should mark token as used", () => {
      const token = TestPatterns.Effect.expectSuccess(
        DownloadTokenEntity.create(createUnusedToken())
      );

      const used = TestPatterns.Effect.expectSuccess(token.markAsUsed());
      expect(used.hasBeenUsed).toBe(true);
    });

    it("should reject marking used token again", () => {
      const createdAt = new Date(Date.now() - 2 * 60 * 1000);
      const usedAt = new Date(Date.now() - 1 * 60 * 1000);
      const expiresAt = new Date(Date.now() + 3 * 60 * 1000);
      
      const token = TestPatterns.Effect.expectSuccess(
        DownloadTokenEntity.create(createUsedToken({
          createdAt: createdAt.toISOString(),
          usedAt: { _tag: "Some" as const, value: usedAt.toISOString() },
          expiresAt: expiresAt.toISOString(),
        }))
      );

      TestPatterns.Effect.expectFailure(
        token.markAsUsed(),
        BusinessRuleViolationError
      );
    });

    it("should reject marking expired token", () => {
      // Token that will expire in 10ms
      const token = TestPatterns.Effect.expectSuccess(
        DownloadTokenEntity.create(createExpiringSoonToken({
          expiresAt: new Date(Date.now() + 10).toISOString(),
        }))
      );

      // Wait for expiry (20ms), then try to mark as used
      setTimeout(() => {
        TestPatterns.Effect.expectFailure(
          token.markAsUsed(),
          BusinessRuleViolationError
        );
      }, 20);
    });

    it("should validate for use", () => {
      const userId = crypto.randomUUID();
      const token = TestPatterns.Effect.expectSuccess(
        DownloadTokenEntity.create(createUnusedToken({ issuedTo: userId }))
      );

      const validated = TestPatterns.Effect.expectSuccess(
        token.validateForUse(userId as any)
      );
      expect(validated).toBe(token);
    });

    it("should reject validation for wrong user", () => {
      const token = TestPatterns.Effect.expectSuccess(
        DownloadTokenEntity.create(createUnusedToken())
      );

      TestPatterns.Effect.expectFailure(
        token.validateForUse(crypto.randomUUID() as any),
        BusinessRuleViolationError
      );
    });

    it("should check token ownership", () => {
      const userId = crypto.randomUUID();
      const token = TestPatterns.Effect.expectSuccess(
        DownloadTokenEntity.create(createUnusedToken({ issuedTo: userId }))
      );

      expect(token.belongsToUser(userId as any)).toBe(true);
      expect(token.belongsToUser(crypto.randomUUID() as any)).toBe(false);
    });
  });

  describe("Property-Based Testing", () => {
    it("should handle valid data", () => {
      fc.assert(
        fc.property(downloadTokenArbitrary, (data) => {
          // Pre-condition: token must be at least 32 characters and not whitespace-only
          const tokenValid = data.token.trim().length >= 32;
          
          // Pre-condition: expiresAt must be in the future
          const expiryDate = new Date(data.expiresAt);
          const expiryValid = expiryDate.getTime() > Date.now();
          
          fc.pre(tokenValid && expiryValid);
          
          const token = TestPatterns.Effect.expectSuccess(DownloadTokenEntity.create(data));
          expect(token.token).toBe(data.token);
          expect(token.documentId).toBe(data.documentId);
        }),
        { numRuns: 30 }
      );
    });
  });
});
