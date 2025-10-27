import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { setupSharedTestDatabase, cleanupSharedTestDatabase, clearTestDatabase } from "./test-database"
import { expectAsyncSuccess } from "../../utils/test.helpers"
import { withTestClock } from "../../domain/setup/test-clock"
import { createUserEntity } from "../../domain/factories/user.factory"
import { UserDrizzleRepository } from "@infra/repositories/user.repository"
import { container } from "tsyringe"
import { TOKENS } from "@infra/di/container"

describe("TestDatabase Setup", () => {
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

  it("should create a clean database with proper schema", async () => {
    // Test that we can create a user repository and perform basic operations
    const userRepo = container.resolve(TOKENS.USER_REPOSITORY) as UserDrizzleRepository
    
    // Create a user entity using the factory
    const user = createUserEntity({
      email: "test@example.com" as any,
      roles: ["USER"]
    })

    // Save the user to the database
    const savedUser = await expectAsyncSuccess(
      withTestClock(userRepo.save(user), Date.now())
    )

    expect(savedUser.id).toBe(user.id)
    expect(savedUser.email).toBe("test@example.com")
    expect(savedUser.roles).toEqual(["USER"])
  })

  it("should provide a clean database for each test", async () => {
    // This test verifies that each test gets a fresh database
    const userRepo = container.resolve(TOKENS.USER_REPOSITORY) as UserDrizzleRepository
    
    // Check that the database is empty
    const users = await expectAsyncSuccess(userRepo.list())
    expect(users.data).toHaveLength(0)
    expect(users.total).toBe(0)
  })
})
