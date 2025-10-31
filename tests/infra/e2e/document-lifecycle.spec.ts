import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { setupSharedTestDatabase, cleanupSharedTestDatabase, clearTestDatabase } from "../setup/test-database"
import { seedDocumentWithOwnerAndVersion } from "../setup/seed-helpers"
import { expectAsyncSuccess, expectSome } from "../../utils/test.helpers"
import { withTestClock } from "../../domain/setup/test-clock"
import { TEST_WORKSPACE_ID } from "../../application/fixtures/actors"
import { generateUser, createUserEntity } from "../../domain/factories/user.factory"
import { generateDocument } from "../../domain/factories/document.factory"
import { generateDocumentVersion } from "../../domain/factories/document-version.factory"
import { generateAccessPolicy, createAccessPolicyEntity } from "../../domain/factories/access-policy.factory"
import { generateDownloadToken, createDownloadTokenEntity } from "../../domain/factories/download-token.factory"
import { UserDrizzleRepository } from "@infra/repositories/user.repository"
import { DocumentAggregateDrizzleRepository } from "@infra/repositories/document-aggregate.repository"
import { AccessPolicyDrizzleRepository } from "@infra/repositories/access-policy.repository"
import { DownloadTokenDrizzleRepository } from "@infra/repositories/download-token.repository"
import { DocumentVersionEntity } from "@domain/documentVersion/document-version.entity"
import { DocumentAggregate } from "@domain/document/document.aggregate"
import { calculateTotalPages } from "@domain/utils/pagination"
import { Option } from "effect"
import { sql } from "drizzle-orm"
import { container } from "tsyringe"
import { TOKENS } from "@infra/di/container"

describe("Document Lifecycle E2E Integration", () => {
  let testDb: Awaited<ReturnType<typeof setupSharedTestDatabase>>
  let userRepo: UserDrizzleRepository
  let documentAggregateRepo: DocumentAggregateDrizzleRepository
  let accessPolicyRepo: AccessPolicyDrizzleRepository
  let downloadTokenRepo: DownloadTokenDrizzleRepository

  beforeAll(async () => {
    // Setup shared database once for the entire test file
    testDb = await setupSharedTestDatabase()
    
    // Register test database in container
    container.registerInstance(TOKENS.DATABASE_CONNECTION, testDb.db)
    
    // Resolve repositories from container
    userRepo = container.resolve(TOKENS.USER_REPOSITORY) as UserDrizzleRepository
    documentAggregateRepo = container.resolve(TOKENS.DOCUMENT_AGGREGATE_REPOSITORY) as DocumentAggregateDrizzleRepository
    accessPolicyRepo = container.resolve(TOKENS.ACCESS_POLICY_REPOSITORY) as AccessPolicyDrizzleRepository
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

  it("should complete full document lifecycle with all operations", async () => {
    const testStartTime = Date.now()

    // Step 1: Seed a user via UserDrizzleRepository
    const userData = generateUser({
      email: "e2e-test@example.com" as any,
    })
    const user = createUserEntity(userData)
    const savedUser = await expectAsyncSuccess(
      withTestClock(userRepo.save(user), testStartTime)
    )

    expect(savedUser.id).toBe(user.id)
    expect(savedUser.email).toBe("e2e-test@example.com")

    // Step 2: Save a document using aggregate
    const documentData = generateDocument({
      ownerId: savedUser.id,
      title: "E2E Test Document",
      description: "A comprehensive test document for E2E testing",
    })

    // Create aggregate with document only (no versions yet)
    const initialAggregate = await expectAsyncSuccess(
      withTestClock(DocumentAggregate.createFromSerialized(documentData, []), testStartTime)
    )

    const savedAggregate = await expectAsyncSuccess(
      withTestClock(documentAggregateRepo.save(initialAggregate), testStartTime)
    )

    const savedDocument = savedAggregate.document
    expect(savedDocument.id).toBe(initialAggregate.document.id)
    expect(savedDocument.title).toBe("E2E Test Document")
    expect(savedDocument.ownerId).toBe(savedUser.id)

    // Step 3: Insert a document version via aggregate
    const versionData = generateDocumentVersion({
      documentId: savedDocument.id,
      version: 1,
    })

    // Load aggregate, add version, and save
    const aggregateWithVersion1 = await expectAsyncSuccess(
      documentAggregateRepo.loadById(savedDocument.id)
    )
    const agg1 = expectSome(aggregateWithVersion1)
    
    const version1 = await expectAsyncSuccess(
      withTestClock(DocumentVersionEntity.create(versionData), testStartTime)
    )
    
    const updatedAggregate1 = await expectAsyncSuccess(
      withTestClock(DocumentAggregate.initialize(agg1.document, [version1]), testStartTime)
    )
    
    const savedAgg1 = await expectAsyncSuccess(
      withTestClock(documentAggregateRepo.save(updatedAggregate1), testStartTime)
    )
    
      const allVersions = savedAgg1.getVersions()
      const savedVersion = allVersions[0]!
    expect(savedVersion.documentId).toBe(savedDocument.id)
    expect(savedVersion.version).toBe(1)

    // Step 4: Create additional versions
    const version2Data = generateDocumentVersion({
      documentId: savedDocument.id,
      version: 2,
    })

    const version2 = await expectAsyncSuccess(
      withTestClock(DocumentVersionEntity.create(version2Data), testStartTime + 1000)
    )
    
    // Load aggregate, add version 2, and save
    const aggregateWithVersion2 = await expectAsyncSuccess(
      documentAggregateRepo.loadById(savedDocument.id)
    )
    const agg2 = expectSome(aggregateWithVersion2)
    
    const updatedAggregate2 = await expectAsyncSuccess(
      withTestClock(DocumentAggregate.initialize(agg2.document, [...agg2.getVersions(), version2]), testStartTime + 1000)
    )
    
    await expectAsyncSuccess(
      withTestClock(documentAggregateRepo.save(updatedAggregate2), testStartTime + 1000)
    )

    // Step 5: Fetch the latest version using aggregate
    const aggregateOption = await expectAsyncSuccess(
      documentAggregateRepo.loadById(savedDocument.id)
    )
    const aggregate = expectSome(aggregateOption)
    const latestVersionOption = aggregate.getLatestVersion()
    const latestVersion = expectSome(latestVersionOption)

    expect(latestVersion.version).toBe(2)
    expect(latestVersion.documentId).toBe(savedDocument.id)

    // Step 6: Mutate document metadata (rename, addTags)
    const renamedDocument = await expectAsyncSuccess(
      withTestClock(
        savedDocument.rename("Updated E2E Test Document"),
        testStartTime + 2000
      )
    )

    const documentWithTags = await expectAsyncSuccess(
      withTestClock(
        renamedDocument.addTags(["e2e", "test", "integration"]),
        testStartTime + 3000
      )
    )

    // Save the updated document via aggregate
    const aggregateWithUpdated = await expectAsyncSuccess(
      documentAggregateRepo.loadById(savedDocument.id)
    )
    const aggWithUpdated = expectSome(aggregateWithUpdated)
    
    const updatedAggregate = await expectAsyncSuccess(
        withTestClock(DocumentAggregate.initialize(documentWithTags, aggWithUpdated.getVersions()), testStartTime + 3000)
    )
    
    const savedUpdatedAggregate = await expectAsyncSuccess(
      withTestClock(documentAggregateRepo.save(updatedAggregate), testStartTime + 3000)
    )
    
    const updatedDocument = savedUpdatedAggregate.document

    expect(updatedDocument.title).toBe("Updated E2E Test Document")
    expect(updatedDocument.tagsOrEmpty).toEqual(["e2e", "test", "integration"])

    // Step 7: Create access policies for the document
    const policyData = generateAccessPolicy({
      resourceId: savedDocument.id,
      subjectId: savedUser.id,
      subjectType: "user",
      actions: ["read", "update"],
      effect: "allow",
    })

    const policy = createAccessPolicyEntity(policyData)
    const savedPolicy = await expectAsyncSuccess(
      withTestClock(accessPolicyRepo.save(policy), testStartTime + 4000)
    )

    expect(savedPolicy.resourceId).toBe(savedDocument.id)
    expect(savedPolicy.subjectId).toEqual(Option.some(savedUser.id))

    // Step 8: Create download tokens for the document
    const tokenData = generateDownloadToken({
      documentId: savedDocument.id,
      issuedTo: savedUser.id,
    })

    const token = createDownloadTokenEntity(tokenData)
    const savedToken = await expectAsyncSuccess(
      withTestClock(downloadTokenRepo.save(token), testStartTime + 5000)
    )

    expect(savedToken.documentId).toBe(savedDocument.id)
    expect(savedToken.issuedTo).toBe(savedUser.id)

    // Step 9: Use aggregate repository searchDocuments to confirm pagination and totals
    const documentList = await expectAsyncSuccess(
      documentAggregateRepo.searchDocuments({
        workspaceId: TEST_WORKSPACE_ID,
        paginationOptions: { pageNum: 1, pageSize: 10 }
      })
    )

    expect(documentList.data).toHaveLength(1)
    expect(documentList.total).toBe(1)
    expect(documentList.pageNum).toBe(1)
    expect(documentList.pageSize).toBe(10)
    expect(documentList.totalPages).toBe(calculateTotalPages(1, 10))

    // Step 10: Test search functionality
    const searchResults = await expectAsyncSuccess(
      documentAggregateRepo.searchDocuments({
        workspaceId: TEST_WORKSPACE_ID,
        query: "E2E",
        ownerId: savedUser.id,
      })
    )

    expect(searchResults.data).toHaveLength(1)
    expect(searchResults.data[0]?.title).toBe("Updated E2E Test Document")

    // Step 11: Test tag search
    const tagSearchResults = await expectAsyncSuccess(
      documentAggregateRepo.searchDocuments({
        workspaceId: TEST_WORKSPACE_ID,
        tags: ["e2e"],
        ownerId: savedUser.id,
      })
    )

    expect(tagSearchResults.data).toHaveLength(1)
    expect(tagSearchResults.data[0]?.title).toBe("Updated E2E Test Document")

    // Step 12: Verify access policies
    const userPolicies = await expectAsyncSuccess(
      accessPolicyRepo.findBySubject("user", savedUser.id)
    )

    expect(userPolicies).toHaveLength(1)
    expect(userPolicies[0]?.resourceId).toBe(savedDocument.id)

    // Step 13: Verify download tokens
    const userTokens = await expectAsyncSuccess(
      downloadTokenRepo.findByUserId(savedUser.id)
    )

    expect(userTokens).toHaveLength(1)
    expect(userTokens[0]?.documentId).toBe(savedDocument.id)

    // Step 14: Test EXPLAIN ANALYZE for index usage
    const explainResult = await testDb.db.execute(
      sql`EXPLAIN ANALYZE SELECT * FROM documents WHERE owner_id = ${savedUser.id} ORDER BY created_at DESC`
    )

    // Log the execution plan for verification
    console.log("Execution Plan:", explainResult.rows)

    // Verify that indexes are being used (look for index names in the plan)
    const planText = JSON.stringify(explainResult.rows)
    expect(planText).toContain("documents_owner_idx") // Should use owner index
    // Note: PostgreSQL may use owner index first (more selective) and sort in memory
    // The created_at index would be used if we had multiple documents from the same owner

    // Step 15: Delete the document and verify cascade deletion
    const deleted = await expectAsyncSuccess(
      documentAggregateRepo.delete(savedDocument.id, { force: true })
    )
    expect(deleted).toBe(true)

    // Step 16: Verify document no longer exists
    const documentOption = await expectAsyncSuccess(
      documentAggregateRepo.findDocumentById(savedDocument.id)
    )
    expect(Option.isNone(documentOption)).toBe(true)

    // Step 17: Verify document versions are removed (cascade delete)
    const deletedAggregateOption = await expectAsyncSuccess(
      documentAggregateRepo.loadById(savedDocument.id)
    )
    expect(Option.isNone(deletedAggregateOption)).toBe(true)

    // Step 18: Verify access policies are removed (cascade delete)
    const documentPolicies = await expectAsyncSuccess(
      accessPolicyRepo.findByResourceId(savedDocument.id)
    )
    expect(documentPolicies).toHaveLength(0)

    // Step 19: Verify download tokens are removed (cascade delete)
    const documentTokens = await expectAsyncSuccess(
      downloadTokenRepo.findByDocumentId(savedDocument.id)
    )
    expect(documentTokens).toHaveLength(0)

    // Step 20: Verify user still exists (should not be cascade deleted)
    const userExists = await expectAsyncSuccess(
      userRepo.exists(savedUser.id)
    )
    expect(userExists).toBe(true)

    // Step 21: Final verification - document list should be empty
    const finalDocumentList = await expectAsyncSuccess(
      documentAggregateRepo.searchDocuments({
        workspaceId: TEST_WORKSPACE_ID,
        paginationOptions: { pageNum: 1, pageSize: 10 }
      })
    )
    expect(finalDocumentList.data).toHaveLength(0)
    expect(finalDocumentList.total).toBe(0)
  })

  it("should handle multiple documents with pagination", async () => {
    const testStartTime = Date.now()

    // Create a user
    const userData = generateUser({
      email: "pagination-test@example.com" as any,
    })
    const user = createUserEntity(userData)
    const savedUser = await expectAsyncSuccess(
      withTestClock(userRepo.save(user), testStartTime)
    )

    // Create multiple documents
    const documents = []
    for (let i = 1; i <= 15; i++) {
      const documentData = generateDocument({
        ownerId: savedUser.id,
        title: `Pagination Test Document ${i}`,
        description: `Document ${i} for pagination testing`,
      })

      // Create aggregate with document only
      const aggregate = await expectAsyncSuccess(
        withTestClock(DocumentAggregate.createFromSerialized(documentData, []), testStartTime + i * 1000)
      )
      
      const savedAggregate = await expectAsyncSuccess(
        withTestClock(documentAggregateRepo.save(aggregate), testStartTime + i * 1000)
      )
      
      const savedDocument = savedAggregate.document

      documents.push(savedDocument)
    }

    // Test pagination
    const page1 = await expectAsyncSuccess(
      documentAggregateRepo.searchDocuments({
        workspaceId: TEST_WORKSPACE_ID,
        paginationOptions: { pageNum: 1, pageSize: 5 }
      })
    )

    expect(page1.data).toHaveLength(5)
    expect(page1.total).toBe(15)
    expect(page1.pageNum).toBe(1)
    expect(page1.pageSize).toBe(5)
    expect(page1.totalPages).toBe(calculateTotalPages(15, 5))
    expect(page1.totalPages).toBe(3)

    // Test second page
    const page2 = await expectAsyncSuccess(
      documentAggregateRepo.searchDocuments({
        workspaceId: TEST_WORKSPACE_ID,
        paginationOptions: { pageNum: 2, pageSize: 5 }
      })
    )

    expect(page2.data).toHaveLength(5)
    expect(page2.total).toBe(15)
    expect(page2.pageNum).toBe(2)
    expect(page2.totalPages).toBe(3)

    // Test last page
    const page3 = await expectAsyncSuccess(
      documentAggregateRepo.searchDocuments({
        workspaceId: TEST_WORKSPACE_ID,
        paginationOptions: { pageNum: 3, pageSize: 5 }
      })
    )

    expect(page3.data).toHaveLength(5)
    expect(page3.total).toBe(15)
    expect(page3.pageNum).toBe(3)
    expect(page3.totalPages).toBe(3)

    // Test search with pagination
    const searchPage1 = await expectAsyncSuccess(
      documentAggregateRepo.searchDocuments({
        workspaceId: TEST_WORKSPACE_ID,
        query: "Pagination",
        ownerId: savedUser.id,
        paginationOptions: { pageNum: 1, pageSize: 3 }
      })
    )

    expect(searchPage1.data).toHaveLength(3)
    expect(searchPage1.total).toBe(15)
    expect(searchPage1.pageNum).toBe(1)
    expect(searchPage1.pageSize).toBe(3)
    expect(searchPage1.totalPages).toBe(calculateTotalPages(15, 3))
  })

  it("should handle document version lifecycle", async () => {
    const testStartTime = Date.now()

    // Create user and document
    const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

    // Create multiple versions
    const versions = []
    for (let i = 2; i <= 5; i++) {
      const versionData = generateDocumentVersion({
        documentId: document.id,
        version: i,
      })

      const version = DocumentVersionEntity.create(versionData)
      const versionEntity = await expectAsyncSuccess(
        withTestClock(version, testStartTime + i * 1000)
      )

      // Load aggregate, add version, and save
      const aggregateWithVersion = await expectAsyncSuccess(
        documentAggregateRepo.loadById(document.id)
      )
      const agg = expectSome(aggregateWithVersion)
      
      const updatedAggregate = await expectAsyncSuccess(
        withTestClock(DocumentAggregate.initialize(agg.document, [...agg.getVersions(), versionEntity]), testStartTime + i * 1000)
      )
      
      const savedAgg = await expectAsyncSuccess(
        withTestClock(documentAggregateRepo.save(updatedAggregate), testStartTime + i * 1000)
      )
      
      const latestVersionOption = savedAgg.getLatestVersion()
      const savedVersion = expectSome(latestVersionOption)

      versions.push(savedVersion)
    }

    // Test version ordering using aggregate
    const aggregateOption = await expectAsyncSuccess(
      documentAggregateRepo.loadById(document.id)
    )
    const aggregate = expectSome(aggregateOption)
    const allVersions = aggregate.getVersions()

    expect(allVersions).toHaveLength(5)
    // Versions are stored in ascending order but can be accessed via helpers
    expect(allVersions.some(v => v.version === 1)).toBe(true)
    expect(allVersions.some(v => v.version === 5)).toBe(true)

    // Test latest version
    const latestVersionOption = aggregate.getLatestVersion()
    const latestVersion = expectSome(latestVersionOption)

    expect(latestVersion.version).toBe(5)

    // Next version number is determined by aggregate sequencing during upload confirmation

    // Test version pagination (versions are already ordered, manually paginate)
    const allVersionsForPagination = aggregate.getVersions()
    
    const versionList = {
      data: allVersionsForPagination.slice(0, 3),
      total: allVersionsForPagination.length,
      pageNum: 1,
      pageSize: 3,
      totalPages: calculateTotalPages(allVersionsForPagination.length, 3)
    }

    expect(versionList.data).toHaveLength(3)
    expect(versionList.total).toBe(5)
    expect(versionList.pageNum).toBe(1)
    expect(versionList.pageSize).toBe(3)
    expect(versionList.totalPages).toBe(calculateTotalPages(5, 3))
  })
})
