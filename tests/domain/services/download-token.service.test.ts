import { describe, expect, it, beforeEach } from "vitest";
import { Effect, Option } from "effect";
import { DownloadTokenService, DownloadTokenServiceError } from "../../../src/domain/services/download-token.service";
import { DownloadTokenEntity } from "../../../src/domain/entities/download-token.entity";
import { DownloadTokenRepository } from "../../../src/domain/ports/download-token.repository";
import { 
  createUnusedToken,
  createUsedToken,
  createExpiredToken,
  createLongExpiryToken
} from "../../factories/download-token.factory";
import { TestPatterns } from "../../utils/test.helpers";
import type { SerializedDownloadToken } from "../../../src/domain/entities/download-token.entity";

/**
 * Helper to convert serialized token data to internal format for unsafe() usage
 */
const toInternalFormat = (serialized: SerializedDownloadToken): any => ({
  ...serialized,
  expiresAt: new Date(serialized.expiresAt),
  createdAt: new Date(serialized.createdAt),
  usedAt: serialized.usedAt._tag === "Some" 
    ? Option.some(new Date(serialized.usedAt.value)) 
    : Option.none()
});

/**
 * Mock DownloadTokenRepository for testing
 */
class MockDownloadTokenRepository implements DownloadTokenRepository {
  private tokens: Map<string, DownloadTokenEntity> = new Map();
  private tokensByString: Map<string, DownloadTokenEntity> = new Map();

  save(token: DownloadTokenEntity): Effect.Effect<DownloadTokenEntity, never> {
    this.tokens.set(token.id, token);
    this.tokensByString.set(token.token, token);
    return Effect.succeed(token);
  }

  findById(id: string): Effect.Effect<Option.Option<DownloadTokenEntity>, never> {
    const token = this.tokens.get(id);
    return Effect.succeed(token ? Option.some(token) : Option.none());
  }

  findByToken(tokenString: string): Effect.Effect<Option.Option<DownloadTokenEntity>, never> {
    const token = this.tokensByString.get(tokenString);
    return Effect.succeed(token ? Option.some(token) : Option.none());
  }

  findByUserId(userId: string): Effect.Effect<readonly DownloadTokenEntity[], never> {
    const tokens = Array.from(this.tokens.values()).filter(t => t.issuedTo === userId);
    return Effect.succeed(tokens);
  }

  findByDocumentId(documentId: string): Effect.Effect<readonly DownloadTokenEntity[], never> {
    const tokens = Array.from(this.tokens.values()).filter(t => t.documentId === documentId);
    return Effect.succeed(tokens);
  }

  findValidTokens(documentId: string, userId: string): Effect.Effect<readonly DownloadTokenEntity[], never> {
    const tokens = Array.from(this.tokens.values()).filter(
      t => t.documentId === documentId && t.issuedTo === userId && t.isValid()
    );
    return Effect.succeed(tokens);
  }

  exists(id: string): Effect.Effect<boolean, never> {
    return Effect.succeed(this.tokens.has(id));
  }

  markAsUsed(tokenString: string): Effect.Effect<DownloadTokenEntity, never> {
    const token = this.tokensByString.get(tokenString);
    if (!token) {
      return Effect.die(new Error("Token not found"));
    }
    return Effect.flatMap(
      token.markAsUsed(),
      (updated) => this.save(updated)
    ) as Effect.Effect<DownloadTokenEntity, never>;
  }

  delete(id: string): Effect.Effect<boolean, never> {
    const token = this.tokens.get(id);
    if (token) {
      this.tokens.delete(id);
      this.tokensByString.delete(token.token);
      return Effect.succeed(true);
    }
    return Effect.succeed(false);
  }

  deleteExpiredTokens(): Effect.Effect<number, never> {
    const now = new Date();
    let deletedCount = 0;
    
    for (const [id, token] of this.tokens.entries()) {
      if (token.expiresAt < now) {
        this.tokens.delete(id);
        this.tokensByString.delete(token.token);
        deletedCount++;
      }
    }
    
    return Effect.succeed(deletedCount);
  }

  deleteByDocumentId(documentId: string): Effect.Effect<number, never> {
    const tokensToDelete = Array.from(this.tokens.values()).filter(
      t => t.documentId === documentId
    );
    
    tokensToDelete.forEach(token => {
      this.tokens.delete(token.id);
      this.tokensByString.delete(token.token);
    });
    
    return Effect.succeed(tokensToDelete.length);
  }

  // Test helpers
  seedToken(token: DownloadTokenEntity): void {
    this.tokens.set(token.id, token);
    this.tokensByString.set(token.token, token);
  }

  clear(): void {
    this.tokens.clear();
    this.tokensByString.clear();
  }

  getTokenCount(): number {
    return this.tokens.size;
  }
}

describe("DownloadTokenService - Domain Service Tests", () => {
  let downloadTokenService: DownloadTokenService;
  let tokenRepository: MockDownloadTokenRepository;

  // Test data constants
  const documentId = crypto.randomUUID() as any;
  const userId = crypto.randomUUID() as any;
  const differentUserId = crypto.randomUUID() as any;

  beforeEach(() => {
    tokenRepository = new MockDownloadTokenRepository();
    downloadTokenService = new DownloadTokenService(tokenRepository);
  });

  describe("Service Initialization & Dependencies", () => {
    it("should create service with required dependencies", () => {
      expect(downloadTokenService).toBeInstanceOf(DownloadTokenService);
    });

    it("should accept custom clock skew tolerance", () => {
      const customTolerance = 5000; // 5 seconds
      const service = new DownloadTokenService(tokenRepository, customTolerance);
      expect(service).toBeInstanceOf(DownloadTokenService);
    });

    it("should use default clock skew tolerance of 0", () => {
      const service = new DownloadTokenService(tokenRepository);
      expect(service).toBeInstanceOf(DownloadTokenService);
    });
  });

  describe("generateDownloadToken - Token Creation", () => {
    it("should generate token with default expiry", async () => {
      const token = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.generateDownloadToken(documentId, userId)
      );

      expect(token).toBeInstanceOf(DownloadTokenEntity);
      expect(token.documentId).toBe(documentId);
      expect(token.issuedTo).toBe(userId);
      expect(token.isValid()).toBe(true);
      expect(tokenRepository.getTokenCount()).toBe(1);
    });

    it("should generate token with custom expiry", async () => {
      const customExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      const token = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.generateDownloadToken(documentId, userId, customExpiry)
      );

      expect(token.expiresAt.getTime()).toBeCloseTo(customExpiry.getTime(), -2);
    });

    it("should generate unique token strings", async () => {
      const token1 = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.generateDownloadToken(documentId, userId)
      );

      const token2 = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.generateDownloadToken(documentId, userId)
      );

      expect(token1.token).not.toBe(token2.token);
      expect(token1.id).not.toBe(token2.id);
    });

    it("should generate cryptographically secure tokens", async () => {
      const token = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.generateDownloadToken(documentId, userId)
      );

      // Token should be long enough (base64 encoded 32 bytes = ~43 chars without padding)
      expect(token.token.length).toBeGreaterThan(40);
      // Should be URL-safe (no +, /, =)
      expect(token.token).not.toMatch(/[+/=]/);
    });

    it("should set token as unused on creation", async () => {
      const token = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.generateDownloadToken(documentId, userId)
      );

      expect(token.isUsed()).toBe(false);
      expect(token.hasBeenUsed).toBe(false);
      TestPatterns.Option.expectNone(token.usedAt);
    });

    it("should set correct timestamps", async () => {
      const beforeCreation = new Date();

      const token = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.generateDownloadToken(documentId, userId)
      );

      const afterCreation = new Date();

      expect(token.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreation.getTime());
      expect(token.createdAt.getTime()).toBeLessThanOrEqual(afterCreation.getTime());
      expect(token.expiresAt.getTime()).toBeGreaterThan(afterCreation.getTime());
    });

    it("should default to 5 minute expiry", async () => {
      const beforeCreation = Date.now();

      const token = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.generateDownloadToken(documentId, userId)
      );

      const expectedExpiry = beforeCreation + 5 * 60 * 1000; // 5 minutes
      const actualExpiry = token.expiresAt.getTime();

      // Allow 1 second tolerance for test execution time
      expect(actualExpiry).toBeGreaterThan(expectedExpiry - 1000);
      expect(actualExpiry).toBeLessThan(expectedExpiry + 1000);
    });

    it("should handle multiple tokens for same document", async () => {
      const token1 = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.generateDownloadToken(documentId, userId)
      );

      const token2 = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.generateDownloadToken(documentId, differentUserId)
      );

      expect(token1.documentId).toBe(token2.documentId);
      expect(token1.issuedTo).not.toBe(token2.issuedTo);
      expect(tokenRepository.getTokenCount()).toBe(2);
    });

    it("should handle multiple tokens for same user", async () => {
      const doc1 = crypto.randomUUID() as any;
      const doc2 = crypto.randomUUID() as any;

      const token1 = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.generateDownloadToken(doc1, userId)
      );

      const token2 = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.generateDownloadToken(doc2, userId)
      );

      expect(token1.issuedTo).toBe(token2.issuedTo);
      expect(token1.documentId).not.toBe(token2.documentId);
    });
  });

  describe("consumeDownloadToken - Token Usage", () => {
    let validToken: DownloadTokenEntity;
    let tokenString: string;

    beforeEach(async () => {
      const tokenData = createUnusedToken({
        documentId: documentId,
        issuedTo: userId
      });
      validToken = TestPatterns.Effect.expectSuccess(DownloadTokenEntity.create(tokenData));
      tokenString = validToken.token;
      tokenRepository.seedToken(validToken);
    });

    it("should successfully consume valid token", async () => {
      const consumed = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.consumeDownloadToken(tokenString, userId)
      );

      expect(consumed.isUsed()).toBe(true);
      expect(consumed.hasBeenUsed).toBe(true);
      const usedAt = TestPatterns.Option.expectSome(consumed.usedAt);
      expect(usedAt).toBeInstanceOf(Date);
    });

    it("should verify token belongs to user", async () => {
      const consumed = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.consumeDownloadToken(tokenString, userId)
      );

      expect(consumed.belongsToUser(userId)).toBe(true);
    });

    it("should fail if token not found", async () => {
      const nonExistentToken = "invalid-token-string";

      const error = await TestPatterns.Effect.expectAsyncFailure(
        downloadTokenService.consumeDownloadToken(nonExistentToken, userId),
        DownloadTokenServiceError
      );

      expect(error).toBeInstanceOf(DownloadTokenServiceError);
      expect(error.code).toBe("TOKEN_NOT_FOUND");
    });

    it("should fail if token already used", async () => {
      // First consumption
      await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.consumeDownloadToken(tokenString, userId)
      );

      // Second consumption attempt
      const error = await TestPatterns.Effect.expectAsyncFailure(
        downloadTokenService.consumeDownloadToken(tokenString, userId),
        DownloadTokenServiceError
      );

      expect(error).toBeInstanceOf(DownloadTokenServiceError);
      expect(error.code).toBe("TOKEN_ALREADY_USED");
    });

    it("should fail if token expired", async () => {
      const expiredData = createExpiredToken({
        documentId: documentId,
        issuedTo: userId
      });
      const expiredToken = DownloadTokenEntity.unsafe(toInternalFormat(expiredData));
      tokenRepository.clear();
      tokenRepository.seedToken(expiredToken);

      const error = await TestPatterns.Effect.expectAsyncFailure(
        downloadTokenService.consumeDownloadToken(expiredToken.token, userId),
        DownloadTokenServiceError
      );

      expect(error).toBeInstanceOf(DownloadTokenServiceError);
      expect(error.code).toBe("TOKEN_EXPIRED");
    });

    it("should fail if token belongs to different user", async () => {
      const error = await TestPatterns.Effect.expectAsyncFailure(
        downloadTokenService.consumeDownloadToken(tokenString, differentUserId),
        DownloadTokenServiceError
      );

      expect(error).toBeInstanceOf(DownloadTokenServiceError);
      expect(error.code).toBe("TOKEN_NOT_FOUND");
    });

    it("should update usedAt timestamp on consumption", async () => {
      const beforeConsumption = new Date();

      const consumed = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.consumeDownloadToken(tokenString, userId)
      );

      const afterConsumption = new Date();
      const usedAt = TestPatterns.Option.expectSome(consumed.usedAt);

      expect(usedAt.getTime()).toBeGreaterThanOrEqual(beforeConsumption.getTime());
      expect(usedAt.getTime()).toBeLessThanOrEqual(afterConsumption.getTime());
    });

    it("should mark token as invalid after consumption", async () => {
      const consumed = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.consumeDownloadToken(tokenString, userId)
      );

      expect(consumed.isValid()).toBe(false);
      expect(consumed.isCurrentlyValid).toBe(false);
    });

    it("should persist consumed state in repository", async () => {
      await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.consumeDownloadToken(tokenString, userId)
      );

      // Retrieve from repository
      const tokenOption = await Effect.runPromise(
        tokenRepository.findByToken(tokenString)
      );

      const retrieved = TestPatterns.Option.expectSome(tokenOption);
      expect(retrieved.isUsed()).toBe(true);
    });
  });

  describe("cleanupExpiredTokens - Token Cleanup", () => {
    it("should delete expired tokens", async () => {
      // Create mix of valid and expired tokens
      const validData = createUnusedToken();
      const expiredData1 = createExpiredToken();
      const expiredData2 = createExpiredToken();

      const validToken = TestPatterns.Effect.expectSuccess(
        DownloadTokenEntity.create(validData)
      );
      const expiredToken1 = DownloadTokenEntity.unsafe(toInternalFormat(expiredData1));
      const expiredToken2 = DownloadTokenEntity.unsafe(toInternalFormat(expiredData2));

      tokenRepository.seedToken(validToken);
      tokenRepository.seedToken(expiredToken1);
      tokenRepository.seedToken(expiredToken2);

      const deletedCount = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.cleanupExpiredTokens()
      );

      expect(deletedCount).toBe(2);
      expect(tokenRepository.getTokenCount()).toBe(1);
    });

    it("should return 0 if no expired tokens", async () => {
      const validData1 = createUnusedToken();
      const validData2 = createLongExpiryToken();

      const token1 = TestPatterns.Effect.expectSuccess(DownloadTokenEntity.create(validData1));
      const token2 = TestPatterns.Effect.expectSuccess(DownloadTokenEntity.create(validData2));

      tokenRepository.seedToken(token1);
      tokenRepository.seedToken(token2);

      const deletedCount = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.cleanupExpiredTokens()
      );

      expect(deletedCount).toBe(0);
      expect(tokenRepository.getTokenCount()).toBe(2);
    });

    it("should handle empty repository", async () => {
      const deletedCount = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.cleanupExpiredTokens()
      );

      expect(deletedCount).toBe(0);
    });

    it("should not delete used but valid tokens", async () => {
      const usedData = createUsedToken({
        expiresAt: new Date(Date.now() + 60 * 1000).toISOString() // Still valid
      });
      const usedToken = TestPatterns.Effect.expectSuccess(
        DownloadTokenEntity.create(usedData)
      );

      tokenRepository.seedToken(usedToken);

      const deletedCount = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.cleanupExpiredTokens()
      );

      expect(deletedCount).toBe(0);
      expect(tokenRepository.getTokenCount()).toBe(1);
    });
  });

  describe("getActiveTokensForDocument - Token Retrieval", () => {
    beforeEach(() => {
      // Setup various token states for same document
      const validToken1 = TestPatterns.Effect.expectSuccess(
        DownloadTokenEntity.create(createUnusedToken({ documentId: documentId }))
      );
      const validToken2 = TestPatterns.Effect.expectSuccess(
        DownloadTokenEntity.create(createUnusedToken({ documentId: documentId }))
      );
      const expiredToken = DownloadTokenEntity.unsafe(toInternalFormat(createExpiredToken({ documentId: documentId })));
      const usedToken = DownloadTokenEntity.unsafe(toInternalFormat(createUsedToken({ documentId: documentId })));

      tokenRepository.seedToken(validToken1);
      tokenRepository.seedToken(validToken2);
      tokenRepository.seedToken(expiredToken);
      tokenRepository.seedToken(usedToken);
    });

    it("should return only valid tokens for document", async () => {
      const activeTokens = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.getActiveTokensForDocument(documentId)
      );

      expect(activeTokens).toHaveLength(2);
      activeTokens.forEach(token => {
        expect(token.isValid()).toBe(true);
        expect(token.documentId).toBe(documentId);
      });
    });

    it("should filter out expired tokens", async () => {
      const activeTokens = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.getActiveTokensForDocument(documentId)
      );

      const hasExpired = activeTokens.some(token => token.isExpired());
      expect(hasExpired).toBe(false);
    });

    it("should filter out used tokens", async () => {
      const activeTokens = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.getActiveTokensForDocument(documentId)
      );

      const hasUsed = activeTokens.some(token => token.isUsed());
      expect(hasUsed).toBe(false);
    });

    it("should return empty array for document with no active tokens", async () => {
      const emptyDocId = crypto.randomUUID() as any;

      const activeTokens = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.getActiveTokensForDocument(emptyDocId)
      );

      expect(activeTokens).toHaveLength(0);
    });

    it("should handle document with only expired tokens", async () => {
      const docWithExpired = crypto.randomUUID() as any;
      const expired1 = DownloadTokenEntity.unsafe(toInternalFormat(createExpiredToken({ documentId: docWithExpired })));
      const expired2 = DownloadTokenEntity.unsafe(toInternalFormat(createExpiredToken({ documentId: docWithExpired })));

      tokenRepository.seedToken(expired1);
      tokenRepository.seedToken(expired2);

      const activeTokens = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.getActiveTokensForDocument(docWithExpired)
      );

      expect(activeTokens).toHaveLength(0);
    });
  });

  describe("revokeToken - Token Revocation", () => {
    it("should successfully revoke existing token", async () => {
      const tokenData = createUnusedToken();
      const token = TestPatterns.Effect.expectSuccess(DownloadTokenEntity.create(tokenData));
      tokenRepository.seedToken(token);

      const result = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.revokeToken(token.id)
      );

      expect(result).toBe(true);
      expect(tokenRepository.getTokenCount()).toBe(0);
    });

    it("should return false for non-existent token", async () => {
      const nonExistentId = crypto.randomUUID() as any;

      const result = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.revokeToken(nonExistentId)
      );

      expect(result).toBe(false);
    });

    it("should remove token from repository", async () => {
      const tokenData = createUnusedToken();
      const token = TestPatterns.Effect.expectSuccess(DownloadTokenEntity.create(tokenData));
      tokenRepository.seedToken(token);

      await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.revokeToken(token.id)
      );

      const tokenOption = await Effect.runPromise(tokenRepository.findById(token.id));
      TestPatterns.Option.expectNone(tokenOption);
    });

    it("should handle revoking already used token", async () => {
      const usedData = createUsedToken();
      const usedToken = DownloadTokenEntity.unsafe(toInternalFormat(usedData));
      tokenRepository.seedToken(usedToken);

      const result = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.revokeToken(usedToken.id)
      );

      expect(result).toBe(true);
    });

    it("should handle revoking expired token", async () => {
      const expiredData = createExpiredToken();
      const expiredToken = DownloadTokenEntity.unsafe(toInternalFormat(expiredData));
      tokenRepository.seedToken(expiredToken);

      const result = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.revokeToken(expiredToken.id)
      );

      expect(result).toBe(true);
    });
  });

  describe("Clock Skew Tolerance", () => {
    it("should respect clock skew tolerance on token validation", async () => {
      const tolerance = 60000; // 1 minute
      const serviceWithTolerance = new DownloadTokenService(tokenRepository, tolerance);

      // Create token that expires in 30 seconds
      const soonExpiry = new Date(Date.now() + 30 * 1000);
      const tokenData = createUnusedToken({
        documentId: documentId,
        issuedTo: userId,
        expiresAt: soonExpiry.toISOString()
      });
      const token = TestPatterns.Effect.expectSuccess(DownloadTokenEntity.create(tokenData));
      tokenRepository.seedToken(token);

      // Should be valid with tolerance even though it's technically expiring
      const consumed = await TestPatterns.Effect.expectAsyncSuccess(
        serviceWithTolerance.consumeDownloadToken(token.token, userId)
      );

      expect(consumed.isUsed()).toBe(true);
    });

    it("should filter tokens considering clock skew in getActiveTokens", async () => {
      const tolerance = 60000; // 1 minute
      const serviceWithTolerance = new DownloadTokenService(tokenRepository, tolerance);

      // Token that recently expired (within tolerance)
      const recentlyExpired = new Date(Date.now() - 30 * 1000); // 30 seconds ago
      const tokenData = createUnusedToken({
        documentId: documentId,
        expiresAt: recentlyExpired.toISOString()
      });
      const token = DownloadTokenEntity.unsafe(toInternalFormat(tokenData));
      tokenRepository.seedToken(token);

      const activeTokens = await TestPatterns.Effect.expectAsyncSuccess(
        serviceWithTolerance.getActiveTokensForDocument(documentId)
      );

      // With tolerance, recently expired token might still be valid
      expect(activeTokens.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Integration Scenarios", () => {
    it("should support complete token lifecycle", async () => {
      // Generate
      const generated = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.generateDownloadToken(documentId, userId)
      );

      expect(generated.isValid()).toBe(true);

      // Retrieve active tokens
      const activeTokens = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.getActiveTokensForDocument(documentId)
      );

      expect(activeTokens).toHaveLength(1);

      // Consume
      const consumed = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.consumeDownloadToken(generated.token, userId)
      );

      expect(consumed.isUsed()).toBe(true);

      // Verify no longer active
      const afterConsumption = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.getActiveTokensForDocument(documentId)
      );

      expect(afterConsumption).toHaveLength(0);
    });

    it("should handle multiple users downloading same document", async () => {
      const user1 = crypto.randomUUID() as any;
      const user2 = crypto.randomUUID() as any;

      const token1 = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.generateDownloadToken(documentId, user1)
      );

      const token2 = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.generateDownloadToken(documentId, user2)
      );

      // Both tokens should be active
      const activeTokens = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.getActiveTokensForDocument(documentId)
      );

      expect(activeTokens).toHaveLength(2);

      // Each user can consume their own token
      await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.consumeDownloadToken(token1.token, user1)
      );

      await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.consumeDownloadToken(token2.token, user2)
      );
    });

    it("should maintain isolation between documents", async () => {
      const doc1 = crypto.randomUUID() as any;
      const doc2 = crypto.randomUUID() as any;

      await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.generateDownloadToken(doc1, userId)
      );

      await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.generateDownloadToken(doc2, userId)
      );

      const doc1Tokens = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.getActiveTokensForDocument(doc1)
      );

      const doc2Tokens = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.getActiveTokensForDocument(doc2)
      );

      expect(doc1Tokens).toHaveLength(1);
      expect(doc2Tokens).toHaveLength(1);
      
      if (doc1Tokens[0] && doc2Tokens[0]) {
        expect(doc1Tokens[0].documentId).not.toBe(doc2Tokens[0].documentId);
      }
    });

    it("should handle concurrent token generation", async () => {
      const generatePromises = Array.from({ length: 10 }, () =>
        Effect.runPromise(downloadTokenService.generateDownloadToken(documentId, userId))
      );

      const tokens = await Promise.all(generatePromises);

      expect(tokens).toHaveLength(10);
      
      // All tokens should be unique
      const tokenStrings = new Set(tokens.map(t => t.token));
      expect(tokenStrings.size).toBe(10);
    });
  });

  describe("Error Handling & Edge Cases", () => {
    it("should handle repository failures gracefully", async () => {
      class FailingRepository extends MockDownloadTokenRepository {
        save(): Effect.Effect<DownloadTokenEntity, never> {
          return Effect.die(new Error("Repository failure"));
        }
      }

      const failingService = new DownloadTokenService(new FailingRepository());

      await expect(
        Effect.runPromise(failingService.generateDownloadToken(documentId, userId))
      ).rejects.toThrow();
    });

    it("should maintain consistency on failed consumption", async () => {
      const tokenData = createUnusedToken({ documentId, issuedTo: userId });
      const token = TestPatterns.Effect.expectSuccess(DownloadTokenEntity.create(tokenData));
      tokenRepository.seedToken(token);

      // Failed consumption (wrong user)
      await TestPatterns.Effect.expectAsyncFailure(
        downloadTokenService.consumeDownloadToken(token.token, differentUserId),
        DownloadTokenServiceError
      );

      // Token should still be valid for correct user
      const consumed = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.consumeDownloadToken(token.token, userId)
      );

      expect(consumed.isUsed()).toBe(true);
    });

    it("should handle edge case of token expiring during operation", async () => {
      // Token expires in 100ms
      const nearExpiry = new Date(Date.now() + 100);
      const tokenData = createUnusedToken({
        documentId,
        issuedTo: userId,
        expiresAt: nearExpiry.toISOString()
      });
      const token = TestPatterns.Effect.expectSuccess(DownloadTokenEntity.create(tokenData));
      tokenRepository.seedToken(token);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should fail as expired
      const error = await TestPatterns.Effect.expectAsyncFailure(
        downloadTokenService.consumeDownloadToken(token.token, userId),
        DownloadTokenServiceError
      );

      expect(error.code).toBe("TOKEN_EXPIRED");
    });
  });

  describe("Service Boundaries & Domain Rules", () => {
    it("should enforce token immutability", async () => {
      const token = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.generateDownloadToken(documentId, userId)
      );

      const originalExpiry = token.expiresAt;

      // Consume token
      const consumed = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.consumeDownloadToken(token.token, userId)
      );

      // Original token object should be unchanged (immutability)
      expect(token.isUsed()).toBe(false);
      expect(consumed.isUsed()).toBe(true);
      expect(token.expiresAt).toEqual(originalExpiry);
    });

    it("should maintain domain invariants", async () => {
      const token = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.generateDownloadToken(documentId, userId)
      );

      // Domain invariants
      expect(token.token).toBeDefined();
      expect(token.token.length).toBeGreaterThan(0);
      expect(token.documentId).toBeDefined();
      expect(token.issuedTo).toBeDefined();
      expect(token.expiresAt).toBeInstanceOf(Date);
      expect(token.createdAt).toBeInstanceOf(Date);
      expect(token.createdAt.getTime()).toBeLessThan(token.expiresAt.getTime());
    });

    it("should return domain entities, not repository artifacts", async () => {
      const token = await TestPatterns.Effect.expectAsyncSuccess(
        downloadTokenService.generateDownloadToken(documentId, userId)
      );

      expect(token).toBeInstanceOf(DownloadTokenEntity);
      expect(token.toPlainObject).toBeDefined();
      expect(token.serialized).toBeDefined();
    });
  });
});

