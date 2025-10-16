import { describe, it } from "vitest"
import { generateAccessPolicy, createUserPolicy, createRolePolicy } from "./access-policy.factory"
import { TestPatterns } from "../../utils/test-patterns"

describe("AccessPolicy Factory - Constraints", () => {
  it("should satisfy policy constraints", () => {
    TestPatterns.Factory.testFactoryConstraints(
      () => generateAccessPolicy(),
      [
        { name: "id uuid", validator: (p) => typeof p.id === "string" && p.id.includes("-") },
        { name: "resourceType document", validator: (p) => p.resourceType === "document" },
        { name: "has actions", validator: (p) => Array.isArray(p.actions) && p.actions.length > 0 },
      ],
      15
    )
  })

  it("should generate unique policy ids", () => {
    TestPatterns.Factory.testFactoryUniqueness(
      () => generateAccessPolicy(),
      (p) => p.id,
      20
    )
  })

  it("should produce valid user/role policy scenarios", () => {
    const resourceId = crypto.randomUUID()
    const userId = crypto.randomUUID()
    const userPolicy = createUserPolicy(resourceId, userId)
    const rolePolicy = createRolePolicy(resourceId, "USER")
    TestPatterns.Factory.testFactoryConstraints(
      () => userPolicy,
      [ { name: "user policy", validator: (p) => p.subjectType === "user" && typeof p.subjectId === "string" } ],
      1
    )
    TestPatterns.Factory.testFactoryConstraints(
      () => rolePolicy,
      [ { name: "role policy", validator: (p) => p.subjectType === "role" && p.role === "USER" } ],
      1
    )
  })
})


