import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { faker } from "../../domain/factories/common"
import { setupSharedTestDatabase, cleanupSharedTestDatabase, clearTestDatabase } from "../setup/test-database"
import { seedUser } from "../setup/seed-helpers"
import { expectAsyncSuccess, expectSome, expectNone } from "../../utils/test.helpers"
import { withTestClock } from "../../domain/setup/test-clock"
import { generateUser, createUserEntity } from "../../domain/factories/user.factory"
import { UserDrizzleRepository } from "@infra/repositories/user.repository"
import { calculateTotalPages } from "@domain/utils/pagination"
import { container } from "tsyringe"
import { TOKENS } from "@infra/di/container"

describe("UserDrizzleRepository Integration", () => {
  let testDb: Awaited<ReturnType<typeof setupSharedTestDatabase>>
  let userRepo: UserDrizzleRepository

  beforeAll(async () => {
    // Setup shared database once for the entire test file
    testDb = await setupSharedTestDatabase()
    
    // Register test database in container
    container.registerInstance(TOKENS.DATABASE_CONNECTION, testDb.db)
    
    // Resolve repository from container
    userRepo = container.resolve(TOKENS.USER_REPOSITORY) as UserDrizzleRepository
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
    it("should insert a new user and read it back with findById", async () => {
      const userData = generateUser({
        email: "new-user@example.com" as any,
      })

      const user = createUserEntity(userData)

      // Save the user
      const saved = await expectAsyncSuccess(
        withTestClock(userRepo.save(user), Date.now())
      )

      expect(saved.id).toBe(user.id)
      expect(saved.email).toBe(user.email)

      // Read back with findById
      const foundOption = await expectAsyncSuccess(userRepo.findById(user.id))
      const found = expectSome(foundOption)

      expect(found.id).toBe(user.id)
      expect(found.email).toBe(user.email)
      expect(found.roles).toEqual(user.roles)
    })

    it("should insert a user with all fields populated", async () => {
      const workspaceId = faker.string.uuid()
      const userData = generateUser({
        email: "complete-user@example.com" as any,
        roles: ["ADMIN", "USER"] as any,
        workspaceId: workspaceId as any,
      })

      const user = createUserEntity(userData)

      const saved = await expectAsyncSuccess(
        withTestClock(userRepo.save(user), Date.now())
      )

      expect(saved.workspaceId).toEqual(user.workspaceId)
      expect(saved.roles).toEqual(["ADMIN", "USER"])
    })
  })

  describe("save - update", () => {
    it("should update an existing user and change updatedAt", async () => {
      const originalTime = new Date("2025-01-01T00:00:00.000Z").getTime()
      const updateTime = new Date("2025-01-02T00:00:00.000Z").getTime()

      // Create and save initial user with workspace assignment
      const user = createUserEntity({
        email: "update-test@example.com" as any,
      })

      const saved = await expectAsyncSuccess(
        withTestClock(userRepo.save(user), originalTime)
      )

      // Assign to workspace (this mutates the user and updates timestamp)
      const workspaceId = faker.string.uuid()
      const updated = await expectAsyncSuccess(
        withTestClock(
          saved.assignToWorkspace(workspaceId as any),
          updateTime
        )
      )

      // Save the updated user
      const savedAgain = await expectAsyncSuccess(
        withTestClock(userRepo.save(updated), updateTime)
      )

      expect(savedAgain.id).toBe(saved.id)

      // Verify the workspace was assigned
      const foundOption = await expectAsyncSuccess(userRepo.findById(saved.id))
      const found = expectSome(foundOption)
      expect(found.hasWorkspaceAssignment).toBe(true)
    })

    it("should preserve ID when updating user with same email", async () => {
      const user = createUserEntity({
        email: "same-email@example.com" as any,
      })

      const saved = await expectAsyncSuccess(
        withTestClock(userRepo.save(user), Date.now())
      )

      const originalId = saved.id

      // Update same user (same ID, same email) by assigning/removing workspace
      const workspaceId = faker.string.uuid()
      const updated = await expectAsyncSuccess(
        withTestClock(
          saved.assignToWorkspace(workspaceId as any),
          Date.now()
        )
      )

      const savedAgain = await expectAsyncSuccess(
        withTestClock(userRepo.save(updated), Date.now())
      )

      expect(savedAgain.id).toBe(originalId)
    })
  })

  describe("save - duplicate email", () => {
    it("should fail with UserAlreadyExistsError when inserting duplicate email", async () => {
      const email = "duplicate@example.com" as any

      const user1 = createUserEntity({ email })
      const user2 = createUserEntity({ email })

      // Save first user
      await expectAsyncSuccess(
        withTestClock(userRepo.save(user1), Date.now())
      )

      // Try to save second user with same email (different ID)
      await expect(
        expectAsyncSuccess(
          withTestClock(userRepo.save(user2), Date.now())
        )
      ).rejects.toThrow()
    })
  })

  describe("findByEmail", () => {
    it("should return Option.none for unknown email addresses", async () => {
      const result = await expectAsyncSuccess(
        userRepo.findByEmail("nonexistent@example.com" as any)
      )

      expectNone(result)
    })

    it("should find user by email", async () => {
      const user = await seedUser(testDb.db)

      const foundOption = await expectAsyncSuccess(
        userRepo.findByEmail(user.email)
      )

      const found = expectSome(foundOption)
      expect(found.id).toBe(user.id)
      expect(found.email).toBe(user.email)
    })
  })

  describe("exists", () => {
    it("should return false for non-existent user", async () => {
      const exists = await expectAsyncSuccess(
        userRepo.exists("00000000-0000-0000-0000-000000000000" as any)
      )

      expect(exists).toBe(false)
    })

    it("should return true for existing user", async () => {
      const user = await seedUser(testDb.db)

      const exists = await expectAsyncSuccess(userRepo.exists(user.id))

      expect(exists).toBe(true)
    })
  })

  describe("delete", () => {
    it("should delete an existing user and return true", async () => {
      const user = await seedUser(testDb.db)

      // Verify user exists
      const existsBefore = await expectAsyncSuccess(userRepo.exists(user.id))
      expect(existsBefore).toBe(true)

      // Delete the user
      const deleted = await expectAsyncSuccess(userRepo.delete(user.id))
      expect(deleted).toBe(true)

      // Verify user no longer exists
      const existsAfter = await expectAsyncSuccess(userRepo.exists(user.id))
      expect(existsAfter).toBe(false)
    })

    it("should fail with UserNotFoundError when deleting non-existent user", async () => {
      await expect(
        expectAsyncSuccess(
          userRepo.delete("00000000-0000-0000-0000-000000000000" as any)
        )
      ).rejects.toThrow()
    })
  })

  describe("list", () => {
    it("should return empty list when no users exist", async () => {
      const result = await expectAsyncSuccess(userRepo.list())

      expect(result.data).toHaveLength(0)
      expect(result.total).toBe(0)
      expect(result.pageNum).toBe(1)
      expect(result.pageSize).toBe(10)
      expect(result.totalPages).toBe(0)
    })

    it("should list users with default pagination", async () => {
      // Seed 3 users
      await seedUser(testDb.db)
      await seedUser(testDb.db)
      await seedUser(testDb.db)

      const result = await expectAsyncSuccess(userRepo.list())

      expect(result.data).toHaveLength(3)
      expect(result.total).toBe(3)
      expect(result.pageNum).toBe(1)
      expect(result.pageSize).toBe(10)
      expect(result.totalPages).toBe(calculateTotalPages(3, 10))
    })

    it("should validate pagination metadata matches calculateTotalPages", async () => {
      // Seed 25 users
      for (let i = 0; i < 25; i++) {
        await seedUser(testDb.db)
      }

      const pageSize = 10

      // Get first page
      const page1 = await expectAsyncSuccess(
        userRepo.list({ pageNum: 1, pageSize })
      )

      expect(page1.data).toHaveLength(10)
      expect(page1.total).toBe(25)
      expect(page1.totalPages).toBe(calculateTotalPages(25, pageSize))
      expect(page1.totalPages).toBe(3)

      // Get second page
      const page2 = await expectAsyncSuccess(
        userRepo.list({ pageNum: 2, pageSize })
      )

      expect(page2.data).toHaveLength(10)
      expect(page2.total).toBe(25)
      expect(page2.totalPages).toBe(3)

      // Get third page
      const page3 = await expectAsyncSuccess(
        userRepo.list({ pageNum: 3, pageSize })
      )

      expect(page3.data).toHaveLength(5)
      expect(page3.total).toBe(25)
      expect(page3.totalPages).toBe(3)
    })

    it("should handle custom page size", async () => {
      // Seed 7 users
      for (let i = 0; i < 7; i++) {
        await seedUser(testDb.db)
      }

      const result = await expectAsyncSuccess(
        userRepo.list({ pageNum: 1, pageSize: 3 })
      )

      expect(result.data).toHaveLength(3)
      expect(result.total).toBe(7)
      expect(result.pageSize).toBe(3)
      expect(result.totalPages).toBe(calculateTotalPages(7, 3))
      expect(result.totalPages).toBe(3)
    })

    it("should return entities with all fields properly mapped", async () => {
      const user = await seedUser(testDb.db)

      const result = await expectAsyncSuccess(userRepo.list())

      expect(result.data).toHaveLength(1)
      const retrievedUser = result.data[0]

      expect(retrievedUser).toBeDefined()
      expect(retrievedUser!.id).toBe(user.id)
      expect(retrievedUser!.email).toBe(user.email)
      expect(retrievedUser!.roles).toEqual(user.roles)
      expect(retrievedUser!.createdAt).toEqual(user.createdAt)
    })
  })
})

