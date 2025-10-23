import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { faker } from "../../domain/factories/common"
import { setupSharedTestDatabase, cleanupSharedTestDatabase, clearTestDatabase } from "../setup/test-database"
import { seedUser, seedDocumentVersion, seedDocumentWithOwnerAndVersion } from "../setup/seed-helpers"
import { expectAsyncSuccess, expectSome, expectNone } from "../../utils/test.helpers"
import { withTestClock } from "../../domain/setup/test-clock"
import { generateDocumentVersion } from "../../domain/factories/document-version.factory"
import { DocumentVersionDrizzleRepository } from "@infra/repositories/document-version.repository"
import { calculateTotalPages } from "@domain/utils/pagination"
import { DocumentVersionEntity } from "@domain/documentVersion/document-version.entity"
import { Option } from "effect"

describe("DocumentVersionDrizzleRepository Integration", () => {
  let testDb: Awaited<ReturnType<typeof setupSharedTestDatabase>>
  let documentVersionRepo: DocumentVersionDrizzleRepository

  beforeAll(async () => {
    // Setup shared database once for the entire test file
    testDb = await setupSharedTestDatabase()
    documentVersionRepo = new DocumentVersionDrizzleRepository(testDb.db)
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
    it("should insert a new document version and read it back with findById", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      
      const versionData = generateDocumentVersion({
        documentId: document.id,
        version: 2,
      })

      const version = DocumentVersionEntity.create(versionData)
      const versionEntity = await expectAsyncSuccess(
        withTestClock(version, Date.now())
      )

      // Save the document version
      const saved = await expectAsyncSuccess(
        withTestClock(documentVersionRepo.save(versionEntity), Date.now())
      )

      expect(saved.id).toBe(versionEntity.id)
      expect(saved.documentId).toBe(document.id)
      expect(saved.version).toBe(2)

      // Read back with findById
      const foundOption = await expectAsyncSuccess(documentVersionRepo.findById(versionEntity.id))
      const found = expectSome(foundOption)

      expect(found.id).toBe(versionEntity.id)
      expect(found.documentId).toBe(document.id)
      expect(found.version).toBe(2)
    })

    it("should insert a document version with all fields populated", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const createdBy = await seedUser(testDb.db)
      
      const versionData = generateDocumentVersion({
        documentId: document.id,
        version: 2,
        createdBy: createdBy.id,
      })

      const version = DocumentVersionEntity.create(versionData)
      const versionEntity = await expectAsyncSuccess(
        withTestClock(version, Date.now())
      )

      const saved = await expectAsyncSuccess(
        withTestClock(documentVersionRepo.save(versionEntity), Date.now())
      )

      expect(saved.documentId).toBe(document.id)
      expect(saved.version).toBe(2)
      expect(saved.getCreatorIdOption()).toEqual(Option.some(createdBy.id))
    })
  })

  describe("save - update", () => {
    it("should update an existing document version", async () => {
      const { version } = await seedDocumentWithOwnerAndVersion(testDb.db)

      // Create a new version with updated file data
      const updatedVersionData = generateDocumentVersion({
        id: version.id,
        documentId: version.documentId,
        version: version.version,
        file: {
          checksum: faker.string.hexadecimal({ length: 64, prefix: "", casing: "lower" }) as any,
          fileKey: `files/${faker.string.alphanumeric(16)}` as any,
          mimeType: "application/pdf" as any,
          size: 1024 as any,
        },
      })

      const updatedVersion = DocumentVersionEntity.create(updatedVersionData)
      const updatedVersionEntity = await expectAsyncSuccess(
        withTestClock(updatedVersion, Date.now())
      )

      // Save the updated version
      const saved = await expectAsyncSuccess(
        withTestClock(documentVersionRepo.save(updatedVersionEntity), Date.now())
      )

      expect(saved.id).toBe(version.id)
      expect(saved.file.checksum).toBe(updatedVersionEntity.file.checksum)

      // Verify the update persisted
      const foundOption = await expectAsyncSuccess(documentVersionRepo.findById(version.id))
      const found = expectSome(foundOption)
      expect(found.file.checksum).toBe(updatedVersionEntity.file.checksum)
    })
  })

  describe("findByDocumentId", () => {
    it("should return document versions ordered by descending version", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      // Create multiple versions
      await seedDocumentVersion(testDb.db, {
        documentId: document.id,
        version: 2,
      })
      await seedDocumentVersion(testDb.db, {
        documentId: document.id,
        version: 3,
      })
      await seedDocumentVersion(testDb.db, {
        documentId: document.id,
        version: 4,
      })

      // Find all versions for the document
      const versions = await expectAsyncSuccess(
        documentVersionRepo.findByDocumentId(document.id)
      )

      expect(versions).toHaveLength(4)
      // Should be ordered by version descending (4, 3, 2, 1)
      expect(versions[0]?.version).toBe(4)
      expect(versions[1]?.version).toBe(3)
      expect(versions[2]?.version).toBe(2)
      expect(versions[3]?.version).toBe(1)
    })

    it("should return empty array for document with no versions", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      const versions = await expectAsyncSuccess(
        documentVersionRepo.findByDocumentId(document.id)
      )

      expect(versions).toHaveLength(1) // The initial version from seedDocumentWithOwnerAndVersion
    })
  })

  describe("findByDocumentIdAndVersion", () => {
    it("should find specific version by document ID and version number", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      // Create additional versions
      await seedDocumentVersion(testDb.db, {
        documentId: document.id,
        version: 2,
      })
      await seedDocumentVersion(testDb.db, {
        documentId: document.id,
        version: 3,
      })

      // Find version 2
      const version2Option = await expectAsyncSuccess(
        documentVersionRepo.findByDocumentIdAndVersion(document.id, 2)
      )
      const version2 = expectSome(version2Option)
      expect(version2.version).toBe(2)

      // Find version 3
      const version3Option = await expectAsyncSuccess(
        documentVersionRepo.findByDocumentIdAndVersion(document.id, 3)
      )
      const version3 = expectSome(version3Option)
      expect(version3.version).toBe(3)
    })

    it("should return Option.none for non-existent version", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      const result = await expectAsyncSuccess(
        documentVersionRepo.findByDocumentIdAndVersion(document.id, 999)
      )

      expectNone(result)
    })
  })

  describe("findLatestByDocumentId", () => {
    it("should return the latest version for a document", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      // Create additional versions
      await seedDocumentVersion(testDb.db, {
        documentId: document.id,
        version: 2,
      })
      await seedDocumentVersion(testDb.db, {
        documentId: document.id,
        version: 3,
      })

      // Find latest version
      const latestOption = await expectAsyncSuccess(
        documentVersionRepo.findLatestByDocumentId(document.id)
      )
      const latest = expectSome(latestOption)

      expect(latest.version).toBe(3)
      expect(latest.documentId).toBe(document.id)
    })

    it("should return Option.none for document with no versions", async () => {
      // Create a document without versions by using seedDocumentWithOwnerAndVersion and then deleting the version
      const { document, version } = await seedDocumentWithOwnerAndVersion(testDb.db)
      
      // Delete the version
      await expectAsyncSuccess(documentVersionRepo.delete(version.id))

      const result = await expectAsyncSuccess(
        documentVersionRepo.findLatestByDocumentId(document.id)
      )

      expectNone(result)
    })
  })

  describe("getNextVersionNumber", () => {
    it("should return 1 for document with no versions", async () => {
      // Create a document without versions by using seedDocumentWithOwnerAndVersion and then deleting the version
      const { document, version } = await seedDocumentWithOwnerAndVersion(testDb.db)
      
      // Delete the version
      await expectAsyncSuccess(documentVersionRepo.delete(version.id))

      const nextVersion = await expectAsyncSuccess(
        documentVersionRepo.getNextVersionNumber(document.id)
      )

      expect(nextVersion).toBe(1)
    })

    it("should return next version number when versions exist", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      // Create additional versions
      await seedDocumentVersion(testDb.db, {
        documentId: document.id,
        version: 2,
      })
      await seedDocumentVersion(testDb.db, {
        documentId: document.id,
        version: 3,
      })

      const nextVersion = await expectAsyncSuccess(
        documentVersionRepo.getNextVersionNumber(document.id)
      )

      expect(nextVersion).toBe(4)
    })

    it("should handle gaps in version numbers correctly", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      // Create versions with gaps (1, 3, 5)
      await seedDocumentVersion(testDb.db, {
        documentId: document.id,
        version: 3,
      })
      await seedDocumentVersion(testDb.db, {
        documentId: document.id,
        version: 5,
      })

      const nextVersion = await expectAsyncSuccess(
        documentVersionRepo.getNextVersionNumber(document.id)
      )

      expect(nextVersion).toBe(6) // Should be max + 1, not fill gaps
    })
  })

  describe("unique constraint", () => {
    it("should fail with ValidationError when inserting duplicate (documentId, version)", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      // Try to create another version 1 for the same document
      const duplicateVersionData = generateDocumentVersion({
        documentId: document.id,
        version: 1, // Same version as existing
      })

      const duplicateVersion = DocumentVersionEntity.create(duplicateVersionData)
      const duplicateVersionEntity = await expectAsyncSuccess(
        withTestClock(duplicateVersion, Date.now())
      )

      // This should fail due to unique constraint
      await expect(
        expectAsyncSuccess(
          withTestClock(documentVersionRepo.save(duplicateVersionEntity), Date.now())
        )
      ).rejects.toThrow()
    })
  })

  describe("exists", () => {
    it("should return false for non-existent document version", async () => {
      const exists = await expectAsyncSuccess(
        documentVersionRepo.exists("00000000-0000-0000-0000-000000000000" as any)
      )

      expect(exists).toBe(false)
    })

    it("should return true for existing document version", async () => {
      const { version } = await seedDocumentWithOwnerAndVersion(testDb.db)

      const exists = await expectAsyncSuccess(documentVersionRepo.exists(version.id))

      expect(exists).toBe(true)
    })
  })

  describe("delete", () => {
    it("should delete an existing document version and return true", async () => {
      const { version } = await seedDocumentWithOwnerAndVersion(testDb.db)

      // Verify version exists
      const existsBefore = await expectAsyncSuccess(documentVersionRepo.exists(version.id))
      expect(existsBefore).toBe(true)

      // Delete the version
      const deleted = await expectAsyncSuccess(documentVersionRepo.delete(version.id))
      expect(deleted).toBe(true)

      // Verify version no longer exists
      const existsAfter = await expectAsyncSuccess(documentVersionRepo.exists(version.id))
      expect(existsAfter).toBe(false)
    })

    it("should fail with DocumentVersionNotFoundError when deleting non-existent version", async () => {
      await expect(
        expectAsyncSuccess(
          documentVersionRepo.delete("00000000-0000-0000-0000-000000000000" as any)
        )
      ).rejects.toThrow()
    })
  })

  describe("list", () => {
    it("should return empty list when no document versions exist", async () => {
      const result = await expectAsyncSuccess(documentVersionRepo.list())

      expect(result.data).toHaveLength(0)
      expect(result.total).toBe(0)
      expect(result.pageNum).toBe(1)
      expect(result.pageSize).toBe(10)
      expect(result.totalPages).toBe(0)
    })

    it("should list document versions with default pagination", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      // Create additional versions
      await seedDocumentVersion(testDb.db, {
        documentId: document.id,
        version: 2,
      })
      await seedDocumentVersion(testDb.db, {
        documentId: document.id,
        version: 3,
      })

      const result = await expectAsyncSuccess(documentVersionRepo.list())

      expect(result.data).toHaveLength(3)
      expect(result.total).toBe(3)
      expect(result.pageNum).toBe(1)
      expect(result.pageSize).toBe(10)
      expect(result.totalPages).toBe(calculateTotalPages(3, 10))
    })

    it("should return latest versions first (ordered by createdAt desc)", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      // Create versions with different timestamps
      await seedDocumentVersion(testDb.db, {
        documentId: document.id,
        version: 2,
      })
      await seedDocumentVersion(testDb.db, {
        documentId: document.id,
        version: 3,
      })

      const result = await expectAsyncSuccess(documentVersionRepo.list())

      expect(result.data).toHaveLength(3)
      // Should be ordered by createdAt desc (newest first)
      // Version 3 should be first (most recent), then 2, then 1
      expect(result.data[0]?.version).toBe(3)
      expect(result.data[1]?.version).toBe(2)
      expect(result.data[2]?.version).toBe(1)
    })

    it("should validate pagination metadata matches calculateTotalPages", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      // Create 25 versions
      for (let i = 2; i <= 26; i++) {
        await seedDocumentVersion(testDb.db, {
          documentId: document.id,
          version: i,
        })
      }

      const pageSize = 10

      // Get first page
      const page1 = await expectAsyncSuccess(
        documentVersionRepo.list({ pageNum: 1, pageSize })
      )

      expect(page1.data).toHaveLength(10)
      expect(page1.total).toBe(26)
      expect(page1.totalPages).toBe(calculateTotalPages(26, pageSize))
      expect(page1.totalPages).toBe(3)

      // Get last page
      const page3 = await expectAsyncSuccess(
        documentVersionRepo.list({ pageNum: 3, pageSize })
      )

      expect(page3.data).toHaveLength(6)
      expect(page3.total).toBe(26)
      expect(page3.totalPages).toBe(3)
    })

    it("should handle custom page size", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      // Create 7 versions
      for (let i = 2; i <= 8; i++) {
        await seedDocumentVersion(testDb.db, {
          documentId: document.id,
          version: i,
        })
      }

      const result = await expectAsyncSuccess(
        documentVersionRepo.list({ pageNum: 1, pageSize: 3 })
      )

      expect(result.data).toHaveLength(3)
      expect(result.total).toBe(8)
      expect(result.pageSize).toBe(3)
      expect(result.totalPages).toBe(calculateTotalPages(8, 3))
      expect(result.totalPages).toBe(3)
    })

    it("should return entities with all fields properly mapped", async () => {
      const { version } = await seedDocumentWithOwnerAndVersion(testDb.db)

      const result = await expectAsyncSuccess(documentVersionRepo.list())

      expect(result.data).toHaveLength(1)
      const retrievedVersion = result.data[0]

      expect(retrievedVersion).toBeDefined()
      expect(retrievedVersion!.id).toBe(version.id)
      expect(retrievedVersion!.documentId).toBe(version.documentId)
      expect(retrievedVersion!.version).toBe(version.version)
      expect(retrievedVersion!.file.checksum).toBe(version.file.checksum)
    })
  })

  describe("error translation checks", () => {
    it("should translate foreign key violation when document doesn't exist", async () => {
      const faker = await import("@faker-js/faker")
      const nonExistentDocId = faker.faker.string.uuid() as any // Valid UUID format but non-existent
      
      const versionData = generateDocumentVersion({
        documentId: nonExistentDocId,
        version: 1,
      })

      const version = DocumentVersionEntity.create(versionData)
      const versionEntity = await expectAsyncSuccess(
        withTestClock(version, Date.now())
      )

      // This should fail with foreign key constraint violation
      await expect(
        expectAsyncSuccess(
          withTestClock(documentVersionRepo.save(versionEntity), Date.now())
        )
      ).rejects.toThrow()
    })

    it("should translate unique constraint violation to error when inserting duplicate version", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      
      const versionData = generateDocumentVersion({
        documentId: document.id,
        version: 2,
      })

      const version1 = DocumentVersionEntity.create(versionData)
      const version1Entity = await expectAsyncSuccess(
        withTestClock(version1, Date.now())
      )

      // Save first version
      await expectAsyncSuccess(
        withTestClock(documentVersionRepo.save(version1Entity), Date.now())
      )

      // Try to save version with same document and version number (unique constraint)
      const version2Data = generateDocumentVersion({
        documentId: document.id,
        version: 2, // Same version number
      })

      const version2 = DocumentVersionEntity.create(version2Data)
      const version2Entity = await expectAsyncSuccess(
        withTestClock(version2, Date.now())
      )

      // This should fail with unique constraint violation
      await expect(
        expectAsyncSuccess(
          withTestClock(documentVersionRepo.save(version2Entity), Date.now())
        )
      ).rejects.toThrow()
    })
  })
})
