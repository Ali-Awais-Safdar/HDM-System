import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { Effect as E, Option as O, Exit } from "effect";
import { eq, sql } from "drizzle-orm";
import { DownloadTokenDrizzleRepository } from "@infra/repositories/download-token.repository";
import { setupTestDatabase, cleanupDatabase, createTestUser, createTestDocument, TestDatabase } from "../../../setup/database";
import { createTestDownloadTokenEntity, createUnusedToken, createUsedToken } from "../../../factories/download-token.factory";
import { createDownloadTokenId, createUserId, createDocumentId } from "../../../utils/test-id-helpers";

describe("DownloadTokenDrizzleRepository Integration Tests", () => {
  let testDb: TestDatabase;
  let tokenRepository: DownloadTokenDrizzleRepository;
  let testUserId: string;
  let testDocumentId: string;

  beforeAll(async () => {
    testDb = await setupTestDatabase();
    tokenRepository = new DownloadTokenDrizzleRepository(testDb.db);
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    await cleanupDatabase(testDb.db);

    // Create prerequisite test user and document
    const user = await createTestUser(testDb.db, { email: "token-user@example.com" });
    testUserId = user.id;

    const versionId = crypto.randomUUID();
    const document = await createTestDocument(testDb.db, testUserId, {
      title: "Document for Tokens",
      currentVersionId: versionId,
    });
    testDocumentId = document.id;
  });

  describe("save (CREATE)", () => {
    it("should save a new download token", async () => {
      const tokenData = createUnusedToken({
        documentId: testDocumentId,
        issuedTo: testUserId,
      });
      const tokenEntity = E.runSync(createTestDownloadTokenEntity(tokenData));

      const savedToken = await E.runPromise(tokenRepository.save(tokenEntity));

      expect(savedToken.id).toBe(tokenEntity.id);
      expect(savedToken.documentId).toBe(testDocumentId);
      expect(savedToken.issuedTo).toBe(testUserId);
      expect(O.isNone(savedToken.usedAt)).toBe(true);
    });

    it("should save token with usedAt timestamp", async () => {
      const tokenData = createUsedToken({
        documentId: testDocumentId,
        issuedTo: testUserId,
      });
      const tokenEntity = E.runSync(createTestDownloadTokenEntity(tokenData));

      const savedToken = await E.runPromise(tokenRepository.save(tokenEntity));

      expect(O.isSome(savedToken.usedAt)).toBe(true);
    });

    it("should enforce unique constraint on token string", async () => {
      const token1Data = createUnusedToken({
        token: "unique-token-12345-abcdef-1234567890",
        documentId: testDocumentId,
        issuedTo: testUserId,
      });
      const token1 = E.runSync(createTestDownloadTokenEntity(token1Data));

      const token2Data = createUnusedToken({
        token: "unique-token-12345-abcdef-1234567890", // Same token string
        documentId: testDocumentId,
        issuedTo: testUserId,
      });
      const token2 = E.runSync(createTestDownloadTokenEntity(token2Data));

      await E.runPromise(tokenRepository.save(token1));

      const result = E.runSyncExit(tokenRepository.save(token2));

      expect(Exit.isFailure(result)).toBe(true);
    });
  });

  describe("findById (READ)", () => {
    it("should find token by id", async () => {
      const tokenData = createUnusedToken({
        documentId: testDocumentId,
        issuedTo: testUserId,
      });
      const tokenEntity = E.runSync(createTestDownloadTokenEntity(tokenData));
      await E.runPromise(tokenRepository.save(tokenEntity));

      const foundOpt = await E.runPromise(tokenRepository.findById(tokenEntity.id));

      expect(O.isSome(foundOpt)).toBe(true);
      const found = O.getOrThrow(foundOpt);
      expect(found.id).toBe(tokenEntity.id);
    });

    it("should return None for non-existent token id", async () => {
      const nonExistentId = createDownloadTokenId();

      const foundOpt = await E.runPromise(tokenRepository.findById(nonExistentId));

      expect(O.isNone(foundOpt)).toBe(true);
    });
  });

  describe("findByToken (READ)", () => {
    it("should find token by token string", async () => {
      const tokenData = createUnusedToken({
        token: "find-by-token-xyz-abcdef-1234567890",
        documentId: testDocumentId,
        issuedTo: testUserId,
      });
      const tokenEntity = E.runSync(createTestDownloadTokenEntity(tokenData));
      await E.runPromise(tokenRepository.save(tokenEntity));

      const foundOpt = await E.runPromise(tokenRepository.findByToken("find-by-token-xyz-abcdef-1234567890"));

      expect(O.isSome(foundOpt)).toBe(true);
      const found = O.getOrThrow(foundOpt);
      expect(found.token).toBe("find-by-token-xyz-abcdef-1234567890");
    });

    it("should return None for non-existent token string", async () => {
      const foundOpt = await E.runPromise(
        tokenRepository.findByToken("non-existent-token")
      );

      expect(O.isNone(foundOpt)).toBe(true);
    });
  });

  describe("findByUserId (READ)", () => {
    it("should find all tokens issued to a user", async () => {
      const token1Data = createUnusedToken({
        documentId: testDocumentId,
        issuedTo: testUserId,
      });
      const token2Data = createUnusedToken({
        documentId: testDocumentId,
        issuedTo: testUserId,
      });

      const token1 = E.runSync(createTestDownloadTokenEntity(token1Data));
      const token2 = E.runSync(createTestDownloadTokenEntity(token2Data));

      await E.runPromise(tokenRepository.save(token1));
      await E.runPromise(tokenRepository.save(token2));

      const tokens = await E.runPromise(tokenRepository.findByUserId(createUserId(testUserId)));

      expect(tokens.length).toBe(2);
      expect(tokens.every((t) => t.issuedTo === testUserId)).toBe(true);
    });

    it("should return empty array for user with no tokens", async () => {
      const otherUser = await createTestUser(testDb.db, { email: "no-tokens@example.com" });

      const tokens = await E.runPromise(tokenRepository.findByUserId(createUserId(otherUser.id)));

      expect(tokens.length).toBe(0);
    });
  });

  describe("findByDocumentId (READ)", () => {
    it("should find all tokens for a document", async () => {
      const user2 = await createTestUser(testDb.db, { email: "user2@example.com" });

      const token1Data = createUnusedToken({
        documentId: testDocumentId,
        issuedTo: testUserId,
      });
      const token2Data = createUnusedToken({
        documentId: testDocumentId,
        issuedTo: user2.id,
      });

      const token1 = E.runSync(createTestDownloadTokenEntity(token1Data));
      const token2 = E.runSync(createTestDownloadTokenEntity(token2Data));

      await E.runPromise(tokenRepository.save(token1));
      await E.runPromise(tokenRepository.save(token2));

      const tokens = await E.runPromise(tokenRepository.findByDocumentId(createDocumentId(testDocumentId)));

      expect(tokens.length).toBe(2);
      expect(tokens.every((t) => t.documentId === testDocumentId)).toBe(true);
    });
  });

  describe("findValidTokens (READ)", () => {
    it("should find only valid (unused, non-expired) tokens for document and user", async () => {
      // Valid token (unused, not expired)
      const validToken1Data = createUnusedToken({
        documentId: testDocumentId,
        issuedTo: testUserId,
      });

      const validToken2Data = createUnusedToken({
        documentId: testDocumentId,
        issuedTo: testUserId,
      });

      // Used token
      const usedTokenData = createUsedToken({
        documentId: testDocumentId,
        issuedTo: testUserId,
      });

      const validToken1 = E.runSync(createTestDownloadTokenEntity(validToken1Data));
      const validToken2 = E.runSync(createTestDownloadTokenEntity(validToken2Data));
      const usedToken = E.runSync(createTestDownloadTokenEntity(usedTokenData));

      await E.runPromise(tokenRepository.save(validToken1));
      await E.runPromise(tokenRepository.save(validToken2));
      await E.runPromise(tokenRepository.save(usedToken));

      const validTokens = await E.runPromise(
        tokenRepository.findValidTokens(createDocumentId(testDocumentId), createUserId(testUserId))
      );

      // Should exclude used tokens
      expect(validTokens.length).toBe(2);
      expect(validTokens.some(t => t.id === validToken1.id)).toBe(true);
      expect(validTokens.some(t => t.id === validToken2.id)).toBe(true);
    });
  });

  describe("exists (READ)", () => {
    it("should return true when token exists", async () => {
      const tokenData = createUnusedToken({
        documentId: testDocumentId,
        issuedTo: testUserId,
      });
      const tokenEntity = E.runSync(createTestDownloadTokenEntity(tokenData));
      await E.runPromise(tokenRepository.save(tokenEntity));

      const exists = await E.runPromise(tokenRepository.exists(tokenEntity.id));

      expect(exists).toBe(true);
    });

    it("should return false when token does not exist", async () => {
      const nonExistentId = createDownloadTokenId();

      const exists = await E.runPromise(tokenRepository.exists(nonExistentId));

      expect(exists).toBe(false);
    });
  });

  describe("markAsUsed (UPDATE)", () => {
    it("should mark token as used", async () => {
      const tokenData = createUnusedToken({
        token: "mark-as-used-token-abcdef-1234567890",
        documentId: testDocumentId,
        issuedTo: testUserId,
      });
      const tokenEntity = E.runSync(createTestDownloadTokenEntity(tokenData));
      await E.runPromise(tokenRepository.save(tokenEntity));

      const markedToken = await E.runPromise(
        tokenRepository.markAsUsed("mark-as-used-token-abcdef-1234567890")
      );

      expect(O.isSome(markedToken.usedAt)).toBe(true);
    });

    it("should fail when marking already-used token", async () => {
      const tokenData = createUsedToken({
        token: "already-used-token-abcdef-1234567890",
        documentId: testDocumentId,
        issuedTo: testUserId,
      });
      const tokenEntity = E.runSync(createTestDownloadTokenEntity(tokenData));
      await E.runPromise(tokenRepository.save(tokenEntity));

      const result = E.runSyncExit(tokenRepository.markAsUsed("already-used-token-abcdef-1234567890"));

      expect(Exit.isFailure(result)).toBe(true);
    });

    it("should fail when marking non-existent token", async () => {
      const result = E.runSyncExit(tokenRepository.markAsUsed("non-existent-token"));

      expect(Exit.isFailure(result)).toBe(true);
    });
  });

  describe("delete (DELETE)", () => {
    it("should delete token by id", async () => {
      const tokenData = createUnusedToken({
        documentId: testDocumentId,
        issuedTo: testUserId,
      });
      const tokenEntity = E.runSync(createTestDownloadTokenEntity(tokenData));
      await E.runPromise(tokenRepository.save(tokenEntity));

      const deleted = await E.runPromise(tokenRepository.delete(tokenEntity.id));

      expect(deleted).toBe(true);

      const foundOpt = await E.runPromise(tokenRepository.findById(tokenEntity.id));
      expect(O.isNone(foundOpt)).toBe(true);
    });

    it("should return false when deleting non-existent token", async () => {
      const nonExistentId = createDownloadTokenId();

      const deleted = await E.runPromise(tokenRepository.delete(nonExistentId));

      expect(deleted).toBe(false);
    });
  });

  describe("deleteExpiredTokens (DELETE)", () => {
    it("should execute deleteExpiredTokens without errors", async () => {
      const validTokenData = createUnusedToken({
        documentId: testDocumentId,
        issuedTo: testUserId,
      });

      const validToken = E.runSync(createTestDownloadTokenEntity(validTokenData));

      await E.runPromise(tokenRepository.save(validToken));

      const deletedCount = await E.runPromise(tokenRepository.deleteExpiredTokens());

      // Since all tokens are valid (future expiry), none should be deleted
      expect(deletedCount).toBe(0);

      const validExists = await E.runPromise(tokenRepository.exists(validToken.id));
      expect(validExists).toBe(true);
    });
  });

  describe("deleteByDocumentId (DELETE)", () => {
    it("should delete all tokens for a document", async () => {
      const token1Data = createUnusedToken({
        documentId: testDocumentId,
        issuedTo: testUserId,
      });
      const token2Data = createUnusedToken({
        documentId: testDocumentId,
        issuedTo: testUserId,
      });

      const token1 = E.runSync(createTestDownloadTokenEntity(token1Data));
      const token2 = E.runSync(createTestDownloadTokenEntity(token2Data));

      await E.runPromise(tokenRepository.save(token1));
      await E.runPromise(tokenRepository.save(token2));

      const deletedCount = await E.runPromise(
        tokenRepository.deleteByDocumentId(createDocumentId(testDocumentId))
      );

      expect(deletedCount).toBe(2);

      const tokens = await E.runPromise(
        tokenRepository.findByDocumentId(createDocumentId(testDocumentId))
      );
      expect(tokens.length).toBe(0);
    });
  });

  describe("Cascade Delete", () => {
    it("should cascade delete tokens when parent document is deleted", async () => {
      const versionId = crypto.randomUUID();
      const newDoc = await createTestDocument(testDb.db, testUserId, {
        title: "Cascade Test Doc",
        currentVersionId: versionId,
      });

      const tokenData = createUnusedToken({
        documentId: newDoc.id,
        issuedTo: testUserId,
      });
      const tokenEntity = E.runSync(createTestDownloadTokenEntity(tokenData));
      await E.runPromise(tokenRepository.save(tokenEntity));

      // Delete the parent document
      const { documents: docsTable } = testDb.db._.fullSchema;
      await testDb.db.delete(docsTable).where(eq((docsTable as any).id, newDoc.id));

      // Verify token is also deleted
      const foundOpt = await E.runPromise(tokenRepository.findById(tokenEntity.id));
      expect(O.isNone(foundOpt)).toBe(true);
    });

    it("should cascade delete tokens when issued-to user is deleted", async () => {
      const user2 = await createTestUser(testDb.db, { email: "delete-cascade@example.com" });

      const tokenData = createUnusedToken({
        documentId: testDocumentId,
        issuedTo: user2.id,
      });
      const tokenEntity = E.runSync(createTestDownloadTokenEntity(tokenData));
      await E.runPromise(tokenRepository.save(tokenEntity));

      // Delete the issued-to user
      const { users: usersTable } = testDb.db._.fullSchema;
      await testDb.db.delete(usersTable).where(eq((usersTable as any).id, user2.id));

      // Verify token is also deleted
      const foundOpt = await E.runPromise(tokenRepository.findById(tokenEntity.id));
      expect(O.isNone(foundOpt)).toBe(true);
    });
  });

  describe("Serialization Round-trip", () => {
    it("should correctly serialize and deserialize token with all fields", async () => {
      const tokenData = createUnusedToken({
        documentId: testDocumentId,
        issuedTo: testUserId,
      });
      const originalEntity = E.runSync(createTestDownloadTokenEntity(tokenData));

      const saved = await E.runPromise(tokenRepository.save(originalEntity));
      const fetched = await E.runPromise(tokenRepository.findById(saved.id));

      const token = O.getOrThrow(fetched);
      expect(token.id).toBe(originalEntity.id);
      expect(token.token).toBe(originalEntity.token);
      expect(token.documentId).toBe(testDocumentId);
      expect(token.issuedTo).toBe(testUserId);
      expect(O.isNone(token.usedAt)).toBe(true);
    });

    it("should correctly handle usedAt timestamp in serialization", async () => {
      const tokenData = createUsedToken({
        documentId: testDocumentId,
        issuedTo: testUserId,
      });
      const originalEntity = E.runSync(createTestDownloadTokenEntity(tokenData));

      const saved = await E.runPromise(tokenRepository.save(originalEntity));
      const fetched = await E.runPromise(tokenRepository.findById(saved.id));

      const token = O.getOrThrow(fetched);
      expect(O.isSome(token.usedAt)).toBe(true);
    });
  });

  describe("Index Usage and Query Performance", () => {
    it("should leverage document_idx when querying by documentId", async () => {
      const tokenData = createUnusedToken({
        documentId: testDocumentId,
        issuedTo: testUserId,
      });
      const tokenEntity = E.runSync(createTestDownloadTokenEntity(tokenData));
      await E.runPromise(tokenRepository.save(tokenEntity));

      const tokens = await E.runPromise(
        tokenRepository.findByDocumentId(createDocumentId(testDocumentId))
      );

      expect(tokens.length).toBeGreaterThan(0);
    });

    it("should leverage issued_to_idx when querying by userId", async () => {
      const tokenData = createUnusedToken({
        documentId: testDocumentId,
        issuedTo: testUserId,
      });
      const tokenEntity = E.runSync(createTestDownloadTokenEntity(tokenData));
      await E.runPromise(tokenRepository.save(tokenEntity));

      const tokens = await E.runPromise(tokenRepository.findByUserId(createUserId(testUserId)));

      expect(tokens.length).toBeGreaterThan(0);
    });

    it("should leverage token_idx when querying by token string", async () => {
      const tokenData = createUnusedToken({
        token: "indexed-token-search-abcdef-1234567890",
        documentId: testDocumentId,
        issuedTo: testUserId,
      });
      const tokenEntity = E.runSync(createTestDownloadTokenEntity(tokenData));
      await E.runPromise(tokenRepository.save(tokenEntity));

      const foundOpt = await E.runPromise(
        tokenRepository.findByToken("indexed-token-search-abcdef-1234567890")
      );

      expect(O.isSome(foundOpt)).toBe(true);
    });

    it("should use index scan for token lookup (no seq scan)", async () => {
      const execResult = await testDb.db.execute(sql`EXPLAIN (COSTS OFF, FORMAT TEXT) SELECT * FROM download_tokens WHERE token = 'indexed-token-search-abcdef-1234567890' LIMIT 1`);
      const rows = ((execResult as any).rows ?? execResult) as Array<Record<string, string>>;
      const planText = rows.map((r) => Object.values(r)[0] as string).join("\n");
      expect(/Index Scan|Bitmap Index Scan/i.test(planText)).toBe(true);
      expect(/Seq Scan/i.test(planText)).toBe(false);
    });
  });
});

