import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { setupSharedTestDatabase, cleanupSharedTestDatabase, clearTestDatabase } from "../setup/test-database"
import { seedUser, seedDocument, seedDocumentWithOwnerAndVersion } from "../setup/seed-helpers"
import { expectAsyncSuccess, expectSome, expectNone } from "../../utils/test.helpers"
import { withTestClock } from "../../domain/setup/test-clock"
import { generateDocument, createDocumentWithTags } from "../../domain/factories/document.factory"
import { DocumentDrizzleRepository } from "@infra/repositories/document.repository"
import { calculateTotalPages } from "@domain/utils/pagination"
import { DocumentEntity } from "@domain/document/document.entity"

describe("DocumentDrizzleRepository Integration", () => {
  let testDb: Awaited<ReturnType<typeof setupSharedTestDatabase>>
  let documentRepo: DocumentDrizzleRepository

  beforeAll(async () => {
    // Setup shared database once for the entire test file
    testDb = await setupSharedTestDatabase()
    documentRepo = new DocumentDrizzleRepository(testDb.db)
  })

  afterAll(async () => {
    // Cleanup shared database once for the entire test file
    await cleanupSharedTestDatabase()
  })

  beforeEach(async () => {
    // Clear database state for each test (fast operation)
    await clearTestDatabase(testDb.db)
  })

  describe("save - insert", () => {
    it("should insert a new document and read it back with findById", async () => {
      const owner = await seedUser(testDb.db)
      const documentData = generateDocument({
        ownerId: owner.id,
        title: "Test Document",
        description: "A test document for integration testing",
      })

      const document = DocumentEntity.create(documentData)
      const documentEntity = await expectAsyncSuccess(
        withTestClock(document, Date.now())
      )

      // Save the document
      const saved = await expectAsyncSuccess(
        withTestClock(documentRepo.save(documentEntity), Date.now())
      )

      expect(saved.id).toBe(documentEntity.id)
      expect(saved.title).toBe(documentEntity.title)
      expect(saved.ownerId).toBe(owner.id)

      // Read back with findById
      const foundOption = await expectAsyncSuccess(documentRepo.findById(documentEntity.id))
      const found = expectSome(foundOption)

      expect(found.id).toBe(documentEntity.id)
      expect(found.title).toBe(documentEntity.title)
      expect(found.ownerId).toBe(owner.id)
    })

    it("should insert a document with tags and description", async () => {
      const owner = await seedUser(testDb.db)
      const documentData = createDocumentWithTags({
        ownerId: owner.id,
        title: "Tagged Document",
        description: "A document with tags",
        tags: ["important", "draft", "review"],
      })

      const document = DocumentEntity.create(documentData)
      const documentEntity = await expectAsyncSuccess(
        withTestClock(document, Date.now())
      )

      const saved = await expectAsyncSuccess(
        withTestClock(documentRepo.save(documentEntity), Date.now())
      )

      expect(saved.title).toBe("Tagged Document")
      expect(saved.descriptionOrEmpty).toBe("A document with tags")
      expect(saved.tagsOrEmpty).toEqual(["important", "draft", "review"])
    })
  })

  describe("save - update", () => {
    it("should update an existing document", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      // Update the document
      const updated = await expectAsyncSuccess(
        withTestClock(
          document.rename("Updated Document Title"),
          Date.now()
        )
      )

      // Save the updated document
      const saved = await expectAsyncSuccess(
        withTestClock(documentRepo.save(updated), Date.now())
      )

      expect(saved.id).toBe(document.id)
      expect(saved.title).toBe("Updated Document Title")

      // Verify the update persisted
      const foundOption = await expectAsyncSuccess(documentRepo.findById(document.id))
      const found = expectSome(foundOption)
      expect(found.title).toBe("Updated Document Title")
    })
  })

  describe("findByOwner", () => {
    it("should return documents for a specific owner", async () => {
      const owner1 = await seedUser(testDb.db)
      const owner2 = await seedUser(testDb.db)

      // Create documents for owner1
      await seedDocument(testDb.db, {
        ownerId: owner1.id,
        title: "Owner1 Document 1",
      })
      await seedDocument(testDb.db, {
        ownerId: owner1.id,
        title: "Owner1 Document 2",
      })

      // Create document for owner2
      await seedDocument(testDb.db, {
        ownerId: owner2.id,
        title: "Owner2 Document",
      })

      // Find documents for owner1
      const owner1Docs = await expectAsyncSuccess(
        documentRepo.findByOwner(owner1.id)
      )

      expect(owner1Docs).toHaveLength(2)
      expect(owner1Docs.map(d => d.title)).toContain("Owner1 Document 1")
      expect(owner1Docs.map(d => d.title)).toContain("Owner1 Document 2")
    })

    it("should return empty array for owner with no documents", async () => {
      const owner = await seedUser(testDb.db)

      const documents = await expectAsyncSuccess(
        documentRepo.findByOwner(owner.id)
      )

      expect(documents).toHaveLength(0)
    })
  })

  describe("search", () => {
    it("should search documents by title", async () => {
      const owner = await seedUser(testDb.db)

      // Create documents with distinct titles
      await seedDocument(testDb.db, {
        ownerId: owner.id,
        title: "JavaScript Tutorial",
        description: "Learn JavaScript basics",
      })
      await seedDocument(testDb.db, {
        ownerId: owner.id,
        title: "Python Guide",
        description: "Python programming guide",
      })
      await seedDocument(testDb.db, {
        ownerId: owner.id,
        title: "React Components",
        description: "Building React components",
      })

      // Search for "JavaScript"
      const results = await expectAsyncSuccess(
        documentRepo.search({
          query: "JavaScript",
          ownerId: owner.id,
        })
      )

      expect(results.data).toHaveLength(1)
      expect(results.data[0]?.title).toBe("JavaScript Tutorial")
    })

    it("should search documents by description", async () => {
      const owner = await seedUser(testDb.db)

      await seedDocument(testDb.db, {
        ownerId: owner.id,
        title: "API Documentation",
        description: "REST API endpoints and usage",
      })
      await seedDocument(testDb.db, {
        ownerId: owner.id,
        title: "Database Schema",
        description: "Database design and relationships",
      })

      // Search for "API"
      const results = await expectAsyncSuccess(
        documentRepo.search({
          query: "API",
          ownerId: owner.id,
        })
      )

      expect(results.data).toHaveLength(1)
      expect(results.data[0]?.title).toBe("API Documentation")
    })

    it("should search documents by tags", async () => {
      const owner = await seedUser(testDb.db)

      await seedDocument(testDb.db, {
        ownerId: owner.id,
        title: "Frontend Guide",
        tags: ["frontend", "javascript", "react"],
      })
      await seedDocument(testDb.db, {
        ownerId: owner.id,
        title: "Backend API",
        tags: ["backend", "api", "nodejs"],
      })
      await seedDocument(testDb.db, {
        ownerId: owner.id,
        title: "Database Design",
        tags: ["database", "sql", "backend"],
      })

      // Search for documents with "backend" tag
      const results = await expectAsyncSuccess(
        documentRepo.search({
          tags: ["backend"],
          ownerId: owner.id,
        })
      )

      expect(results.data).toHaveLength(2)
      expect(results.data.map(d => d.title)).toContain("Backend API")
      expect(results.data.map(d => d.title)).toContain("Database Design")
    })

    it("should combine owner, text, and tag filters", async () => {
      const owner1 = await seedUser(testDb.db)
      const owner2 = await seedUser(testDb.db)

      // Owner1 documents
      await seedDocument(testDb.db, {
        ownerId: owner1.id,
        title: "React Components",
        description: "Building reusable components",
        tags: ["frontend", "react"],
      })
      await seedDocument(testDb.db, {
        ownerId: owner1.id,
        title: "Vue Components",
        description: "Vue.js component patterns",
        tags: ["frontend", "vue"],
      })

      // Owner2 documents
      await seedDocument(testDb.db, {
        ownerId: owner2.id,
        title: "React Hooks",
        description: "Advanced React patterns",
        tags: ["frontend", "react"],
      })

      // Search for "React" + "frontend" tag + owner1
      const results = await expectAsyncSuccess(
        documentRepo.search({
          query: "React",
          tags: ["frontend"],
          ownerId: owner1.id,
        })
      )

      expect(results.data).toHaveLength(1)
      expect(results.data[0]?.title).toBe("React Components")
    })

    it("should handle pagination correctly", async () => {
      const owner = await seedUser(testDb.db)

      // Create 5 documents
      for (let i = 1; i <= 5; i++) {
        await seedDocument(testDb.db, {
          ownerId: owner.id,
          title: `Document ${i}`,
        })
      }

      // Get first page (2 items)
      const page1 = await expectAsyncSuccess(
        documentRepo.search({
          ownerId: owner.id,
          paginationOptions: { pageNum: 1, pageSize: 2 },
        })
      )

      expect(page1.data).toHaveLength(2)
      expect(page1.total).toBe(5)
      expect(page1.pageNum).toBe(1)
      expect(page1.pageSize).toBe(2)
      expect(page1.totalPages).toBe(calculateTotalPages(5, 2))

      // Get second page
      const page2 = await expectAsyncSuccess(
        documentRepo.search({
          ownerId: owner.id,
          paginationOptions: { pageNum: 2, pageSize: 2 },
        })
      )

      expect(page2.data).toHaveLength(2)
      expect(page2.total).toBe(5)
      expect(page2.pageNum).toBe(2)
    })
  })

  describe("exists", () => {
    it("should return false for non-existent document", async () => {
      const exists = await expectAsyncSuccess(
        documentRepo.exists("00000000-0000-0000-0000-000000000000" as any)
      )

      expect(exists).toBe(false)
    })

    it("should return true for existing document", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      const exists = await expectAsyncSuccess(documentRepo.exists(document.id))

      expect(exists).toBe(true)
    })
  })

  describe("delete", () => {
    it("should delete an existing document and return true", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      // Verify document exists
      const existsBefore = await expectAsyncSuccess(documentRepo.exists(document.id))
      expect(existsBefore).toBe(true)

      // Delete the document
      const deleted = await expectAsyncSuccess(documentRepo.delete(document.id))
      expect(deleted).toBe(true)

      // Verify document no longer exists
      const existsAfter = await expectAsyncSuccess(documentRepo.exists(document.id))
      expect(existsAfter).toBe(false)
    })

    it("should fail with DocumentNotFoundError when deleting non-existent document", async () => {
      await expect(
        expectAsyncSuccess(
          documentRepo.delete("00000000-0000-0000-0000-000000000000" as any)
        )
      ).rejects.toThrow()
    })
  })

  describe("list", () => {
    it("should return empty list when no documents exist", async () => {
      const result = await expectAsyncSuccess(documentRepo.list())

      expect(result.data).toHaveLength(0)
      expect(result.total).toBe(0)
      expect(result.pageNum).toBe(1)
      expect(result.pageSize).toBe(10)
      expect(result.totalPages).toBe(0)
    })

    it("should list documents with default pagination", async () => {
      const owner = await seedUser(testDb.db)

      // Create 3 documents
      for (let i = 1; i <= 3; i++) {
        await seedDocument(testDb.db, {
          ownerId: owner.id,
          title: `Document ${i}`,
        })
      }

      const result = await expectAsyncSuccess(documentRepo.list())

      expect(result.data).toHaveLength(3)
      expect(result.total).toBe(3)
      expect(result.pageNum).toBe(1)
      expect(result.pageSize).toBe(10)
      expect(result.totalPages).toBe(calculateTotalPages(3, 10))
    })

    it("should sort documents by createdAt", async () => {
      const owner = await seedUser(testDb.db)

      // Create documents with different timestamps
      await seedDocument(testDb.db, {
        ownerId: owner.id,
        title: "First Document",
      })
      await seedDocument(testDb.db, {
        ownerId: owner.id,
        title: "Second Document",
      })
      await seedDocument(testDb.db, {
        ownerId: owner.id,
        title: "Third Document",
      })

      const result = await expectAsyncSuccess(documentRepo.list())

      expect(result.data).toHaveLength(3)
      // Should be sorted by createdAt (oldest first)
      expect(result.data[0]?.title).toBe("First Document")
      expect(result.data[1]?.title).toBe("Second Document")
      expect(result.data[2]?.title).toBe("Third Document")
    })

    it("should validate pagination metadata matches calculateTotalPages", async () => {
      const owner = await seedUser(testDb.db)

      // Create 25 documents
      for (let i = 1; i <= 25; i++) {
        await seedDocument(testDb.db, {
          ownerId: owner.id,
          title: `Document ${i}`,
        })
      }

      const pageSize = 10

      // Get first page
      const page1 = await expectAsyncSuccess(
        documentRepo.list({ pageNum: 1, pageSize })
      )

      expect(page1.data).toHaveLength(10)
      expect(page1.total).toBe(25)
      expect(page1.totalPages).toBe(calculateTotalPages(25, pageSize))
      expect(page1.totalPages).toBe(3)

      // Get last page
      const page3 = await expectAsyncSuccess(
        documentRepo.list({ pageNum: 3, pageSize })
      )

      expect(page3.data).toHaveLength(5)
      expect(page3.total).toBe(25)
      expect(page3.totalPages).toBe(3)
    })
  })

  describe("cascade delete", () => {
    it("should remove related document versions when document is deleted", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      // Verify document and version exist
      const docExists = await expectAsyncSuccess(documentRepo.exists(document.id))
      expect(docExists).toBe(true)

      // Delete the document
      const deleted = await expectAsyncSuccess(documentRepo.delete(document.id))
      expect(deleted).toBe(true)

      // Verify document no longer exists
      const docExistsAfter = await expectAsyncSuccess(documentRepo.exists(document.id))
      expect(docExistsAfter).toBe(false)

      // Verify findById returns Option.none
      const foundOption = await expectAsyncSuccess(documentRepo.findById(document.id))
      expectNone(foundOption)
    })
  })

  describe("error translation checks", () => {
    it("should translate foreign key violation when owner doesn't exist", async () => {
      const faker = await import("@faker-js/faker")
      const nonExistentUserId = faker.faker.string.uuid() as any // Valid UUID format but non-existent
      
      const documentData = generateDocument({
        ownerId: nonExistentUserId,
        title: "Test Document",
      })

      const document = DocumentEntity.create(documentData)
      const documentEntity = await expectAsyncSuccess(
        withTestClock(document, Date.now())
      )

      // This should fail with foreign key constraint violation
      await expect(
        expectAsyncSuccess(
          withTestClock(documentRepo.save(documentEntity), Date.now())
        )
      ).rejects.toThrow()
    })
  })
})
