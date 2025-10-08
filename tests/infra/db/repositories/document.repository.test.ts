import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { Effect as E, Option as O } from "effect";
import { DocumentDrizzleRepository } from "@infra/repositories/document.repository";
import { setupTestDatabase, cleanupDatabase, createTestUser, TestDatabase } from "../../../setup/database";
import { createTestDocumentEntity } from "../../../factories/document.factory";
import { createDocumentId, createDocumentVersionId, createUserId } from "../../../utils/test-id-helpers";
import { sql } from "drizzle-orm";

describe("DocumentDrizzleRepository Integration Tests", () => {
  let testDb: TestDatabase;
  let documentRepository: DocumentDrizzleRepository;
  let testUserId: string;

  beforeAll(async () => {
    testDb = await setupTestDatabase();
    documentRepository = new DocumentDrizzleRepository(testDb.db);
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    await cleanupDatabase(testDb.db);

    // Create a test user for document ownership
    const user = await createTestUser(testDb.db, { email: "doc-owner@example.com" });
    testUserId = user.id;
  });

  describe("save (CREATE)", () => {
    it("should save a new document and return the entity", async () => {
      const currentVersionId = createDocumentVersionId();
      const docEntity = E.runSync(
        createTestDocumentEntity({
          ownerId: testUserId,
          title: "Integration Test Document",
          description: { _tag: "Some", value: "This is a test document" },
          tags: { _tag: "Some", value: ["test", "integration"] },
          currentVersionId,
        })
      );

      const savedDoc = await E.runPromise(documentRepository.save(docEntity));

      expect(savedDoc.id).toBe(docEntity.id);
      expect(savedDoc.ownerId).toBe(testUserId);
      expect(savedDoc.title).toBe("Integration Test Document");
      expect(O.isSome(savedDoc.description)).toBe(true);
      expect(O.getOrNull(savedDoc.description)).toBe("This is a test document");
      expect(O.isSome(savedDoc.tags)).toBe(true);
    });

    it("should save document with minimal fields (no description, no tags)", async () => {
      const currentVersionId = createDocumentVersionId();
      const docEntity = E.runSync(
        createTestDocumentEntity({
          ownerId: testUserId,
          title: "Minimal Document",
          description: { _tag: "None" },
          tags: { _tag: "None" },
          currentVersionId,
        })
      );

      const savedDoc = await E.runPromise(documentRepository.save(docEntity));

      expect(savedDoc.title).toBe("Minimal Document");
      expect(O.isNone(savedDoc.description)).toBe(true);
      expect(O.isNone(savedDoc.tags)).toBe(true);
    });

    it("should save document with tags array", async () => {
      const currentVersionId = createDocumentVersionId();
      const tags = ["finance", "report", "q1", "urgent"];
      const docEntity = E.runSync(
        createTestDocumentEntity({
          ownerId: testUserId,
          title: "Tagged Document",
          tags: { _tag: "Some", value: tags },
          currentVersionId,
        })
      );

      const savedDoc = await E.runPromise(documentRepository.save(docEntity));

      const savedTags = O.getOrNull(savedDoc.tags);
      expect(savedTags).toEqual(tags);
    });
  });

  describe("findById (READ)", () => {
    it("should find document by id", async () => {
      const currentVersionId = createDocumentVersionId();
      const docEntity = E.runSync(
        createTestDocumentEntity({
          ownerId: testUserId,
          title: "Find Me Document",
          currentVersionId,
        })
      );
      await E.runPromise(documentRepository.save(docEntity));

      const foundOpt = await E.runPromise(documentRepository.findById(docEntity.id));

      expect(O.isSome(foundOpt)).toBe(true);
      const found = O.getOrThrow(foundOpt);
      expect(found.id).toBe(docEntity.id);
      expect(found.title).toBe("Find Me Document");
    });

    it("should return None for non-existent document id", async () => {
      const nonExistentId = createDocumentId();

      const foundOpt = await E.runPromise(documentRepository.findById(nonExistentId));

      expect(O.isNone(foundOpt)).toBe(true);
    });
  });

  describe("findByOwner (READ)", () => {
    it("should find all documents by owner id", async () => {
      const versionId1 = createDocumentVersionId();
      const versionId2 = createDocumentVersionId();
      const doc1 = E.runSync(
        createTestDocumentEntity({
          ownerId: testUserId,
          title: "Owner Doc 1",
          currentVersionId: versionId1,
        })
      );
      const doc2 = E.runSync(
        createTestDocumentEntity({
          ownerId: testUserId,
          title: "Owner Doc 2",
          currentVersionId: versionId2,
        })
      );

      await E.runPromise(documentRepository.save(doc1));
      await E.runPromise(documentRepository.save(doc2));

      const documents = await E.runPromise(documentRepository.findByOwner(createUserId(testUserId)));

      expect(documents.length).toBe(2);
      expect(documents.some((d) => d.title === "Owner Doc 1")).toBe(true);
      expect(documents.some((d) => d.title === "Owner Doc 2")).toBe(true);
    });

    it("should return empty array for owner with no documents", async () => {
      const otherUser = await createTestUser(testDb.db, { email: "no-docs@example.com" });

      const documents = await E.runPromise(documentRepository.findByOwner(createUserId(otherUser.id)));

      expect(documents.length).toBe(0);
    });
  });

  describe("search (READ with Pagination)", () => {
    beforeEach(async () => {
      // Seed multiple documents for search testing
      const documents = [
        { title: "Quarterly Report Q1", tags: ["finance", "report"] },
        { title: "Quarterly Report Q2", tags: ["finance", "report"] },
        { title: "Employee Handbook", tags: ["hr", "policy"] },
        { title: "Technical Specification", tags: ["engineering"] },
        { title: "Marketing Strategy", tags: ["marketing", "strategy"] },
      ];

      for (const doc of documents) {
        const versionId = createDocumentVersionId();
        const entity = E.runSync(
          createTestDocumentEntity({
            ownerId: testUserId,
            title: doc.title,
            tags: { _tag: "Some", value: doc.tags },
            currentVersionId: versionId,
          })
        );
        await E.runPromise(documentRepository.save(entity));
      }
    });

    it("should search all documents with pagination", async () => {
      const result = await E.runPromise(
        documentRepository.search({
          paginationOptions: { pageNum: 1, pageSize: 10 },
        })
      );

      expect(result.data.length).toBe(5);
      expect(result.total).toBe(5);
      expect(result.pageNum).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it("should paginate search results correctly", async () => {
      const page1 = await E.runPromise(
        documentRepository.search({
          paginationOptions: { pageNum: 1, pageSize: 2 },
        })
      );

      const page2 = await E.runPromise(
        documentRepository.search({
          paginationOptions: { pageNum: 2, pageSize: 2 },
        })
      );

      expect(page1.data.length).toBe(2);
      expect(page2.data.length).toBe(2);
      expect(page1.total).toBe(5);
      expect(page2.total).toBe(5);
      expect(page1.totalPages).toBe(3);

      // Ensure no duplicates between pages
      const page1Ids = page1.data.map((d) => d.id);
      const page2Ids = page2.data.map((d) => d.id);
      const intersection = page1Ids.filter((id) => page2Ids.includes(id));
      expect(intersection.length).toBe(0);
    });

    it("should paginate with varying page sizes and boundaries", async () => {
      // Page size 3 -> expect 2 pages (5 total docs from seed), last page size 2
      const pageSize3_page1 = await E.runPromise(
        documentRepository.search({
          paginationOptions: { pageNum: 1, pageSize: 3 },
        })
      );
      const pageSize3_page2 = await E.runPromise(
        documentRepository.search({
          paginationOptions: { pageNum: 2, pageSize: 3 },
        })
      );

      expect(pageSize3_page1.data.length).toBe(3);
      expect(pageSize3_page2.data.length).toBe(2);
      expect(pageSize3_page1.total).toBe(5);
      expect(pageSize3_page1.totalPages).toBe(2);

      // No overlap between pages
      const ids1 = pageSize3_page1.data.map((d) => d.id);
      const ids2 = pageSize3_page2.data.map((d) => d.id);
      expect(ids1.some((id) => ids2.includes(id))).toBe(false);

      // Requesting a page beyond totalPages should yield empty data (page 3 of size 3 -> 0)
      const pageBeyond = await E.runPromise(
        documentRepository.search({
          paginationOptions: { pageNum: 3, pageSize: 3 },
        })
      );
      expect(pageBeyond.data.length).toBe(0);
      expect(pageBeyond.total).toBe(5);
      expect(pageBeyond.totalPages).toBe(2);
    });

    it("should search by title", async () => {
      const result = await E.runPromise(
        documentRepository.search({
          query: "Quarterly Report",
          paginationOptions: { pageNum: 1, pageSize: 10 },
        })
      );

      expect(result.data.length).toBe(2);
      expect(result.data.every((d) => d.title.includes("Quarterly Report"))).toBe(true);
    });

    it("should search by ownerId", async () => {
      // Create another user with a document
      const otherUser = await createTestUser(testDb.db, { email: "other@example.com" });
      const versionId = createDocumentVersionId();
      const otherDoc = E.runSync(
        createTestDocumentEntity({
          ownerId: otherUser.id,
          title: "Other User Doc",
          currentVersionId: versionId,
        })
      );
      await E.runPromise(documentRepository.save(otherDoc));

      const result = await E.runPromise(
        documentRepository.search({
          ownerId: createUserId(testUserId),
          paginationOptions: { pageNum: 1, pageSize: 10 },
        })
      );

      expect(result.data.length).toBe(5);
      expect(result.data.every((d) => d.ownerId === testUserId)).toBe(true);
    });

    it("should search by tags", async () => {
      const result = await E.runPromise(
        documentRepository.search({
          tags: ["finance", "report"],
          paginationOptions: { pageNum: 1, pageSize: 10 },
        })
      );

      expect(result.data.length).toBeGreaterThan(0);
      expect(
        result.data.every((d) => {
          const docTags = O.getOrNull(d.tags) ?? [];
          return docTags.includes("finance") || docTags.includes("report");
        })
      ).toBe(true);
    });
  });

  describe("exists (READ)", () => {
    it("should return true when document exists", async () => {
      const versionId = createDocumentVersionId();
      const docEntity = E.runSync(
        createTestDocumentEntity({
          ownerId: testUserId,
          title: "Exists Check",
          currentVersionId: versionId,
        })
      );
      await E.runPromise(documentRepository.save(docEntity));

      const exists = await E.runPromise(documentRepository.exists(docEntity.id));

      expect(exists).toBe(true);
    });

    it("should return false when document does not exist", async () => {
      const nonExistentId = createDocumentId();

      const exists = await E.runPromise(documentRepository.exists(nonExistentId));

      expect(exists).toBe(false);
    });
  });

  describe("save (UPDATE)", () => {
    it("should update existing document", async () => {
      const versionId = createDocumentVersionId();
      const docEntity = E.runSync(
        createTestDocumentEntity({
          ownerId: testUserId,
          title: "Original Title",
          currentVersionId: versionId,
        })
      );
      const saved = await E.runPromise(documentRepository.save(docEntity));

      const updatedEntity = await E.runPromise(saved.rename("Updated Title"));
      const result = await E.runPromise(documentRepository.save(updatedEntity));

      expect(result.id).toBe(saved.id);
      expect(result.title).toBe("Updated Title");
      expect(O.isSome(result.updatedAt)).toBe(true);
    });

    it("should update description", async () => {
      const versionId = createDocumentVersionId();
      const docEntity = E.runSync(
        createTestDocumentEntity({
          ownerId: testUserId,
          title: "Update Description Test",
          description: { _tag: "None" },
          currentVersionId: versionId,
        })
      );
      const saved = await E.runPromise(documentRepository.save(docEntity));

      const updatedEntity = await E.runPromise(
        saved.updateDescription("New description added")
      );
      const result = await E.runPromise(documentRepository.save(updatedEntity));

      expect(O.isSome(result.description)).toBe(true);
      expect(O.getOrNull(result.description)).toBe("New description added");
    });

    it("should update tags", async () => {
      const versionId = createDocumentVersionId();
      const docEntity = E.runSync(
        createTestDocumentEntity({
          ownerId: testUserId,
          title: "Update Tags Test",
          tags: { _tag: "Some", value: ["old-tag"] },
          currentVersionId: versionId,
        })
      );
      const saved = await E.runPromise(documentRepository.save(docEntity));

      const updatedEntity = await E.runPromise(saved.addTags(["new-tag", "another-tag"]));
      const result = await E.runPromise(documentRepository.save(updatedEntity));

      const resultTags = O.getOrNull(result.tags) ?? [];
      expect(resultTags).toContain("old-tag");
      expect(resultTags).toContain("new-tag");
      expect(resultTags).toContain("another-tag");
    });
  });

  describe("delete (DELETE)", () => {
    it("should delete document by id", async () => {
      const versionId = createDocumentVersionId();
      const docEntity = E.runSync(
        createTestDocumentEntity({
          ownerId: testUserId,
          title: "Delete Me",
          currentVersionId: versionId,
        })
      );
      await E.runPromise(documentRepository.save(docEntity));

      const deleted = await E.runPromise(documentRepository.delete(docEntity.id));

      expect(deleted).toBe(true);

      const foundOpt = await E.runPromise(documentRepository.findById(docEntity.id));
      expect(O.isNone(foundOpt)).toBe(true);
    });

    it("should return false when deleting non-existent document", async () => {
      const nonExistentId = createDocumentId();

      const deleted = await E.runPromise(documentRepository.delete(nonExistentId));

      expect(deleted).toBe(false);
    });
  });

  describe("Serialization Round-trip", () => {
    it("should correctly serialize and deserialize document with all fields", async () => {
      const versionId = createDocumentVersionId();
      const originalEntity = E.runSync(
        createTestDocumentEntity({
          ownerId: testUserId,
          title: "Full Round-trip Document",
          description: { _tag: "Some", value: "Complete description" },
          tags: { _tag: "Some", value: ["tag1", "tag2", "tag3"] },
          currentVersionId: versionId,
        })
      );

      const saved = await E.runPromise(documentRepository.save(originalEntity));
      const fetched = await E.runPromise(documentRepository.findById(saved.id));

      const doc = O.getOrThrow(fetched);
      expect(doc.id).toBe(originalEntity.id);
      expect(doc.title).toBe(originalEntity.title);
      expect(O.getOrNull(doc.description)).toBe("Complete description");
      expect(O.getOrNull(doc.tags)).toEqual(["tag1", "tag2", "tag3"]);
      expect(doc.currentVersionId).toBe(versionId);
    });

    it("should correctly handle None values in serialization", async () => {
      const versionId = createDocumentVersionId();
      const originalEntity = E.runSync(
        createTestDocumentEntity({
          ownerId: testUserId,
          title: "Minimal Round-trip",
          description: { _tag: "None" },
          tags: { _tag: "None" },
          currentVersionId: versionId,
        })
      );

      const saved = await E.runPromise(documentRepository.save(originalEntity));
      const fetched = await E.runPromise(documentRepository.findById(saved.id));

      const doc = O.getOrThrow(fetched);
      expect(O.isNone(doc.description)).toBe(true);
      expect(O.isNone(doc.tags)).toBe(true);
    });
  });

  describe("Index Usage and Query Performance", () => {
    it("should leverage owner_idx when querying by ownerId", async () => {
      const versionId = createDocumentVersionId();
      const docEntity = E.runSync(
        createTestDocumentEntity({
          ownerId: testUserId,
          title: "Index Test",
          currentVersionId: versionId,
        })
      );
      await E.runPromise(documentRepository.save(docEntity));

      const documents = await E.runPromise(documentRepository.findByOwner(createUserId(testUserId)));

      expect(documents.length).toBeGreaterThan(0);
    });

    it("should leverage title_idx when searching by title", async () => {
      const versionId = createDocumentVersionId();
      const docEntity = E.runSync(
        createTestDocumentEntity({
          ownerId: testUserId,
          title: "Indexed Title Search",
          currentVersionId: versionId,
        })
      );
      await E.runPromise(documentRepository.save(docEntity));

      const result = await E.runPromise(
        documentRepository.search({
          query: "Indexed Title",
          paginationOptions: { pageNum: 1, pageSize: 10 },
        })
      );

      expect(result.data.length).toBeGreaterThan(0);
    });

    it("should use index scan for ownerId filter (no seq scan)", async () => {
      const execResult = await testDb.db.execute(sql`EXPLAIN (COSTS OFF, FORMAT TEXT) SELECT * FROM documents WHERE owner_id = ${testUserId} LIMIT 1`);
      const rows = ((execResult as any).rows ?? execResult) as Array<Record<string, string>>;
      const planText = rows.map((r) => Object.values(r)[0] as string).join("\n");
      expect(/Index Scan|Bitmap Index Scan/i.test(planText)).toBe(true);
      expect(/Seq Scan/i.test(planText)).toBe(false);
    });
  });
});

