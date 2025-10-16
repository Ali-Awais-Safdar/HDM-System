import { describe, it } from "vitest"
import { generateUser, createUserEntity, createAdminUserEntity } from "./user.factory"
import { TestPatterns } from "../../utils/test-patterns"

describe("User Factory - Constraints", () => {
  it("should satisfy user constraints", () => {
    TestPatterns.Factory.testFactoryConstraints(
      () => generateUser(),
      [
        { name: "id uuid", validator: (u) => typeof u.id === "string" && u.id.includes("-") },
        { name: "email format", validator: (u) => /@/.test(u.email) },
        { name: "has roles", validator: (u) => Array.isArray(u.roles) && u.roles.length > 0 },
      ],
      15
    )
  })

  it("should generate unique user ids", () => {
    TestPatterns.Factory.testFactoryUniqueness(
      () => generateUser(),
      (u) => u.id,
      20
    )
  })

  it("should create entity with expected roles", () => {
    const user = createUserEntity()
    const admin = createAdminUserEntity()
    TestPatterns.Factory.testFactoryConstraints(() => user, [ { name: "user role", validator: (u: any) => Array.isArray(u.roles) } ], 1)
    TestPatterns.Factory.testFactoryConstraints(() => admin, [ { name: "admin role", validator: (u: any) => Array.isArray(u.roles) && u.roles.includes("ADMIN") } ], 1)
  })
})


