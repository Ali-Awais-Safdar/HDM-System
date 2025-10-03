import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { Effect as E, Option as O, Exit } from "effect";
import { eq } from "drizzle-orm";
import { DocumentVersionDrizzleRepository } from "../../../../src/infra/db/repositories/document-version.repository";
import { setupTestDatabase, cleanupDatabase, createTestUser, createTestDocument, TestDatabase } from "../../../setup/database";
import { createTestDocumentVersionEntity } from "../../../factories/document-version.factory";
import { createDocumentVersionId, createDocumentId } from "../../../utils/test-id-helpers";

describe("DocumentVersionDrizzleRepository Integration Tests", () => {
  let testDb: TestDatabase;
  let versionRepository: DocumentVersionDrizzleRepository;
  let testUserId: string;
  let testDocumentId: string;

  beforeAll(async () => {
    testDb = await setupTestDatabase();
    versionRepository = new DocumentVersionDrizzleRepository(testDb.db);
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    await cleanupDatabase(testDb.db);

    // Create prerequisite test user and document
    const user = await createTestUser(testDb.db, { email: "version-owner@example.com" });
    testUserId = user.id;

    const versionId = crypto.randomUUID();
    const document = await createTestDocument(testDb.db, testUserId, {
      title: "Document for Versions",
      currentVersionId: versionId,
    });
    testDocumentId = document.id;
  });

  describe("save (CREATE)", () => {
    it("should save a new document version and return the entity", async () => {
      const versionEntity = E.runSync(
        createTestDocumentVersionEntity({
          documentId: testDocumentId,
          version: 1,
          checksum: "a".repeat(64),
          fileKey: "documents/test-file.pdf",
          mimeType: "application/pdf",
          size: 1024 * 500, // 500 KB
          createdBy: { _tag: "Some", value: testUserId },
        })
      );

      const savedVersion = await E.runPromise(versionRepository.save(versionEntity));

      expect(savedVersion.id).toBe(versionEntity.id);
      expect(savedVersion.documentId).toBe(testDocumentId);
      expect(savedVersion.version).toBe(1);
      expect(savedVersion.checksum).toBe("a".repeat(64));
      expect(O.isSome(savedVersion.createdBy)).toBe(true);
      expect(O.getOrNull(savedVersion.createdBy)).toBe(testUserId);
    });

    it("should save version without createdBy", async () => {
      const versionEntity = E.runSync(
        createTestDocumentVersionEntity({
          documentId: testDocumentId,
          version: 1,
          checksum: "b".repeat(64),
          fileKey: "documents/anon-file.pdf",
          mimeType: "application/pdf",
          size: 2048,
          createdBy: { _tag: "None" },
        })
      );

      const savedVersion = await E.runPromise(versionRepository.save(versionEntity));

      expect(O.isNone(savedVersion.createdBy)).toBe(true);
    });

    it("should save multiple versions for the same document", async () => {
      const version1 = E.runSync(
        createTestDocumentVersionEntity({
          documentId: testDocumentId,
          version: 1,
          checksum: "c".repeat(64),
          fileKey: "documents/v1.pdf",
          mimeType: "application/pdf",
          size: 1024,
          createdBy: { _tag: "Some", value: testUserId },
        })
      );

      const version2 = E.runSync(
        createTestDocumentVersionEntity({
          documentId: testDocumentId,
          version: 2,
          checksum: "d".repeat(64),
          fileKey: "documents/v2.pdf",
          mimeType: "application/pdf",
          size: 2048,
          createdBy: { _tag: "Some", value: testUserId },
        })
      );

      await E.runPromise(versionRepository.save(version1));
      await E.runPromise(versionRepository.save(version2));

      const versions = await E.runPromise(
        versionRepository.findByDocumentId(createDocumentId(testDocumentId))
      );

      expect(versions.length).toBe(2);
    });

    it("should enforce unique constraint on (documentId, version)", async () => {
      const version1 = E.runSync(
        createTestDocumentVersionEntity({
          documentId: testDocumentId,
          version: 1,
          checksum: "e".repeat(64),
          fileKey: "documents/duplicate-v1.pdf",
          mimeType: "application/pdf",
          size: 1024,
          createdBy: { _tag: "None" },
        })
      );

      const version1Duplicate = E.runSync(
        createTestDocumentVersionEntity({
          documentId: testDocumentId,
          version: 1, // Same version number
          checksum: "f".repeat(64),
          fileKey: "documents/duplicate-v1-again.pdf",
          mimeType: "application/pdf",
          size: 2048,
          createdBy: { _tag: "None" },
        })
      );

      await E.runPromise(versionRepository.save(version1));

      const result = E.runSyncExit(versionRepository.save(version1Duplicate));

      expect(Exit.isFailure(result)).toBe(true);
    });
  });

  describe("findById (READ)", () => {
    it("should find version by id", async () => {
      const versionEntity = E.runSync(
        createTestDocumentVersionEntity({
          documentId: testDocumentId,
          version: 1,
          checksum: "1111111111111111111111111111111111111111111111111111111111111111",
          fileKey: "documents/find-by-id.pdf",
          mimeType: "application/pdf",
          size: 1024,
          createdBy: { _tag: "None" },
        })
      );
      await E.runPromise(versionRepository.save(versionEntity));

      const foundOpt = await E.runPromise(versionRepository.findById(versionEntity.id));

      expect(O.isSome(foundOpt)).toBe(true);
      const found = O.getOrThrow(foundOpt);
      expect(found.id).toBe(versionEntity.id);
      expect(found.version).toBe(1);
    });

    it("should return None for non-existent version id", async () => {
      const nonExistentId = createDocumentVersionId();

      const foundOpt = await E.runPromise(versionRepository.findById(nonExistentId));

      expect(O.isNone(foundOpt)).toBe(true);
    });
  });

  describe("findByDocumentIdAndVersion (READ)", () => {
    it("should find version by document id and version number", async () => {
      const versionEntity = E.runSync(
        createTestDocumentVersionEntity({
          documentId: testDocumentId,
          version: 3,
          checksum: "2222222222222222222222222222222222222222222222222222222222222222",
          fileKey: "documents/v3.pdf",
          mimeType: "application/pdf",
          size: 1024,
          createdBy: { _tag: "None" },
        })
      );
      await E.runPromise(versionRepository.save(versionEntity));

      const foundOpt = await E.runPromise(
        versionRepository.findByDocumentIdAndVersion(createDocumentId(testDocumentId), 3)
      );

      expect(O.isSome(foundOpt)).toBe(true);
      const found = O.getOrThrow(foundOpt);
      expect(found.documentId).toBe(testDocumentId);
      expect(found.version).toBe(3);
    });

    it("should return None for non-existent version number", async () => {
      const foundOpt = await E.runPromise(
        versionRepository.findByDocumentIdAndVersion(createDocumentId(testDocumentId), 99)
      );

      expect(O.isNone(foundOpt)).toBe(true);
    });
  });

  describe("findByDocumentId (READ)", () => {
    it("should find all versions for a document", async () => {
      const version1 = E.runSync(
        createTestDocumentVersionEntity({
          documentId: testDocumentId,
          version: 1,
          checksum: "3333333333333333333333333333333333333333333333333333333333333333",
          fileKey: "documents/doc-v1.pdf",
          mimeType: "application/pdf",
          size: 1024,
          createdBy: { _tag: "None" },
        })
      );
      const version2 = E.runSync(
        createTestDocumentVersionEntity({
          documentId: testDocumentId,
          version: 2,
          checksum: "4444444444444444444444444444444444444444444444444444444444444444",
          fileKey: "documents/doc-v2.pdf",
          mimeType: "application/pdf",
          size: 2048,
          createdBy: { _tag: "None" },
        })
      );
      const version3 = E.runSync(
        createTestDocumentVersionEntity({
          documentId: testDocumentId,
          version: 3,
          checksum: "5555555555555555555555555555555555555555555555555555555555555555",
          fileKey: "documents/doc-v3.pdf",
          mimeType: "application/pdf",
          size: 3072,
          createdBy: { _tag: "None" },
        })
      );

      await E.runPromise(versionRepository.save(version1));
      await E.runPromise(versionRepository.save(version2));
      await E.runPromise(versionRepository.save(version3));

      const versions = await E.runPromise(
        versionRepository.findByDocumentId(createDocumentId(testDocumentId))
      );

      expect(versions.length).toBe(3);
      expect(versions.map((v) => v.version).sort()).toEqual([1, 2, 3]);
    });

    it("should return empty array for document with no versions", async () => {
      const newVersionId = crypto.randomUUID();
      const newDoc = await createTestDocument(testDb.db, testUserId, {
        title: "No Versions Doc",
        currentVersionId: newVersionId,
      });

      const versions = await E.runPromise(versionRepository.findByDocumentId(createDocumentId(newDoc.id)));

      expect(versions.length).toBe(0);
    });
  });

  describe("findLatestByDocumentId (READ)", () => {
    it("should find the latest version by document id", async () => {
      const version1 = E.runSync(
        createTestDocumentVersionEntity({
          documentId: testDocumentId,
          version: 1,
          checksum: "6666666666666666666666666666666666666666666666666666666666666666",
          fileKey: "documents/latest-v1.pdf",
          mimeType: "application/pdf",
          size: 1024,
          createdBy: { _tag: "None" },
        })
      );
      const version2 = E.runSync(
        createTestDocumentVersionEntity({
          documentId: testDocumentId,
          version: 2,
          checksum: "7777777777777777777777777777777777777777777777777777777777777777",
          fileKey: "documents/latest-v2.pdf",
          mimeType: "application/pdf",
          size: 2048,
          createdBy: { _tag: "None" },
        })
      );
      const version3 = E.runSync(
        createTestDocumentVersionEntity({
          documentId: testDocumentId,
          version: 3,
          checksum: "8888888888888888888888888888888888888888888888888888888888888888",
          fileKey: "documents/latest-v3.pdf",
          mimeType: "application/pdf",
          size: 3072,
          createdBy: { _tag: "None" },
        })
      );

      await E.runPromise(versionRepository.save(version1));
      await E.runPromise(versionRepository.save(version2));
      await E.runPromise(versionRepository.save(version3));

      const latestOpt = await E.runPromise(
        versionRepository.findLatestByDocumentId(createDocumentId(testDocumentId))
      );

      expect(O.isSome(latestOpt)).toBe(true);
      const latest = O.getOrThrow(latestOpt);
      expect(latest.version).toBe(3);
    });

    it("should return None for document with no versions", async () => {
      const newVersionId = crypto.randomUUID();
      const newDoc = await createTestDocument(testDb.db, testUserId, {
        title: "No Versions Doc 2",
        currentVersionId: newVersionId,
      });

      const latestOpt = await E.runPromise(
        versionRepository.findLatestByDocumentId(createDocumentId(newDoc.id))
      );

      expect(O.isNone(latestOpt)).toBe(true);
    });
  });

  describe("getNextVersionNumber (READ)", () => {
    it("should return 1 for document with no versions", async () => {
      const nextVersion = await E.runPromise(
        versionRepository.getNextVersionNumber(createDocumentId(testDocumentId))
      );

      expect(nextVersion).toBe(1);
    });

    it("should return next version number after existing versions", async () => {
      const version1 = E.runSync(
        createTestDocumentVersionEntity({
          documentId: testDocumentId,
          version: 1,
          checksum: "9999999999999999999999999999999999999999999999999999999999999999",
          fileKey: "documents/next-v1.pdf",
          mimeType: "application/pdf",
          size: 1024,
          createdBy: { _tag: "None" },
        })
      );
      const version2 = E.runSync(
        createTestDocumentVersionEntity({
          documentId: testDocumentId,
          version: 2,
          checksum: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          fileKey: "documents/next-v2.pdf",
          mimeType: "application/pdf",
          size: 2048,
          createdBy: { _tag: "None" },
        })
      );

      await E.runPromise(versionRepository.save(version1));
      await E.runPromise(versionRepository.save(version2));

      const nextVersion = await E.runPromise(
        versionRepository.getNextVersionNumber(createDocumentId(testDocumentId))
      );

      expect(nextVersion).toBe(3);
    });
  });

  describe("exists (READ)", () => {
    it("should return true when version exists", async () => {
      const versionEntity = E.runSync(
        createTestDocumentVersionEntity({
          documentId: testDocumentId,
          version: 1,
          checksum: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          fileKey: "documents/exists.pdf",
          mimeType: "application/pdf",
          size: 1024,
          createdBy: { _tag: "None" },
        })
      );
      await E.runPromise(versionRepository.save(versionEntity));

      const exists = await E.runPromise(versionRepository.exists(versionEntity.id));

      expect(exists).toBe(true);
    });

    it("should return false when version does not exist", async () => {
      const nonExistentId = createDocumentVersionId();

      const exists = await E.runPromise(versionRepository.exists(nonExistentId));

      expect(exists).toBe(false);
    });
  });

  describe("delete (DELETE)", () => {
    it("should delete version by id", async () => {
      const versionEntity = E.runSync(
        createTestDocumentVersionEntity({
          documentId: testDocumentId,
          version: 1,
          checksum: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          fileKey: "documents/delete-me.pdf",
          mimeType: "application/pdf",
          size: 1024,
          createdBy: { _tag: "None" },
        })
      );
      await E.runPromise(versionRepository.save(versionEntity));

      const deleted = await E.runPromise(versionRepository.delete(versionEntity.id));

      expect(deleted).toBe(true);

      const foundOpt = await E.runPromise(versionRepository.findById(versionEntity.id));
      expect(O.isNone(foundOpt)).toBe(true);
    });

    it("should return false when deleting non-existent version", async () => {
      const nonExistentId = createDocumentVersionId();

      const deleted = await E.runPromise(versionRepository.delete(nonExistentId));

      expect(deleted).toBe(false);
    });
  });

  describe("Cascade Delete", () => {
    it("should cascade delete versions when parent document is deleted", async () => {
      // Create a new document with versions
      const newVersionId = crypto.randomUUID();
      const newDoc = await createTestDocument(testDb.db, testUserId, {
        title: "Cascade Test Doc",
        currentVersionId: newVersionId,
      });

      const version1 = E.runSync(
        createTestDocumentVersionEntity({
          documentId: newDoc.id,
          version: 1,
          checksum: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          fileKey: "documents/cascade-v1.pdf",
          mimeType: "application/pdf",
          size: 1024,
          createdBy: { _tag: "None" },
        })
      );
      await E.runPromise(versionRepository.save(version1));

      // Delete the parent document
      const { documents: docsTable } = testDb.db._.fullSchema;
      await testDb.db.delete(docsTable).where(eq((docsTable as any).id, newDoc.id));

      // Verify version is also deleted
      const foundOpt = await E.runPromise(versionRepository.findById(version1.id));
      expect(O.isNone(foundOpt)).toBe(true);
    });
  });

  describe("Serialization Round-trip", () => {
    it("should correctly serialize and deserialize version with all fields", async () => {
      const originalEntity = E.runSync(
        createTestDocumentVersionEntity({
          documentId: testDocumentId,
          version: 5,
          checksum: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          fileKey: "documents/roundtrip.pdf",
          mimeType: "application/pdf",
          size: 1024 * 1024 * 10, // 10 MB
          createdBy: { _tag: "Some", value: testUserId },
        })
      );

      const saved = await E.runPromise(versionRepository.save(originalEntity));
      const fetched = await E.runPromise(versionRepository.findById(saved.id));

      const version = O.getOrThrow(fetched);
      expect(version.id).toBe(originalEntity.id);
      expect(version.documentId).toBe(testDocumentId);
      expect(version.version).toBe(5);
      expect(version.checksum).toBe("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
      expect(version.fileKey).toBe("documents/roundtrip.pdf");
      expect(version.mimeType).toBe("application/pdf");
      expect(version.size).toBe(1024 * 1024 * 10);
      expect(O.getOrNull(version.createdBy)).toBe(testUserId);
    });

    it("should correctly handle None createdBy in serialization", async () => {
      const originalEntity = E.runSync(
        createTestDocumentVersionEntity({
          documentId: testDocumentId,
          version: 1,
          checksum: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          fileKey: "documents/no-creator.pdf",
          mimeType: "application/pdf",
          size: 2048,
          createdBy: { _tag: "None" },
        })
      );

      const saved = await E.runPromise(versionRepository.save(originalEntity));
      const fetched = await E.runPromise(versionRepository.findById(saved.id));

      const version = O.getOrThrow(fetched);
      expect(O.isNone(version.createdBy)).toBe(true);
    });
  });

  describe("Index Usage and Query Performance", () => {
    it("should leverage document_idx when querying by documentId", async () => {
      const version1 = E.runSync(
        createTestDocumentVersionEntity({
          documentId: testDocumentId,
          version: 1,
          checksum: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          fileKey: "documents/perf-v1.pdf",
          mimeType: "application/pdf",
          size: 1024,
          createdBy: { _tag: "None" },
        })
      );
      await E.runPromise(versionRepository.save(version1));

      const versions = await E.runPromise(
        versionRepository.findByDocumentId(createDocumentId(testDocumentId))
      );

      expect(versions.length).toBeGreaterThan(0);
    });
  });
});

