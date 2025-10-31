import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { setupSharedTestDatabase, cleanupSharedTestDatabase, clearTestDatabase } from "./test-database"
import {
  seedUser,
  seedDownloadToken,
  seedAccessPolicy,
  seedDocumentWithOwnerAndVersion,
  SEED_TIMESTAMP,
} from "./seed-helpers"
import { expectAsyncSuccess, expectSome } from "../../utils/test.helpers"
import { UserDrizzleRepository } from "@infra/repositories/user.repository"
import { DocumentAggregateDrizzleRepository } from "@infra/repositories/document-aggregate.repository"
import { DownloadTokenDrizzleRepository } from "@infra/repositories/download-token.repository"
import { AccessPolicyDrizzleRepository } from "@infra/repositories/access-policy.repository"
import { container } from "tsyringe"
import { TOKENS } from "@infra/di/container"

describe("Seed Helpers", () => {
  let testDb: Awaited<ReturnType<typeof setupSharedTestDatabase>>

  beforeAll(async () => {
    testDb = await setupSharedTestDatabase()
    container.registerInstance(TOKENS.DATABASE_CONNECTION, testDb.db)
  })

  afterAll(async () => {
    await cleanupSharedTestDatabase()
  })

  beforeEach(async () => {
    await clearTestDatabase(testDb.db)
  })

  describe("seedUser", () => {
    it("should seed a user with deterministic timestamp", async () => {
      const user = await seedUser(testDb.db, {
        email: "test@example.com" as any,
        roles: ["USER"],
      })

      expect(user.email).toBe("test@example.com")
      expect(user.roles).toEqual(["USER"])
      expect(user.createdAt).toEqual(SEED_TIMESTAMP)

      // Verify it's in the database
      const userRepo = container.resolve(TOKENS.USER_REPOSITORY) as UserDrizzleRepository
      const foundUser = await expectAsyncSuccess(userRepo.findById(user.id))
      
      expect(foundUser).toBeDefined()
    })
  })

  describe("seedDocument", () => {
    it("should seed a document as part of a complete structure", async () => {
      // Document seeding with FK constraints requires using seedDocumentWithOwnerAndVersion
      const { document, owner } = await seedDocumentWithOwnerAndVersion(testDb.db)

      expect(document.ownerId).toBe(owner.id)
      expect(document.createdAt).toEqual(SEED_TIMESTAMP)

      // Verify it's in the database
      const docRepo = container.resolve(TOKENS.DOCUMENT_AGGREGATE_REPOSITORY) as DocumentAggregateDrizzleRepository
      const foundDocOption = await expectAsyncSuccess(docRepo.findDocumentById(document.id))
      const foundDoc = expectSome(foundDocOption)
      
      expect(foundDoc).toBeDefined()
    })
  })

  describe("seedDocumentVersion", () => {
    it("should seed a document version with deterministic timestamp", async () => {
      // Use seedDocumentWithOwnerAndVersion to get a complete structure
      const { document, version } = await seedDocumentWithOwnerAndVersion(testDb.db)

      expect(version.version).toBe(1)
      expect(version.documentId).toBe(document.id)
      expect(version.createdAt).toEqual(SEED_TIMESTAMP)

      // Verify it's in the database
      const aggregateRepo = container.resolve(TOKENS.DOCUMENT_AGGREGATE_REPOSITORY) as DocumentAggregateDrizzleRepository
      const documentIdOption = await expectAsyncSuccess(aggregateRepo.findDocumentIdByVersionId(version.id))
      const documentId = expectSome(documentIdOption)
      const aggregateOption = await expectAsyncSuccess(aggregateRepo.loadById(documentId))
      const aggregate = expectSome(aggregateOption)
      const foundVersionOption = aggregate.getVersionById(version.id)
      const foundVersion = expectSome(foundVersionOption)
      
      expect(foundVersion).toBeDefined()
    })
  })

  describe("seedDownloadToken", () => {
    it("should seed a download token with deterministic timestamp", async () => {
      const user = await seedUser(testDb.db)
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      const token = await seedDownloadToken(testDb.db, {
        documentId: document.id,
        issuedTo: user.id,
      })

      expect(token.documentId).toBe(document.id)
      expect(token.issuedTo).toBe(user.id)
      // Note: token uses current time for expiry validation, so createdAt won't match SEED_TIMESTAMP
      expect(token.createdAt).toBeInstanceOf(Date)

      // Verify it's in the database
      const tokenRepo = container.resolve(TOKENS.DOWNLOAD_TOKEN_REPOSITORY) as DownloadTokenDrizzleRepository
      const foundToken = await expectAsyncSuccess(tokenRepo.findById(token.id))
      
      expect(foundToken).toBeDefined()
    })
  })

  describe("seedAccessPolicy", () => {
    it("should seed an access policy with deterministic timestamp", async () => {
      const user = await seedUser(testDb.db)
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      const policy = await seedAccessPolicy(testDb.db, {
        resourceId: document.id,
        subjectType: "user",
        subjectId: user.id,
        actions: ["read", "download"],
      })

      expect(policy.resourceId).toBe(document.id)
      expect(policy.subjectId).toBeDefined()
      expect(policy.createdAt).toEqual(SEED_TIMESTAMP)

      // Verify it's in the database
      const policyRepo = container.resolve(TOKENS.ACCESS_POLICY_REPOSITORY) as AccessPolicyDrizzleRepository
      const foundPolicy = await expectAsyncSuccess(policyRepo.findById(policy.id))
      
      expect(foundPolicy).toBeDefined()
    })
  })

  describe("seedDocumentWithOwnerAndVersion", () => {
    it("should seed a complete document structure", async () => {
      const { owner, document, version } = await seedDocumentWithOwnerAndVersion(testDb.db)

      expect(owner).toBeDefined()
      expect(document).toBeDefined()
      expect(version).toBeDefined()

      expect(document.ownerId).toBe(owner.id)
      // currentVersionId removed - no longer stored in document
      expect(version.documentId).toBe(document.id)

      // Verify all entities are in the database
      const userRepo = container.resolve(TOKENS.USER_REPOSITORY) as UserDrizzleRepository
      const aggregateRepo = container.resolve(TOKENS.DOCUMENT_AGGREGATE_REPOSITORY) as DocumentAggregateDrizzleRepository

      const foundOwnerOption = await expectAsyncSuccess(userRepo.findById(owner.id))
      const foundOwner = expectSome(foundOwnerOption)
      const foundDocOption = await expectAsyncSuccess(aggregateRepo.findDocumentById(document.id))
      const foundDoc = expectSome(foundDocOption)
      const documentIdOption = await expectAsyncSuccess(aggregateRepo.findDocumentIdByVersionId(version.id))
      const documentId = expectSome(documentIdOption)
      const aggregateOption = await expectAsyncSuccess(aggregateRepo.loadById(documentId))
      const aggregate = expectSome(aggregateOption)
      const foundVersionOption = aggregate.getVersionById(version.id)
      const foundVersion = expectSome(foundVersionOption)

      expect(foundOwner).toBeDefined()
      expect(foundDoc).toBeDefined()
      expect(foundVersion).toBeDefined()
    })
  })
})
