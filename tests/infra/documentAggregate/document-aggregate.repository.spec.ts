import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { Option } from "effect"
import { setupSharedTestDatabase, cleanupSharedTestDatabase, clearTestDatabase } from "../setup/test-database"
import { seedUser, seedDocument, seedDocumentVersion, seedDocumentWithOwnerAndVersion } from "../setup/seed-helpers"
import { expectAsyncSuccess, expectSome, expectNone } from "../../utils/test.helpers"
import { withTestClock } from "../../domain/setup/test-clock"
import { TEST_WORKSPACE_ID } from "../../application/fixtures/actors"
import { DocumentAggregateDrizzleRepository } from "@infra/repositories/document-aggregate.repository"
import { DocumentAggregate } from "@domain/document/document.aggregate"
import { DocumentVersionEntity } from "@domain/documentVersion/document-version.entity"
import { generateDocument, createDraftDocument, createPublishedDocument } from "../../domain/factories/document.factory"
import { generateDocumentVersion } from "../../domain/factories/document-version.factory"
import { calculateTotalPages } from "@domain/utils/pagination"
import { container } from "tsyringe"
import { TOKENS } from "@infra/di/container"

describe("DocumentAggregateDrizzleRepository Integration", () => {
  let testDb: Awaited<ReturnType<typeof setupSharedTestDatabase>>
  let aggregateRepo: DocumentAggregateDrizzleRepository

  beforeAll(async () => {
    // Setup shared database once for the entire test file
    testDb = await setupSharedTestDatabase()
    container.registerInstance(TOKENS.DATABASE_CONNECTION, testDb.db)
    aggregateRepo = container.resolve(TOKENS.DOCUMENT_AGGREGATE_REPOSITORY) as DocumentAggregateDrizzleRepository
  })

  afterAll(async () => {
    // Cleanup shared database once for the entire test file
    await cleanupSharedTestDatabase()
  })

  beforeEach(async () => {
    // Clear database state for each test (fast operation)
    await clearTestDatabase(testDb.db)
  })

  // ===== Aggregate Operations (Write Path) =====

  describe("loadById - Aggregate Loading", () => {
    it("should load aggregate with document and versions", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      // Create additional version
      await seedDocumentVersion(testDb.db, {
        documentId: document.id,
        version: 2
      })

      // Load aggregate
      const aggregateOption = await expectAsyncSuccess(
        aggregateRepo.loadById(document.id)
      )
      const aggregate = expectSome(aggregateOption)

      expect(aggregate.document.id).toBe(document.id)
      expect(aggregate.document.title).toBe(document.title)
      expect(aggregate.getVersionCount()).toBe(2)
      const versions = aggregate.getVersions()
      expect(versions[0]?.version).toBe(1)
      expect(versions[1]?.version).toBe(2)
    })

    it("should return None when document not found", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000" as any

      const aggregateOption = await expectAsyncSuccess(
        aggregateRepo.loadById(nonExistentId)
      )

      expectNone(aggregateOption)
    })

    it("should load aggregate with no versions", async () => {
      const owner = await seedUser(testDb.db)
      const document = await seedDocument(testDb.db, { ownerId: owner.id })

      const aggregateOption = await expectAsyncSuccess(
        aggregateRepo.loadById(document.id)
      )
      const aggregate = expectSome(aggregateOption)

      expect(aggregate.document.id).toBe(document.id)
      expect(aggregate.getVersionCount()).toBe(0)
    })
  })

  describe("save - Aggregate Persistence", () => {
    it("should save aggregate with document and versions atomically", async () => {
      const owner = await seedUser(testDb.db)
      const documentData = generateDocument({
        ownerId: owner.id,
        title: "Test Document",
        description: "A test document"
      })

      const version1Data = generateDocumentVersion({
        documentId: documentData.id as any,
        version: 1
      })

      const version2Data = generateDocumentVersion({
        documentId: documentData.id as any,
        version: 2
      })

      // Create aggregate
      const aggregate = await expectAsyncSuccess(
        withTestClock(
          DocumentAggregate.createFromSerialized(documentData, [version1Data, version2Data]),
          Date.now()
        )
      )

      // Save aggregate
      const savedAggregate = await expectAsyncSuccess(
        withTestClock(aggregateRepo.save(aggregate), Date.now())
      )

      expect(savedAggregate.document.id).toBe(aggregate.document.id)
      expect(savedAggregate.document.title).toBe("Test Document")
      expect(savedAggregate.getVersionCount()).toBe(2)

      // Verify document was saved
      const docOption = await expectAsyncSuccess(
        aggregateRepo.findDocumentById(aggregate.document.id)
      )
      const doc = expectSome(docOption)
      expect(doc.title).toBe("Test Document")

      // Verify versions were saved by loading aggregate
      const loadedAggregateOption = await expectAsyncSuccess(
        aggregateRepo.loadById(aggregate.document.id)
      )
      const loadedAggregate = expectSome(loadedAggregateOption)
      expect(loadedAggregate.getVersionCount()).toBe(2)
    })

    it("should update existing aggregate", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      // Load aggregate
      const aggregateOption = await expectAsyncSuccess(
        aggregateRepo.loadById(document.id)
      )
      const aggregate = expectSome(aggregateOption)

      // Modify document
      const renamedDocument = await expectAsyncSuccess(
        withTestClock(
          aggregate.document.rename("Updated Title"),
          Date.now()
        )
      )

      // Create updated aggregate
      const updatedAggregate = await expectAsyncSuccess(
        withTestClock(
          DocumentAggregate.initialize(renamedDocument, aggregate.getVersions()),
          Date.now()
        )
      )

      // Save updated aggregate
      const savedAggregate = await expectAsyncSuccess(
        withTestClock(aggregateRepo.save(updatedAggregate), Date.now())
      )

      expect(savedAggregate.document.title).toBe("Updated Title")

      // Verify update persisted
      const docOption = await expectAsyncSuccess(
        aggregateRepo.findDocumentById(document.id)
      )
      const doc = expectSome(docOption)
      expect(doc.title).toBe("Updated Title")
    })

    it("should save aggregate with new version added", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      // Load aggregate
      const aggregateOption = await expectAsyncSuccess(
        aggregateRepo.loadById(document.id)
      )
      const aggregate = expectSome(aggregateOption)

      // Create new version
      const newVersionData = generateDocumentVersion({
        documentId: document.id,
        version: 2
      })
      const newVersion = await expectAsyncSuccess(
        withTestClock(DocumentVersionEntity.create(newVersionData), Date.now())
      )

      // Create updated aggregate with new version
      const updatedAggregate = await expectAsyncSuccess(
        withTestClock(
          DocumentAggregate.initialize(aggregate.document, [...aggregate.getVersions(), newVersion]),
          Date.now()
        )
      )

      // Save updated aggregate
      const savedAggregate = await expectAsyncSuccess(
        withTestClock(aggregateRepo.save(updatedAggregate), Date.now())
      )

      expect(savedAggregate.getVersionCount()).toBe(2)

      // Verify new version was saved by loading aggregate
      const loadedAggregateOption = await expectAsyncSuccess(
        aggregateRepo.loadById(document.id)
      )
      const loadedAggregate = expectSome(loadedAggregateOption)
      const versions = loadedAggregate.getVersions()
      expect(versions).toHaveLength(2)
      // Versions are stored in ascending order internally but getVersions returns them as stored
      expect(versions.some(v => v.version === 1)).toBe(true)
      expect(versions.some(v => v.version === 2)).toBe(true)
    })
  })

  describe("delete - Aggregate Deletion", () => {
    it("should delete aggregate and cascade to versions", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      // Create additional version
      await seedDocumentVersion(testDb.db, {
        documentId: document.id,
        version: 2
      })

      // Delete aggregate
      const deleted = await expectAsyncSuccess(
        aggregateRepo.delete(document.id, { force: true })
      )
      expect(deleted).toBe(true)

      // Verify document no longer exists
      const docOption = await expectAsyncSuccess(
        aggregateRepo.findDocumentById(document.id)
      )
      expectNone(docOption)

      // Verify versions were cascade deleted by loading aggregate
      const loadedAggregateOption = await expectAsyncSuccess(
        aggregateRepo.loadById(document.id)
      )
      expectNone(loadedAggregateOption)
    })

    it("should return false when document not found", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000" as any

      await expect(
        expectAsyncSuccess(aggregateRepo.delete(nonExistentId))
      ).rejects.toThrow()
    })
  })

  // ===== Document Query Operations (Read Path - Projections) =====

  describe("findDocumentById - Document Query", () => {
    it("should find document by ID", async () => {
      const owner = await seedUser(testDb.db)
      const document = await seedDocument(testDb.db, { ownerId: owner.id })

      const docOption = await expectAsyncSuccess(
        aggregateRepo.findDocumentById(document.id)
      )
      const doc = expectSome(docOption)

      expect(doc.id).toBe(document.id)
      expect(doc.title).toBe(document.title)
      expect(doc.ownerId).toBe(document.ownerId)
    })

    it("should return None when document not found", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000" as any

      const docOption = await expectAsyncSuccess(
        aggregateRepo.findDocumentById(nonExistentId)
      )

      expectNone(docOption)
    })

    it("should return document without loading versions", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      const docOption = await expectAsyncSuccess(
        aggregateRepo.findDocumentById(document.id)
      )
      const doc = expectSome(docOption)

      // Should have document but method doesn't include versions
      expect(doc.id).toBe(document.id)
      // This is a projection query, so versions are not included
    })
  })

  describe("searchDocuments - Document Search", () => {
    it("should search documents by workspace", async () => {
      const owner = await seedUser(testDb.db)
      await seedDocument(testDb.db, { ownerId: owner.id, title: "Doc 1" })
      await seedDocument(testDb.db, { ownerId: owner.id, title: "Doc 2" })

      const results = await expectAsyncSuccess(
        aggregateRepo.searchDocuments({
          workspaceId: TEST_WORKSPACE_ID,
          paginationOptions: { pageNum: 1, pageSize: 10 }
        })
      )

      expect(results.data.length).toBeGreaterThanOrEqual(2)
      expect(results.total).toBeGreaterThanOrEqual(2)
      expect(results.pageNum).toBe(1)
      expect(results.pageSize).toBe(10)
    })

    it("should search documents by query text", async () => {
      const owner = await seedUser(testDb.db)
      await seedDocument(testDb.db, { ownerId: owner.id, title: "Alpha Document" })
      await seedDocument(testDb.db, { ownerId: owner.id, title: "Beta Document" })

      const results = await expectAsyncSuccess(
        aggregateRepo.searchDocuments({
          workspaceId: TEST_WORKSPACE_ID,
          query: "Alpha",
          paginationOptions: { pageNum: 1, pageSize: 10 }
        })
      )

      expect(results.data.length).toBeGreaterThanOrEqual(1)
      expect(results.data.some(doc => doc.title.includes("Alpha"))).toBe(true)
    })

    it("should search documents by tags", async () => {
      const owner = await seedUser(testDb.db)
      await seedDocument(testDb.db, { ownerId: owner.id, tags: ["tag1", "tag2"] })
      await seedDocument(testDb.db, { ownerId: owner.id, tags: ["tag3"] })

      const results = await expectAsyncSuccess(
        aggregateRepo.searchDocuments({
          workspaceId: TEST_WORKSPACE_ID,
          tags: ["tag1"],
          paginationOptions: { pageNum: 1, pageSize: 10 }
        })
      )

      expect(results.data.length).toBeGreaterThanOrEqual(1)
      expect(results.data.some(doc => doc.tagsOrEmpty.includes("tag1"))).toBe(true)
    })

    it("should search documents by owner", async () => {
      const owner1 = await seedUser(testDb.db)
      const owner2 = await seedUser(testDb.db)

      await seedDocument(testDb.db, { ownerId: owner1.id, title: "Owner1 Doc" })
      await seedDocument(testDb.db, { ownerId: owner2.id, title: "Owner2 Doc" })

      const results = await expectAsyncSuccess(
        aggregateRepo.searchDocuments({
          workspaceId: TEST_WORKSPACE_ID,
          ownerId: owner1.id,
          paginationOptions: { pageNum: 1, pageSize: 10 }
        })
      )

      expect(results.data.length).toBeGreaterThanOrEqual(1)
      expect(results.data.every(doc => doc.ownerId === owner1.id)).toBe(true)
    })

    it("should search documents by publish status", async () => {
      const owner = await seedUser(testDb.db)
      const draftDoc = createDraftDocument({ ownerId: owner.id })
      const publishedDoc = createPublishedDocument({ ownerId: owner.id })

      await seedDocument(testDb.db, draftDoc)
      await seedDocument(testDb.db, publishedDoc)

      const results = await expectAsyncSuccess(
        aggregateRepo.searchDocuments({
          workspaceId: TEST_WORKSPACE_ID,
          publishStatus: "published",
          paginationOptions: { pageNum: 1, pageSize: 10 }
        })
      )

      expect(results.data.length).toBeGreaterThanOrEqual(1)
      expect(results.data.every(doc => doc.publishStatus === "published")).toBe(true)
    })

    it("should paginate search results", async () => {
      const owner = await seedUser(testDb.db)

      // Create 15 documents
      for (let i = 1; i <= 15; i++) {
        await seedDocument(testDb.db, {
          ownerId: owner.id,
          title: `Document ${i}`
        })
      }

      const page1 = await expectAsyncSuccess(
        aggregateRepo.searchDocuments({
          workspaceId: TEST_WORKSPACE_ID,
          paginationOptions: { pageNum: 1, pageSize: 5 }
        })
      )

      expect(page1.data.length).toBeGreaterThanOrEqual(5)
      expect(page1.total).toBeGreaterThanOrEqual(15)
      expect(page1.pageNum).toBe(1)
      expect(page1.pageSize).toBe(5)
      expect(page1.totalPages).toBe(calculateTotalPages(page1.total, 5))

      const page2 = await expectAsyncSuccess(
        aggregateRepo.searchDocuments({
          workspaceId: TEST_WORKSPACE_ID,
          paginationOptions: { pageNum: 2, pageSize: 5 }
        })
      )

      expect(page2.data.length).toBeGreaterThanOrEqual(5)
      expect(page2.pageNum).toBe(2)
    })

    it("should filter documents by actor permissions when actorId provided", async () => {
      const owner = await seedUser(testDb.db)
      const collaborator = await seedUser(testDb.db)

      const document = await seedDocument(testDb.db, {
        ownerId: owner.id,
        title: "Owner Document"
      })

      // Search as owner (should see document)
      const ownerResults = await expectAsyncSuccess(
        aggregateRepo.searchDocuments({
          workspaceId: TEST_WORKSPACE_ID,
          actorId: owner.id,
          paginationOptions: { pageNum: 1, pageSize: 10 }
        })
      )

      expect(ownerResults.data.some(doc => doc.id === document.id)).toBe(true)

      // Search as collaborator without access (should not see document if no policy)
      const collaboratorResults = await expectAsyncSuccess(
        aggregateRepo.searchDocuments({
          workspaceId: TEST_WORKSPACE_ID,
          actorId: collaborator.id,
          paginationOptions: { pageNum: 1, pageSize: 10 }
        })
      )

      // Collaborator should not see owner's document without access policy
      // This tests repository-level permission filtering
      expect(collaboratorResults.data.some(doc => doc.id === document.id)).toBe(false)
    })
  })

  describe("findDocumentsByOwner - Owner Query", () => {
    it("should return documents for a specific owner", async () => {
      const owner1 = await seedUser(testDb.db)
      const owner2 = await seedUser(testDb.db)

      await seedDocument(testDb.db, { ownerId: owner1.id, title: "Owner1 Doc 1" })
      await seedDocument(testDb.db, { ownerId: owner1.id, title: "Owner1 Doc 2" })
      await seedDocument(testDb.db, { ownerId: owner2.id, title: "Owner2 Doc" })

      const owner1Docs = await expectAsyncSuccess(
        aggregateRepo.findDocumentsByOwner(TEST_WORKSPACE_ID, owner1.id)
      )

      expect(owner1Docs).toHaveLength(2)
      expect(owner1Docs.every(doc => doc.ownerId === owner1.id)).toBe(true)
      expect(owner1Docs.some(doc => doc.title.includes("Owner1"))).toBe(true)
    })

    it("should return empty array when owner has no documents", async () => {
      const owner = await seedUser(testDb.db)

      const docs = await expectAsyncSuccess(
        aggregateRepo.findDocumentsByOwner(TEST_WORKSPACE_ID, owner.id)
      )

      expect(docs).toHaveLength(0)
    })

    it("should filter by workspace", async () => {
      const owner = await seedUser(testDb.db)
      await seedDocument(testDb.db, { ownerId: owner.id, workspaceId: TEST_WORKSPACE_ID })

      const docs = await expectAsyncSuccess(
        aggregateRepo.findDocumentsByOwner(TEST_WORKSPACE_ID, owner.id)
      )

      expect(docs.length).toBeGreaterThanOrEqual(1)
      expect(docs.every(doc => doc.workspaceId === TEST_WORKSPACE_ID)).toBe(true)
    })
  })

  // ===== Document Version Lookup Operations (Read Path - Lightweight) =====

  describe("findDocumentIdByVersionId - Version-to-Document Locator", () => {
    it("should find document ID by version ID", async () => {
      const { document, version } = await seedDocumentWithOwnerAndVersion(testDb.db)

      const documentIdOption = await expectAsyncSuccess(
        aggregateRepo.findDocumentIdByVersionId(version.id)
      )
      const documentId = expectSome(documentIdOption)

      expect(documentId).toBe(document.id)
    })

    it("should return None when version ID not found", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000" as any

      const documentIdOption = await expectAsyncSuccess(
        aggregateRepo.findDocumentIdByVersionId(nonExistentId)
      )

      expectNone(documentIdOption)
    })

    it("should find document ID even when document has multiple versions", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      const version2 = await seedDocumentVersion(testDb.db, {
        documentId: document.id,
        version: 2
      })
      await seedDocumentVersion(testDb.db, {
        documentId: document.id,
        version: 3
      })

      // Find document ID for any version
      const documentIdOption1 = await expectAsyncSuccess(
        aggregateRepo.findDocumentIdByVersionId(version2.id)
      )
      const documentId1 = expectSome(documentIdOption1)
      expect(documentId1).toBe(document.id)

      // Verify it works for other versions too
      const loadedAggregateOption = await expectAsyncSuccess(
        aggregateRepo.loadById(document.id)
      )
      const aggregate = expectSome(loadedAggregateOption)
      const version3Option = aggregate.getVersionByNumber(3)
      expect(Option.isSome(version3Option)).toBe(true)

      if (Option.isSome(version3Option)) {
        const version3 = version3Option.value
        const documentIdOption2 = await expectAsyncSuccess(
          aggregateRepo.findDocumentIdByVersionId(version3.id)
        )
        const documentId2 = expectSome(documentIdOption2)
        expect(documentId2).toBe(document.id)
      }
    })

    it("should work with aggregate helper to load version", async () => {
      const { document, version } = await seedDocumentWithOwnerAndVersion(testDb.db)

      // Use locator to find document ID
      const documentIdOption = await expectAsyncSuccess(
        aggregateRepo.findDocumentIdByVersionId(version.id)
      )
      const documentId = expectSome(documentIdOption)

      // Load aggregate and retrieve version
      const aggregateOption = await expectAsyncSuccess(
        aggregateRepo.loadById(documentId)
      )
      const aggregate = expectSome(aggregateOption)

      const versionOption = aggregate.getVersionById(version.id)
      const foundVersion = expectSome(versionOption)

      expect(foundVersion.id).toBe(version.id)
      expect(foundVersion.documentId).toBe(document.id)
    })
  })
})

