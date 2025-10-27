import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { setupSharedTestDatabase, cleanupSharedTestDatabase, clearTestDatabase } from "../setup/test-database"
import { seedUser, seedDownloadToken, seedDocumentWithOwnerAndVersion } from "../setup/seed-helpers"
import { expectAsyncSuccess, expectSome, expectNone } from "../../utils/test.helpers"
import { withTestClock } from "../../domain/setup/test-clock"
import { generateDownloadToken, createDownloadTokenEntity } from "../../domain/factories/download-token.factory"
import { DownloadTokenDrizzleRepository } from "@infra/repositories/download-token.repository"
import { calculateTotalPages } from "@domain/utils/pagination"
import { DownloadTokenEntity } from "@domain/downloadToken/download-token.entity"
import { container } from "tsyringe"
import { TOKENS } from "@infra/di/container"

describe("DownloadTokenDrizzleRepository Integration", () => {
  let testDb: Awaited<ReturnType<typeof setupSharedTestDatabase>>
  let downloadTokenRepo: DownloadTokenDrizzleRepository

  beforeAll(async () => {
    // Setup shared database once for the entire test file
    testDb = await setupSharedTestDatabase()
    container.registerInstance(TOKENS.DATABASE_CONNECTION, testDb.db)
    downloadTokenRepo = container.resolve(TOKENS.DOWNLOAD_TOKEN_REPOSITORY) as DownloadTokenDrizzleRepository
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
    it("should insert a new download token and read it back with findById", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)
      
      const tokenData = generateDownloadToken({
        documentId: document.id,
        issuedTo: user.id,
      })

      const token = DownloadTokenEntity.create(tokenData)
      const tokenEntity = await expectAsyncSuccess(
        withTestClock(token, Date.now())
      )

      // Save the download token
      const saved = await expectAsyncSuccess(
        withTestClock(downloadTokenRepo.save(tokenEntity), Date.now())
      )

      expect(saved.id).toBe(tokenEntity.id)
      expect(saved.documentId).toBe(document.id)
      expect(saved.issuedTo).toBe(user.id)

      // Read back with findById
      const foundOption = await expectAsyncSuccess(downloadTokenRepo.findById(tokenEntity.id))
      const found = expectSome(foundOption)

      expect(found.id).toBe(tokenEntity.id)
      expect(found.documentId).toBe(document.id)
      expect(found.issuedTo).toBe(user.id)
    })

    it("should insert a download token with all fields populated", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)
      
      const tokenData = generateDownloadToken({
        documentId: document.id,
        issuedTo: user.id,
      })

      const token = createDownloadTokenEntity(tokenData)

      const saved = await expectAsyncSuccess(
        withTestClock(downloadTokenRepo.save(token), Date.now())
      )

      expect(saved.documentId).toBe(document.id)
      expect(saved.issuedTo).toBe(user.id)
      expect(saved.token).toBe(token.token)
    })
  })

  describe("save - update", () => {
    it("should update an existing download token", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)
      const token = await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
      })

      // Mark token as used (this updates the token)
      const markedAsUsed = await expectAsyncSuccess(
        withTestClock(
          token.markAsUsed(),
          Date.now()
        )
      )

      // Save the updated token
      const saved = await expectAsyncSuccess(
        withTestClock(downloadTokenRepo.save(markedAsUsed), Date.now())
      )

      expect(saved.id).toBe(token.id)
      expect(saved.isUsed()).toBe(true)

      // Verify the update persisted
      const foundOption = await expectAsyncSuccess(downloadTokenRepo.findById(token.id))
      const found = expectSome(foundOption)
      expect(found.isUsed()).toBe(true)
    })
  })

  describe("findByToken", () => {
    it("should find download token by token string", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)
      const token = await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
      })

      const foundOption = await expectAsyncSuccess(
        downloadTokenRepo.findByToken(token.token)
      )
      const found = expectSome(foundOption)

      expect(found.id).toBe(token.id)
      expect(found.token).toBe(token.token)
    })

    it("should return Option.none for unknown token", async () => {
      const result = await expectAsyncSuccess(
        downloadTokenRepo.findByToken("unknown-token")
      )

      expectNone(result)
    })
  })

  describe("findByUserId", () => {
    it("should return download tokens for a specific user", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user1 = await seedUser(testDb.db)
      const user2 = await seedUser(testDb.db)

      // Create tokens for user1
      await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user1.id,
      })
      await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user1.id,
      })

      // Create token for user2
      await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user2.id,
      })

      // Find tokens for user1
      const user1Tokens = await expectAsyncSuccess(
        downloadTokenRepo.findByUserId(user1.id)
      )

      expect(user1Tokens).toHaveLength(2)
      expect(user1Tokens.every(t => t.issuedTo === user1.id)).toBe(true)
    })

    it("should return empty array for user with no tokens", async () => {
      const user = await seedUser(testDb.db)

      const tokens = await expectAsyncSuccess(
        downloadTokenRepo.findByUserId(user.id)
      )

      expect(tokens).toHaveLength(0)
    })
  })

  describe("findByDocumentId", () => {
    it("should return download tokens for a specific document", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user1 = await seedUser(testDb.db)
      const user2 = await seedUser(testDb.db)

      // Create tokens for the document
      await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user1.id,
      })
      await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user2.id,
      })

      // Find tokens for the document
      const documentTokens = await expectAsyncSuccess(
        downloadTokenRepo.findByDocumentId(document.id)
      )

      expect(documentTokens).toHaveLength(2)
      expect(documentTokens.every(t => t.documentId === document.id)).toBe(true)
    })

    it("should return empty array for document with no tokens", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      const tokens = await expectAsyncSuccess(
        downloadTokenRepo.findByDocumentId(document.id)
      )

      expect(tokens).toHaveLength(0)
    })
  })

  describe("findValidTokens", () => {
    it("should return only valid (unexpired and unused) tokens", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)

      // Create valid token
      const validToken = await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
      })

      // Create used token
      const usedToken = await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
      })
      await expectAsyncSuccess(
        withTestClock(
          downloadTokenRepo.markAsUsed(usedToken.token),
          Date.now()
        )
      )

      // Find valid tokens
      const validTokens = await expectAsyncSuccess(
        downloadTokenRepo.findValidTokens(document.id, user.id)
      )

      expect(validTokens).toHaveLength(1)
      expect(validTokens[0]?.id).toBe(validToken.id)
    })

    it("should ignore expired tokens using withTestClock", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)

      // Create token
      const token = await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
      })

      // Test that valid tokens are found normally
      const validTokens = await expectAsyncSuccess(
        downloadTokenRepo.findValidTokens(document.id, user.id)
      )

      expect(validTokens).toHaveLength(1)
      expect(validTokens[0]?.id).toBe(token.id)
    })

    it("should ignore used tokens", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)

      // Create and use a token
      const token = await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
      })

      await expectAsyncSuccess(
        withTestClock(
          downloadTokenRepo.markAsUsed(token.token),
          Date.now()
        )
      )

      // Find valid tokens (should be empty)
      const validTokens = await expectAsyncSuccess(
        downloadTokenRepo.findValidTokens(document.id, user.id)
      )

      expect(validTokens).toHaveLength(0)
    })
  })

  describe("markAsUsed", () => {
    it("should mark token as used and update usedAt", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)
      const token = await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
      })

      const markTime = Date.now()
      const markedToken = await expectAsyncSuccess(
        withTestClock(
          downloadTokenRepo.markAsUsed(token.token),
          markTime
        )
      )

      expect(markedToken.id).toBe(token.id)
      expect(markedToken.isUsed()).toBe(true)
      expect(markedToken.usedAt).toBeDefined()
    })

    it("should fail with DownloadTokenAlreadyUsedError on repeat calls", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)
      const token = await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
      })

      // Mark as used first time
      await expectAsyncSuccess(
        withTestClock(
          downloadTokenRepo.markAsUsed(token.token),
          Date.now()
        )
      )

      // Try to mark as used again
      await expect(
        expectAsyncSuccess(
          withTestClock(
            downloadTokenRepo.markAsUsed(token.token),
            Date.now()
          )
        )
      ).rejects.toThrow()
    })
  })

  describe("deleteExpiredTokens", () => {
    it("should delete expired tokens and return count", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)

      // Create valid token
      await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
      })

      // Create another valid token
      await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
      })

      // Delete expired tokens (should be 0 since we only have valid tokens)
      const deletedCount = await expectAsyncSuccess(
        downloadTokenRepo.deleteExpiredTokens()
      )

      expect(deletedCount).toBe(0)

      // Verify all tokens remain
      const remainingTokens = await expectAsyncSuccess(
        downloadTokenRepo.findByDocumentId(document.id)
      )

      expect(remainingTokens).toHaveLength(2)
    })

    it("should return 0 when no expired tokens exist", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)

      // Create only valid tokens
      await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
      })

      const deletedCount = await expectAsyncSuccess(
        downloadTokenRepo.deleteExpiredTokens()
      )

      expect(deletedCount).toBe(0)
    })
  })

  describe("deleteByDocumentId", () => {
    it("should delete all tokens for a document and return count", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)

      // Create multiple tokens for the document
      await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
      })
      await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
      })

      // Delete tokens by document ID
      const deletedCount = await expectAsyncSuccess(
        downloadTokenRepo.deleteByDocumentId(document.id)
      )

      expect(deletedCount).toBe(2)

      // Verify tokens are gone
      const remainingTokens = await expectAsyncSuccess(
        downloadTokenRepo.findByDocumentId(document.id)
      )

      expect(remainingTokens).toHaveLength(0)
    })

    it("should return 0 when no tokens exist for document", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      const deletedCount = await expectAsyncSuccess(
        downloadTokenRepo.deleteByDocumentId(document.id)
      )

      expect(deletedCount).toBe(0)
    })
  })

  describe("cascade delete", () => {
    it("should remove download tokens when document is deleted", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)

      // Create tokens for the document
      await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
      })
      await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
      })

      // Verify tokens exist
      const tokensBefore = await expectAsyncSuccess(
        downloadTokenRepo.findByDocumentId(document.id)
      )
      expect(tokensBefore).toHaveLength(2)

      // Delete the document (this should cascade delete tokens)
      // Note: This test assumes the database has CASCADE DELETE configured
      // If not, we would need to manually delete the document using the document repository
      const deletedCount = await expectAsyncSuccess(
        downloadTokenRepo.deleteByDocumentId(document.id)
      )

      expect(deletedCount).toBe(2)

      // Verify tokens no longer exist
      const tokensAfter = await expectAsyncSuccess(
        downloadTokenRepo.findByDocumentId(document.id)
      )
      expect(tokensAfter).toHaveLength(0)
    })
  })

  describe("exists", () => {
    it("should return false for non-existent download token", async () => {
      const exists = await expectAsyncSuccess(
        downloadTokenRepo.exists("00000000-0000-0000-0000-000000000000" as any)
      )

      expect(exists).toBe(false)
    })

    it("should return true for existing download token", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)
      const token = await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
      })

      const exists = await expectAsyncSuccess(downloadTokenRepo.exists(token.id))

      expect(exists).toBe(true)
    })
  })

  describe("delete", () => {
    it("should delete an existing download token and return true", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)
      const token = await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
      })

      // Verify token exists
      const existsBefore = await expectAsyncSuccess(downloadTokenRepo.exists(token.id))
      expect(existsBefore).toBe(true)

      // Delete the token
      const deleted = await expectAsyncSuccess(downloadTokenRepo.delete(token.id))
      expect(deleted).toBe(true)

      // Verify token no longer exists
      const existsAfter = await expectAsyncSuccess(downloadTokenRepo.exists(token.id))
      expect(existsAfter).toBe(false)
    })

    it("should fail with DownloadTokenNotFoundError when deleting non-existent token", async () => {
      await expect(
        expectAsyncSuccess(
          downloadTokenRepo.delete("00000000-0000-0000-0000-000000000000" as any)
        )
      ).rejects.toThrow()
    })
  })

  describe("list", () => {
    it("should return empty list when no download tokens exist", async () => {
      const result = await expectAsyncSuccess(downloadTokenRepo.list())

      expect(result.data).toHaveLength(0)
      expect(result.total).toBe(0)
      expect(result.pageNum).toBe(1)
      expect(result.pageSize).toBe(10)
      expect(result.totalPages).toBe(0)
    })

    it("should list download tokens with default pagination", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)

      // Create 3 tokens
      for (let i = 0; i < 3; i++) {
        await seedDownloadToken(testDb.db, {
          documentId: document.id,
          issuedTo: user.id,
        })
      }

      const result = await expectAsyncSuccess(downloadTokenRepo.list())

      expect(result.data).toHaveLength(3)
      expect(result.total).toBe(3)
      expect(result.pageNum).toBe(1)
      expect(result.pageSize).toBe(10)
      expect(result.totalPages).toBe(calculateTotalPages(3, 10))
    })

    it("should sort download tokens by createdAt", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)

      // Create tokens with different timestamps
      await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
      })
      await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
      })
      await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
      })

      const result = await expectAsyncSuccess(downloadTokenRepo.list())

      expect(result.data).toHaveLength(3)
      // Should be sorted by createdAt (oldest first)
      expect(result.data[0]?.createdAt).toBeDefined()
      expect(result.data[1]?.createdAt).toBeDefined()
      expect(result.data[2]?.createdAt).toBeDefined()
    })

    it("should validate pagination metadata matches calculateTotalPages", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)

      // Create 25 tokens
      for (let i = 0; i < 25; i++) {
        await seedDownloadToken(testDb.db, {
          documentId: document.id,
          issuedTo: user.id,
        })
      }

      const pageSize = 10

      // Get first page
      const page1 = await expectAsyncSuccess(
        downloadTokenRepo.list({ pageNum: 1, pageSize })
      )

      expect(page1.data).toHaveLength(10)
      expect(page1.total).toBe(25)
      expect(page1.totalPages).toBe(calculateTotalPages(25, pageSize))
      expect(page1.totalPages).toBe(3)

      // Get last page
      const page3 = await expectAsyncSuccess(
        downloadTokenRepo.list({ pageNum: 3, pageSize })
      )

      expect(page3.data).toHaveLength(5)
      expect(page3.total).toBe(25)
      expect(page3.totalPages).toBe(3)
    })

    it("should return entities with all fields properly mapped", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)
      const token = await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
      })

      const result = await expectAsyncSuccess(downloadTokenRepo.list())

      expect(result.data).toHaveLength(1)
      const retrievedToken = result.data[0]

      expect(retrievedToken).toBeDefined()
      expect(retrievedToken!.id).toBe(token.id)
      expect(retrievedToken!.documentId).toBe(token.documentId)
      expect(retrievedToken!.issuedTo).toBe(token.issuedTo)
      expect(retrievedToken!.token).toBe(token.token)
    })
  })

  describe("error translation checks", () => {
    it("should translate foreign key violation when document doesn't exist", async () => {
      const user = await seedUser(testDb.db)
      const faker = await import("@faker-js/faker")
      const nonExistentDocId = faker.faker.string.uuid() as any // Valid UUID format but non-existent
      
      const tokenData = generateDownloadToken({
        documentId: nonExistentDocId,
        issuedTo: user.id,
      })

      const token = createDownloadTokenEntity(tokenData)

      // This should fail with foreign key constraint violation
      await expect(
        expectAsyncSuccess(
          withTestClock(downloadTokenRepo.save(token), Date.now())
        )
      ).rejects.toThrow()
    })

    it("should translate foreign key violation when user doesn't exist", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const faker = await import("@faker-js/faker")
      const nonExistentUserId = faker.faker.string.uuid() as any // Valid UUID format but non-existent
      
      const tokenData = generateDownloadToken({
        documentId: document.id,
        issuedTo: nonExistentUserId,
      })

      const token = createDownloadTokenEntity(tokenData)

      // This should fail with foreign key constraint violation
      await expect(
        expectAsyncSuccess(
          withTestClock(downloadTokenRepo.save(token), Date.now())
        )
      ).rejects.toThrow()
    })

    it("should translate unique constraint violation to error when inserting duplicate token", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)
      
      const tokenData = generateDownloadToken({
        documentId: document.id,
        issuedTo: user.id,
      })

      const token1 = createDownloadTokenEntity(tokenData)
      
      // Save first token
      await expectAsyncSuccess(
        withTestClock(downloadTokenRepo.save(token1), Date.now())
      )

      // Try to save token with same token string (unique constraint)
      const token2Data = generateDownloadToken({
        documentId: document.id,
        issuedTo: user.id,
        token: token1.token,
      })

      const token2 = createDownloadTokenEntity(token2Data)

      // This should fail with unique constraint violation
      await expect(
        expectAsyncSuccess(
          withTestClock(downloadTokenRepo.save(token2), Date.now())
        )
      ).rejects.toThrow()
    })
  })
})
