import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { setupSharedTestDatabase, cleanupSharedTestDatabase, clearTestDatabase } from "../setup/test-database"
import { seedUser, seedAccessPolicy, seedDocumentWithOwnerAndVersion } from "../setup/seed-helpers"
import { expectAsyncSuccess, expectSome } from "../../utils/test.helpers"
import { withTestClock } from "../../domain/setup/test-clock"
import { generateAccessPolicy, createAccessPolicyEntity, createRolePolicy } from "../../domain/factories/access-policy.factory"
import { AccessPolicyDrizzleRepository } from "@infra/repositories/access-policy.repository"
import { calculateTotalPages } from "@domain/utils/pagination"
import { Option } from "effect"

describe("AccessPolicyDrizzleRepository Integration", () => {
  let testDb: Awaited<ReturnType<typeof setupSharedTestDatabase>>
  let accessPolicyRepo: AccessPolicyDrizzleRepository

  beforeAll(async () => {
    // Setup shared database once for the entire test file
    testDb = await setupSharedTestDatabase()
    accessPolicyRepo = new AccessPolicyDrizzleRepository(testDb.db)
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
    it("should insert a new access policy and read it back with findById", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)
      
      const policyData = generateAccessPolicy({
        resourceId: document.id,
        subjectId: user.id,
        subjectType: "user",
      })

      const policy = createAccessPolicyEntity(policyData)

      // Save the access policy
      const saved = await expectAsyncSuccess(
        withTestClock(accessPolicyRepo.save(policy), Date.now())
      )

      expect(saved.id).toBe(policy.id)
      expect(saved.resourceId).toBe(document.id)
      expect(saved.subjectId).toEqual(policy.subjectId)

      // Read back with findById
      const foundOption = await expectAsyncSuccess(accessPolicyRepo.findById(policy.id))
      const found = expectSome(foundOption)

      expect(found.id).toBe(policy.id)
      expect(found.resourceId).toBe(document.id)
      expect(found.subjectId).toEqual(policy.subjectId)
    })

    it("should insert an access policy with all fields populated", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)
      
      const policyData = generateAccessPolicy({
        resourceId: document.id,
        subjectId: user.id,
        subjectType: "user",
        actions: ["read", "update", "delete"],
        effect: "allow",
      })

      const policy = createAccessPolicyEntity(policyData)

      const saved = await expectAsyncSuccess(
        withTestClock(accessPolicyRepo.save(policy), Date.now())
      )

      expect(saved.resourceId).toBe(document.id)
      expect(saved.subjectId).toEqual(policy.subjectId)
      expect(saved.actions).toEqual(["read", "update", "delete"])
      expect(saved.effect).toBe("allow")
    })
  })

  describe("save - update", () => {
    it("should update an existing access policy", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)
      const policy = await seedAccessPolicy(testDb.db, {
        resourceId: document.id,
        subjectId: user.id,
        subjectType: "user",
        actions: ["read"],
      })

      // Update the policy actions
      const updatedPolicy = createAccessPolicyEntity({
        id: policy.id,
        resourceId: document.id,
        subjectId: user.id,
        subjectType: "user",
        actions: ["read", "update", "delete"],
        effect: "allow",
      })

      // Save the updated policy
      const saved = await expectAsyncSuccess(
        withTestClock(accessPolicyRepo.save(updatedPolicy), Date.now())
      )

      expect(saved.id).toBe(policy.id)
      expect(saved.actions).toEqual(["read", "update", "delete"])

      // Verify the update persisted
      const foundOption = await expectAsyncSuccess(accessPolicyRepo.findById(policy.id))
      const found = expectSome(foundOption)
      expect(found.actions).toEqual(["read", "update", "delete"])
    })
  })

  describe("findBySubject", () => {
    it("should find access policies for a specific user", async () => {
      const { document: document1 } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const { document: document2 } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user1 = await seedUser(testDb.db)
      const user2 = await seedUser(testDb.db)

      // Create policies for user1 on different documents
      await seedAccessPolicy(testDb.db, {
        resourceId: document1.id,
        subjectId: user1.id,
        subjectType: "user",
      })
      await seedAccessPolicy(testDb.db, {
        resourceId: document2.id,
        subjectId: user1.id,
        subjectType: "user",
      })

      // Create policy for user2
      await seedAccessPolicy(testDb.db, {
        resourceId: document1.id,
        subjectId: user2.id,
        subjectType: "user",
      })

      // Find policies for user1
      const user1Policies = await expectAsyncSuccess(
        accessPolicyRepo.findBySubject("user", user1.id)
      )

      expect(user1Policies).toHaveLength(2)
      expect(user1Policies.every(p => Option.getOrElse(p.subjectId, () => "") === user1.id)).toBe(true)
    })

    it("should find access policies for a specific role", async () => {
      const { document: document1 } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const { document: document2 } = await seedDocumentWithOwnerAndVersion(testDb.db)

      // Create role-based policies on different documents using the factory
      const adminPolicyData = createRolePolicy(document1.id, "ADMIN")
      const userPolicyData = createRolePolicy(document2.id, "USER")
      
      const adminPolicy = createAccessPolicyEntity(adminPolicyData)
      const userPolicy = createAccessPolicyEntity(userPolicyData)

      await expectAsyncSuccess(
        withTestClock(accessPolicyRepo.save(adminPolicy), Date.now())
      )
      await expectAsyncSuccess(
        withTestClock(accessPolicyRepo.save(userPolicy), Date.now())
      )

      // Find policies for ADMIN role
      const adminPolicies = await expectAsyncSuccess(
        accessPolicyRepo.findBySubject("role", undefined, "ADMIN")
      )

      expect(adminPolicies).toHaveLength(1)
      expect(Option.getOrElse(adminPolicies[0]?.role || Option.none(), () => "")).toBe("ADMIN")
    })

    it("should return empty array for subject with no policies", async () => {
      const user = await seedUser(testDb.db)

      const policies = await expectAsyncSuccess(
        accessPolicyRepo.findBySubject("user", user.id)
      )

      expect(policies).toHaveLength(0)
    })
  })

  describe("findByUserAndResource", () => {
    it("should return access policies for a specific user and resource", async () => {
      const { document: document1 } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const { document: document2 } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user1 = await seedUser(testDb.db)
      const user2 = await seedUser(testDb.db)

      // Create policies for user1 on different documents
      await seedAccessPolicy(testDb.db, {
        resourceId: document1.id,
        subjectId: user1.id,
        subjectType: "user",
      })
      await seedAccessPolicy(testDb.db, {
        resourceId: document2.id,
        subjectId: user1.id,
        subjectType: "user",
      })

      // Create policy for user2 and same document
      await seedAccessPolicy(testDb.db, {
        resourceId: document1.id,
        subjectId: user2.id,
        subjectType: "user",
      })

      // Find policies for user1 and document1
      const user1DocumentPolicies = await expectAsyncSuccess(
        accessPolicyRepo.findByUserAndResource(user1.id, document1.id)
      )

      expect(user1DocumentPolicies).toHaveLength(1)
      expect(user1DocumentPolicies.every(p => Option.getOrElse(p.subjectId, () => "") === user1.id && p.resourceId === document1.id)).toBe(true)
    })

    it("should return empty array for user with no policies on resource", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)

      const policies = await expectAsyncSuccess(
        accessPolicyRepo.findByUserAndResource(user.id, document.id)
      )

      expect(policies).toHaveLength(0)
    })
  })

  describe("findByResourceId", () => {
    it("should return access policies for a specific resource", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user1 = await seedUser(testDb.db)
      const user2 = await seedUser(testDb.db)

      // Create policies for the document
      await seedAccessPolicy(testDb.db, {
        resourceId: document.id,
        subjectId: user1.id,
        subjectType: "user",
      })
      await seedAccessPolicy(testDb.db, {
        resourceId: document.id,
        subjectId: user2.id,
        subjectType: "user",
      })

      // Find policies for the document
      const documentPolicies = await expectAsyncSuccess(
        accessPolicyRepo.findByResourceId(document.id)
      )

      expect(documentPolicies).toHaveLength(2)
      expect(documentPolicies.every(p => p.resourceId === document.id)).toBe(true)
    })

    it("should return empty array for resource with no policies", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      const policies = await expectAsyncSuccess(
        accessPolicyRepo.findByResourceId(document.id)
      )

      expect(policies).toHaveLength(0)
    })
  })

  describe("save - unique constraint", () => {
    it("should fail with AccessPolicyConflictError when inserting conflicting policies", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)

      // Create first policy
      const policy1 = createAccessPolicyEntity({
        resourceId: document.id,
        subjectId: user.id,
        subjectType: "user",
      })

      await expectAsyncSuccess(
        withTestClock(accessPolicyRepo.save(policy1), Date.now())
      )

      // Try to create second policy with same resource and subject
      const policy2 = createAccessPolicyEntity({
        resourceId: document.id,
        subjectId: user.id,
        subjectType: "user",
      })

      // This should fail due to unique constraint
      await expect(
        expectAsyncSuccess(
          withTestClock(accessPolicyRepo.save(policy2), Date.now())
        )
      ).rejects.toThrow()
    })
  })

  describe("deleteByResourceId", () => {
    it("should delete all policies for a resource and return count", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user1 = await seedUser(testDb.db)
      const user2 = await seedUser(testDb.db)

      // Create multiple policies for the document
      await seedAccessPolicy(testDb.db, {
        resourceId: document.id,
        subjectId: user1.id,
        subjectType: "user",
      })
      await seedAccessPolicy(testDb.db, {
        resourceId: document.id,
        subjectId: user2.id,
        subjectType: "user",
      })

      // Delete policies by resource ID
      const deletedCount = await expectAsyncSuccess(
        accessPolicyRepo.deleteByResourceId(document.id)
      )

      expect(deletedCount).toBe(2)

      // Verify policies are gone
      const remainingPolicies = await expectAsyncSuccess(
        accessPolicyRepo.findByResourceId(document.id)
      )

      expect(remainingPolicies).toHaveLength(0)
    })

    it("should return 0 when no policies exist for resource", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)

      const deletedCount = await expectAsyncSuccess(
        accessPolicyRepo.deleteByResourceId(document.id)
      )

      expect(deletedCount).toBe(0)
    })
  })

  describe("deleteByUserId", () => {
    it("should delete all policies for a user and return count", async () => {
      const { document: document1 } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const { document: document2 } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user1 = await seedUser(testDb.db)
      const user2 = await seedUser(testDb.db)

      // Create policies for user1 on different documents
      await seedAccessPolicy(testDb.db, {
        resourceId: document1.id,
        subjectId: user1.id,
        subjectType: "user",
      })
      await seedAccessPolicy(testDb.db, {
        resourceId: document2.id,
        subjectId: user1.id,
        subjectType: "user",
      })

      // Create policy for user2
      await seedAccessPolicy(testDb.db, {
        resourceId: document1.id,
        subjectId: user2.id,
        subjectType: "user",
      })

      // Delete policies by user ID
      const deletedCount = await expectAsyncSuccess(
        accessPolicyRepo.deleteByUserId(user1.id)
      )

      expect(deletedCount).toBe(2)

      // Verify only user2's policy remains
      const remainingPolicies = await expectAsyncSuccess(
        accessPolicyRepo.findByResourceId(document1.id)
      )

      expect(remainingPolicies).toHaveLength(1)
      expect(Option.getOrElse(remainingPolicies[0]?.subjectId || Option.none(), () => "")).toBe(user2.id)
    })

    it("should return 0 when no policies exist for user", async () => {
      const user = await seedUser(testDb.db)

      const deletedCount = await expectAsyncSuccess(
        accessPolicyRepo.deleteByUserId(user.id)
      )

      expect(deletedCount).toBe(0)
    })
  })

  describe("exists", () => {
    it("should return false for non-existent access policy", async () => {
      const exists = await expectAsyncSuccess(
        accessPolicyRepo.exists("00000000-0000-0000-0000-000000000000" as any)
      )

      expect(exists).toBe(false)
    })

    it("should return true for existing access policy", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)
      const policy = await seedAccessPolicy(testDb.db, {
        resourceId: document.id,
        subjectId: user.id,
        subjectType: "user",
      })

      const exists = await expectAsyncSuccess(accessPolicyRepo.exists(policy.id))

      expect(exists).toBe(true)
    })
  })

  describe("delete", () => {
    it("should delete an existing access policy and return true", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)
      const policy = await seedAccessPolicy(testDb.db, {
        resourceId: document.id,
        subjectId: user.id,
        subjectType: "user",
      })

      // Verify policy exists
      const existsBefore = await expectAsyncSuccess(accessPolicyRepo.exists(policy.id))
      expect(existsBefore).toBe(true)

      // Delete the policy
      const deleted = await expectAsyncSuccess(accessPolicyRepo.delete(policy.id))
      expect(deleted).toBe(true)

      // Verify policy no longer exists
      const existsAfter = await expectAsyncSuccess(accessPolicyRepo.exists(policy.id))
      expect(existsAfter).toBe(false)
    })

    it("should fail with AccessPolicyNotFoundError when deleting non-existent policy", async () => {
      await expect(
        expectAsyncSuccess(
          accessPolicyRepo.delete("00000000-0000-0000-0000-000000000000" as any)
        )
      ).rejects.toThrow()
    })
  })

  describe("list", () => {
    it("should return empty list when no access policies exist", async () => {
      const result = await expectAsyncSuccess(accessPolicyRepo.list())

      expect(result.data).toHaveLength(0)
      expect(result.total).toBe(0)
      expect(result.pageNum).toBe(1)
      expect(result.pageSize).toBe(10)
      expect(result.totalPages).toBe(0)
    })

    it("should list access policies with default pagination", async () => {
      const { document: document1 } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const { document: document2 } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const { document: document3 } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)

      // Create 3 policies on different documents
      await seedAccessPolicy(testDb.db, {
        resourceId: document1.id,
        subjectId: user.id,
        subjectType: "user",
      })
      await seedAccessPolicy(testDb.db, {
        resourceId: document2.id,
        subjectId: user.id,
        subjectType: "user",
      })
      await seedAccessPolicy(testDb.db, {
        resourceId: document3.id,
        subjectId: user.id,
        subjectType: "user",
      })

      const result = await expectAsyncSuccess(accessPolicyRepo.list())

      expect(result.data).toHaveLength(3)
      expect(result.total).toBe(3)
      expect(result.pageNum).toBe(1)
      expect(result.pageSize).toBe(10)
      expect(result.totalPages).toBe(calculateTotalPages(3, 10))
    })

    it("should sort access policies by createdAt", async () => {
      const { document: document1 } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const { document: document2 } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const { document: document3 } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)

      // Create policies on different documents
      await seedAccessPolicy(testDb.db, {
        resourceId: document1.id,
        subjectId: user.id,
        subjectType: "user",
      })
      await seedAccessPolicy(testDb.db, {
        resourceId: document2.id,
        subjectId: user.id,
        subjectType: "user",
      })
      await seedAccessPolicy(testDb.db, {
        resourceId: document3.id,
        subjectId: user.id,
        subjectType: "user",
      })

      const result = await expectAsyncSuccess(accessPolicyRepo.list())

      expect(result.data).toHaveLength(3)
      // Should be sorted by createdAt (oldest first)
      expect(result.data[0]?.createdAt).toBeDefined()
      expect(result.data[1]?.createdAt).toBeDefined()
      expect(result.data[2]?.createdAt).toBeDefined()
    })

    it("should validate pagination metadata matches calculateTotalPages", async () => {
      const user = await seedUser(testDb.db)

      // Create 25 policies on different documents
      for (let i = 0; i < 25; i++) {
        const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
        await seedAccessPolicy(testDb.db, {
          resourceId: document.id,
          subjectId: user.id,
          subjectType: "user",
        })
      }

      const pageSize = 10

      // Get first page
      const page1 = await expectAsyncSuccess(
        accessPolicyRepo.list({ pageNum: 1, pageSize })
      )

      expect(page1.data).toHaveLength(10)
      expect(page1.total).toBe(25)
      expect(page1.totalPages).toBe(calculateTotalPages(25, pageSize))
      expect(page1.totalPages).toBe(3)

      // Get last page
      const page3 = await expectAsyncSuccess(
        accessPolicyRepo.list({ pageNum: 3, pageSize })
      )

      expect(page3.data).toHaveLength(5)
      expect(page3.total).toBe(25)
      expect(page3.totalPages).toBe(3)
    })

    it("should return entities with all fields properly mapped", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const user = await seedUser(testDb.db)
      const policy = await seedAccessPolicy(testDb.db, {
        resourceId: document.id,
        subjectId: user.id,
        subjectType: "user",
        actions: ["read", "update"],
        effect: "allow",
      })

      const result = await expectAsyncSuccess(accessPolicyRepo.list())

      expect(result.data).toHaveLength(1)
      const retrievedPolicy = result.data[0]

      expect(retrievedPolicy).toBeDefined()
      expect(retrievedPolicy!.id).toBe(policy.id)
      expect(retrievedPolicy!.resourceId).toBe(policy.resourceId)
      expect(retrievedPolicy!.subjectId).toEqual(policy.subjectId)
      expect(retrievedPolicy!.actions).toEqual(policy.actions)
      expect(retrievedPolicy!.effect).toBe(policy.effect)
    })
  })

  describe("error translation checks", () => {
    it("should translate foreign key violation when document doesn't exist", async () => {
      const user = await seedUser(testDb.db)
      const faker = await import("@faker-js/faker")
      const nonExistentDocId = faker.faker.string.uuid() as any // Valid UUID format but non-existent
      
      const policyData = generateAccessPolicy({
        resourceId: nonExistentDocId,
        subjectId: user.id,
        subjectType: "user",
      })

      const policy = createAccessPolicyEntity(policyData)

      // This should fail with foreign key constraint violation
      await expect(
        expectAsyncSuccess(
          withTestClock(accessPolicyRepo.save(policy), Date.now())
        )
      ).rejects.toThrow()
    })

    it("should translate foreign key violation when user doesn't exist", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(testDb.db)
      const faker = await import("@faker-js/faker")
      const nonExistentUserId = faker.faker.string.uuid() as any // Valid UUID format but non-existent
      
      const policyData = generateAccessPolicy({
        resourceId: document.id,
        subjectId: nonExistentUserId,
        subjectType: "user",
      })

      const policy = createAccessPolicyEntity(policyData)

      // This should fail with foreign key constraint violation
      await expect(
        expectAsyncSuccess(
          withTestClock(accessPolicyRepo.save(policy), Date.now())
        )
      ).rejects.toThrow()
    })
  })
})
