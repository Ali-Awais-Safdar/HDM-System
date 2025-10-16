import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { AccessPolicyEntity } from "@domain/accessPolicy/access-policy.entity"
import { AccessPolicyValidationError } from "@domain/accessPolicy/access-policy.error"
import { BusinessRuleViolationError } from "@domain/utils/base.errors"
import { generateAccessPolicy, createUserPolicy, createRolePolicy, createAccessPolicyEntity } from "../factories/access-policy.factory"
import { TestPatterns } from "../../utils/test-patterns"
import { withTestClock } from "../setup/test-clock"
import { UserId, DocumentId } from "@domain/refined/ids"
import { computePermissionLevelSync, PermissionLevelOrder } from "@domain/accessPolicy/permission-set.vo"

describe("AccessPolicyEntity", () => {
  describe("Creation", () => {
    it("should create valid user policy from factory data", () => {
      const data = generateAccessPolicy({
        subjectType: "user",
        subjectId: "user-123",
        role: undefined,
        actions: ["read", "update"],
      })

      const policy = TestPatterns.Effect.expectSuccess(
        withTestClock(AccessPolicyEntity.create(data), Date.now())
      )

      expect(policy).toBeInstanceOf(AccessPolicyEntity)
      expect(policy.subjectType).toBe("user")
      expect(policy.isUserSpecificPolicy).toBe(true)
      expect(policy.isRoleBasedPolicy).toBe(false)
      expect(policy.actionCount).toBe(2)
    })

    it("should create valid role policy from factory data", () => {
      const data = generateAccessPolicy({
        subjectType: "role",
        subjectId: undefined,
        role: "USER",
        actions: ["read"],
      })

      const policy = TestPatterns.Effect.expectSuccess(
        withTestClock(AccessPolicyEntity.create(data), Date.now())
      )

      expect(policy).toBeInstanceOf(AccessPolicyEntity)
      expect(policy.subjectType).toBe("role")
      expect(policy.isUserSpecificPolicy).toBe(false)
      expect(policy.isRoleBasedPolicy).toBe(true)
      expect(policy.actionCount).toBe(1)
    })

    it("should handle minimal policy data", () => {
      const data = generateAccessPolicy({
        actions: ["read"],
      })

      const policy = TestPatterns.Effect.expectSuccess(
        withTestClock(AccessPolicyEntity.create(data), Date.now())
      )

      expect(policy.actionCount).toBe(1)
      expect(policy.permissionLevel).toBe("read")
    })
  })

  describe("Guard Violations", () => {
    it("should fail with no actions", () => {
      const data = generateAccessPolicy({
        actions: [],
      })

      const error = TestPatterns.Effect.expectFailure(
        withTestClock(AccessPolicyEntity.create(data), Date.now()),
        AccessPolicyValidationError
      )

      expect(error).toBeInstanceOf(AccessPolicyValidationError)
      expect(error.message).toContain("Policy must grant at least one action")
    })

    it("should fail with user policy without subjectId", () => {
      const data = generateAccessPolicy({
        subjectType: "user",
        subjectId: undefined,
        role: undefined,
        actions: ["read"],
      })

      const error = TestPatterns.Effect.expectFailure(
        withTestClock(AccessPolicyEntity.create(data), Date.now()),
        AccessPolicyValidationError
      )

      expect(error).toBeInstanceOf(AccessPolicyValidationError)
      expect(error.message).toContain("User-based policy requires subjectId")
    })

    it("should fail with role policy without role", () => {
      const data = generateAccessPolicy({
        subjectType: "role",
        subjectId: undefined,
        role: undefined,
        actions: ["read"],
      })

      const error = TestPatterns.Effect.expectFailure(
        withTestClock(AccessPolicyEntity.create(data), Date.now()),
        AccessPolicyValidationError
      )

      expect(error).toBeInstanceOf(AccessPolicyValidationError)
      expect(error.message).toContain("Role-based policy requires role")
    })
  })

  describe("Permission Level Computation", () => {
    it("should compute permission levels correctly", () => {
      const readPolicy = createAccessPolicyEntity({ actions: ["read"] })
      const writePolicy = createAccessPolicyEntity({ actions: ["read", "update"] })
      const adminPolicy = createAccessPolicyEntity({ actions: ["read", "update", "delete"] })
      const sharePolicy = createAccessPolicyEntity({ actions: ["share"] })

      expect(readPolicy.permissionLevel).toBe("read")
      expect(writePolicy.permissionLevel).toBe("write")
      expect(adminPolicy.permissionLevel).toBe("admin")
      expect(sharePolicy.permissionLevel).toBe("admin")
    })

    it("should compute permission levels for all action combinations", () => {
      // Test read-only actions
      const readOnlyPolicy = createAccessPolicyEntity({ actions: ["read"] })
      expect(readOnlyPolicy.permissionLevel).toBe("read")

      // Test write actions (update/download)
      const updatePolicy = createAccessPolicyEntity({ actions: ["read", "update"] })
      const downloadPolicy = createAccessPolicyEntity({ actions: ["read", "download"] })
      expect(updatePolicy.permissionLevel).toBe("write")
      expect(downloadPolicy.permissionLevel).toBe("write")

      // Test admin actions (delete/share)
      const deletePolicy = createAccessPolicyEntity({ actions: ["read", "update", "delete"] })
      const sharePolicy = createAccessPolicyEntity({ actions: ["read", "share"] })
      const fullAdminPolicy = createAccessPolicyEntity({ actions: ["read", "update", "delete", "share"] })
      expect(deletePolicy.permissionLevel).toBe("admin")
      expect(sharePolicy.permissionLevel).toBe("admin")
      expect(fullAdminPolicy.permissionLevel).toBe("admin")

      // Test single admin action
      const singleDeletePolicy = createAccessPolicyEntity({ actions: ["delete"] })
      const singleSharePolicy = createAccessPolicyEntity({ actions: ["share"] })
      expect(singleDeletePolicy.permissionLevel).toBe("admin")
      expect(singleSharePolicy.permissionLevel).toBe("admin")
    })

    it("should maintain permission level consistency after mutations", () => {
      const original = createAccessPolicyEntity({ actions: ["read"] })
      expect(original.permissionLevel).toBe("read")

      // Add write action - should become write level
      const withWrite = TestPatterns.Effect.expectSuccess(
        withTestClock(original.addActions(["update"]), Date.now())
      )
      expect(withWrite.permissionLevel).toBe("write")

      // Add admin action - should become admin level
      const withAdmin = TestPatterns.Effect.expectSuccess(
        withTestClock(withWrite.addActions(["delete"]), Date.now())
      )
      expect(withAdmin.permissionLevel).toBe("admin")

      // Remove admin action - should remain write level
      const withoutAdmin = TestPatterns.Effect.expectSuccess(
        withTestClock(withAdmin.removeActions(["delete"]), Date.now())
      )
      expect(withoutAdmin.permissionLevel).toBe("write")
    })
  })

  describe("Subject Application", () => {
    it("should check user policy application correctly", () => {
      const policy = createAccessPolicyEntity({
        subjectType: "user",
        subjectId: "user-123" as UserId,
        actions: ["read"],
      })

      expect(policy.appliesToSubject("user", "user-123" as UserId)).toBe(true)
      expect(policy.appliesToSubject("user", "user-456" as UserId)).toBe(false)
      expect(policy.appliesToSubject("role", undefined, "USER")).toBe(false)
    })

    it("should check role policy application correctly", () => {
      const policy = createAccessPolicyEntity({
        subjectType: "role",
        role: "USER",
        actions: ["read"],
      })

      expect(policy.appliesToSubject("role", undefined, "USER")).toBe(true)
      expect(policy.appliesToSubject("role", undefined, "ADMIN")).toBe(false)
      expect(policy.appliesToSubject("user", "user-123" as UserId)).toBe(false)
    })
  })

  describe("Resource Application", () => {
    it("should check resource application correctly", () => {
      const policy = createAccessPolicyEntity({
        resourceType: "document",
        resourceId: "doc-123" as DocumentId,
        actions: ["read"],
      })

      expect(policy.appliesToResource("document", "doc-123" as DocumentId)).toBe(true)
      expect(policy.appliesToResource("document", "doc-456" as DocumentId)).toBe(false)
      expect(policy.appliesToResource("file", "doc-123" as DocumentId)).toBe(false)
    })
  })

  describe("Action Mutations", () => {
    const LATER_TIME = 1704067260000

    describe("addActions", () => {
      it("should add actions successfully", () => {
        const original = createAccessPolicyEntity({
          actions: ["read"],
        })

        const updated = TestPatterns.Effect.expectSuccess(
          withTestClock(original.addActions(["update", "download"]), LATER_TIME)
        )

        expect(updated.actionCount).toBe(3)
        expect(updated.actions).toContain("read")
        expect(updated.actions).toContain("update")
        expect(updated.actions).toContain("download")
      })

      it("should deduplicate actions when adding", () => {
        const original = createAccessPolicyEntity({
          actions: ["read", "update"],
        })

        const updated = TestPatterns.Effect.expectSuccess(
          withTestClock(original.addActions(["read", "delete"]), LATER_TIME)
        )

        expect(updated.actionCount).toBe(3)
        expect(updated.actions).toContain("read")
        expect(updated.actions).toContain("update")
        expect(updated.actions).toContain("delete")
        // Ensure no duplicates
        const uniqueActions = new Set(updated.actions)
        expect(uniqueActions.size).toBe(updated.actions.length)
      })

      it("should handle adding duplicate actions gracefully", () => {
        const original = createAccessPolicyEntity({
          actions: ["read", "update", "delete"],
        })

        const updated = TestPatterns.Effect.expectSuccess(
          withTestClock(original.addActions(["read", "update", "share"]), LATER_TIME)
        )

        expect(updated.actionCount).toBe(4)
        expect(updated.actions).toEqual(["read", "update", "delete", "share"])
      })

      it("should no-op when adding empty actions", () => {
        const original = createAccessPolicyEntity({
          actions: ["read"],
        })

        const updated = TestPatterns.Effect.expectSuccess(
          withTestClock(original.addActions([]), LATER_TIME)
        )

        expect(updated.actionCount).toBe(1)
        expect(updated.actions).toEqual(original.actions)
        expect(updated.id).toBe(original.id) // Same entity
      })

      it("should maintain entity identity and update timestamp", () => {
        const original = createAccessPolicyEntity({
          actions: ["read"],
        })

        const updated = TestPatterns.Effect.expectSuccess(
          withTestClock(original.addActions(["update"]), LATER_TIME)
        )

        expect(updated.id).toBe(original.id)
        expect(updated.createdAt.getTime()).toBe(original.createdAt.getTime())
        expect(updated.updatedAt).toBeDefined()
        const updatedAt = TestPatterns.Option.expectSome(updated.updatedAt)
        expect(updatedAt.getTime()).toBe(LATER_TIME)
      })

      it("should handle adding all action types", () => {
        const original = createAccessPolicyEntity({
          actions: [],
        })

        const allActions = ["read", "update", "delete", "download", "share"] as const
        const updated = TestPatterns.Effect.expectSuccess(
          withTestClock(original.addActions([...allActions]), LATER_TIME)
        )

        expect(updated.actionCount).toBe(5)
        allActions.forEach(action => {
          expect(updated.actions).toContain(action)
        })
      })
    })

    describe("removeActions", () => {
      it("should remove actions successfully", () => {
        const original = createAccessPolicyEntity({
          actions: ["read", "update", "delete"],
        })

        const updated = TestPatterns.Effect.expectSuccess(
          withTestClock(original.removeActions(["update"]), LATER_TIME)
        )

        expect(updated.actionCount).toBe(2)
        expect(updated.actions).toContain("read")
        expect(updated.actions).toContain("delete")
        expect(updated.actions).not.toContain("update")
      })

      it("should remove multiple actions at once", () => {
        const original = createAccessPolicyEntity({
          actions: ["read", "update", "delete", "download", "share"],
        })

        const updated = TestPatterns.Effect.expectSuccess(
          withTestClock(original.removeActions(["update", "download"]), LATER_TIME)
        )

        expect(updated.actionCount).toBe(3)
        expect(updated.actions).toContain("read")
        expect(updated.actions).toContain("delete")
        expect(updated.actions).toContain("share")
        expect(updated.actions).not.toContain("update")
        expect(updated.actions).not.toContain("download")
      })

      it("should handle removing non-existent actions gracefully", () => {
        const original = createAccessPolicyEntity({
          actions: ["read", "update"],
        })

        const updated = TestPatterns.Effect.expectSuccess(
          withTestClock(original.removeActions(["delete", "share"]), LATER_TIME)
        )

        expect(updated.actionCount).toBe(2)
        expect(updated.actions).toEqual(original.actions)
      })

      it("should no-op when removing empty actions", () => {
        const original = createAccessPolicyEntity({
          actions: ["read"],
        })

        const updated = TestPatterns.Effect.expectSuccess(
          withTestClock(original.removeActions([]), LATER_TIME)
        )

        expect(updated.actionCount).toBe(1)
        expect(updated.actions).toEqual(original.actions)
        expect(updated.id).toBe(original.id) // Same entity
      })

      it("should fail when removing all actions", () => {
        const original = createAccessPolicyEntity({
          actions: ["read"],
        })

        const error = TestPatterns.Effect.expectFailure(
          withTestClock(original.removeActions(["read"]), LATER_TIME) as any,
          BusinessRuleViolationError
        )

        expect(error).toBeInstanceOf(BusinessRuleViolationError)
        expect((error as BusinessRuleViolationError).details?.rule).toBe("INVALID_POLICY_STATE")
        expect((error as BusinessRuleViolationError).message).toContain("Policy must grant at least one action")
      })

      it("should fail when removing all actions from multi-action policy", () => {
        const original = createAccessPolicyEntity({
          actions: ["read", "update", "delete"],
        })

        const error = TestPatterns.Effect.expectFailure(
          withTestClock(original.removeActions(["read", "update", "delete"]), LATER_TIME) as any,
          BusinessRuleViolationError
        )

        expect(error).toBeInstanceOf(BusinessRuleViolationError)
        expect((error as BusinessRuleViolationError).details?.rule).toBe("INVALID_POLICY_STATE")
      })

      it("should maintain entity identity and update timestamp", () => {
        const original = createAccessPolicyEntity({
          actions: ["read", "update", "delete"],
        })

        const updated = TestPatterns.Effect.expectSuccess(
          withTestClock(original.removeActions(["delete"]), LATER_TIME)
        )

        expect(updated.id).toBe(original.id)
        expect(updated.createdAt.getTime()).toBe(original.createdAt.getTime())
        expect(updated.updatedAt).toBeDefined()
        const updatedAt = TestPatterns.Option.expectSome(updated.updatedAt)
        expect(updatedAt.getTime()).toBe(LATER_TIME)
      })
    })

    describe("Complex Mutation Scenarios", () => {
      it("should handle chained add and remove operations", () => {
        const original = createAccessPolicyEntity({
          actions: ["read"],
        })

        // Add multiple actions
        const withAdditions = TestPatterns.Effect.expectSuccess(
          withTestClock(original.addActions(["update", "download"]), LATER_TIME)
        )
        expect(withAdditions.actionCount).toBe(3)

        // Remove some actions
        const withRemovals = TestPatterns.Effect.expectSuccess(
          withTestClock(withAdditions.removeActions(["download"]), LATER_TIME + 1000)
        )
        expect(withRemovals.actionCount).toBe(2)
        expect(withRemovals.actions).toContain("read")
        expect(withRemovals.actions).toContain("update")
        expect(withRemovals.actions).not.toContain("download")
      })

      it("should handle adding and removing same actions", () => {
        const original = createAccessPolicyEntity({
          actions: ["read"],
        })

        // Add actions
        const withAdditions = TestPatterns.Effect.expectSuccess(
          withTestClock(original.addActions(["update", "delete"]), LATER_TIME)
        )
        expect(withAdditions.actionCount).toBe(3)

        // Remove the same actions
        const withRemovals = TestPatterns.Effect.expectSuccess(
          withTestClock(withAdditions.removeActions(["update", "delete"]), LATER_TIME + 1000)
        )
        expect(withRemovals.actionCount).toBe(1)
        expect(withRemovals.actions).toEqual(["read"])
      })

      it("should maintain action order consistency", () => {
        const original = createAccessPolicyEntity({
          actions: ["read", "update"],
        })

        const updated = TestPatterns.Effect.expectSuccess(
          withTestClock(original.addActions(["delete", "share"]), LATER_TIME)
        )

        // Actions should be in a consistent order (implementation dependent)
        expect(updated.actions).toHaveLength(4)
        expect(updated.actions).toContain("read")
        expect(updated.actions).toContain("update")
        expect(updated.actions).toContain("delete")
        expect(updated.actions).toContain("share")
      })
    })
  })

  describe("Factory Helpers", () => {
    it("should create user policy with createUserPolicy", () => {
      const policyData = createUserPolicy("doc-123" as DocumentId, "user-456" as UserId, ["read", "update"])
      const policy = TestPatterns.Effect.expectSuccess(
        withTestClock(AccessPolicyEntity.create(policyData), Date.now())
      )

      expect(policy.subjectType).toBe("user")
      expect(policy.resourceId).toBe("doc-123")
      expect(policy.appliesToSubject("user", "user-456" as UserId)).toBe(true)
      expect(policy.actions).toContain("read")
      expect(policy.actions).toContain("update")
    })

    it("should create role policy with createRolePolicy", () => {
      const policyData = createRolePolicy("doc-123" as DocumentId, "USER", ["read"])
      const policy = TestPatterns.Effect.expectSuccess(
        withTestClock(AccessPolicyEntity.create(policyData), Date.now())
      )

      expect(policy.subjectType).toBe("role")
      expect(policy.resourceId).toBe("doc-123")
      expect(policy.appliesToSubject("role", undefined, "USER")).toBe(true)
      expect(policy.actions).toContain("read")
    })
  })

  describe("Serialization", () => {
    it("should maintain data through serialization round-trip", () => {
      const original = createAccessPolicyEntity({
        subjectType: "user",
        subjectId: "user-789" as UserId,
        actions: ["read", "update", "delete"],
      })

      // Serialize
      const serialized = TestPatterns.Effect.expectSuccess(original.serialized())

      // Deserialize
      const recreated = TestPatterns.Effect.expectSuccess(
        withTestClock(AccessPolicyEntity.create(serialized), Date.now())
      )

      // Assert key field equality
      expect(recreated.id).toBe(original.id)
      expect(recreated.resourceType).toBe(original.resourceType)
      expect(recreated.resourceId).toBe(original.resourceId)
      expect(recreated.subjectType).toBe(original.subjectType)
      expect(recreated.actions).toEqual(original.actions)
      expect(recreated.createdAt.getTime()).toBe(original.createdAt.getTime())
    })
  })

  describe("Property Tests", () => {
    it("should maintain permission level monotonicity", () => {
      const actionSets: readonly ("read" | "update" | "delete" | "download" | "share")[][] = [
        ["read"],
        ["read", "update"],
        ["read", "download"],
        ["read", "update", "delete"],
        ["read", "share"],
        ["read", "update", "delete", "share"],
        ["delete"],
        ["share"],
        ["update", "download"],
        ["read", "update", "download", "delete", "share"]
      ]

      actionSets.forEach(actions => {
        const policy = createAccessPolicyEntity({ actions })
        const level = policy.permissionLevel
        
        // Verify permission level is consistent with action set
        if (actions.includes("delete") || actions.includes("share")) {
          expect(level).toBe("admin")
        } else if (actions.includes("update") || actions.includes("download")) {
          expect(level).toBe("write")
        } else if (actions.includes("read")) {
          expect(level).toBe("read")
        }
      })
    })

    it("should maintain action deduplication invariants", () => {
      const originalActions: readonly ("read" | "update" | "delete" | "download" | "share")[] = ["read", "update", "delete"]
      const original = createAccessPolicyEntity({ actions: originalActions })

      // Test adding duplicate actions
      const withDuplicates = TestPatterns.Effect.expectSuccess(
        withTestClock(original.addActions(["read", "update", "share"]), Date.now())
      )

      // Should have no duplicates
      const uniqueActions = new Set(withDuplicates.actions)
      expect(uniqueActions.size).toBe(withDuplicates.actions.length)
      
      // Should contain all original actions plus new ones
      originalActions.forEach(action => {
        expect(withDuplicates.actions).toContain(action)
      })
      expect(withDuplicates.actions).toContain("share")
    })

    it("should maintain action count consistency", () => {
      const original = createAccessPolicyEntity({ actions: ["read"] })
      
      // Add actions and verify count
      const withAdditions = TestPatterns.Effect.expectSuccess(
        withTestClock(original.addActions(["update", "delete"]), Date.now())
      )
      expect(withAdditions.actionCount).toBe(3)
      expect(withAdditions.actions).toHaveLength(3)

      // Remove actions and verify count
      const withRemovals = TestPatterns.Effect.expectSuccess(
        withTestClock(withAdditions.removeActions(["delete"]), Date.now())
      )
      expect(withRemovals.actionCount).toBe(2)
      expect(withRemovals.actions).toHaveLength(2)
    })

    it("should maintain entity identity through mutations", () => {
      const original = createAccessPolicyEntity({ actions: ["read"] })
      
      const withAdditions = TestPatterns.Effect.expectSuccess(
        withTestClock(original.addActions(["update"]), Date.now())
      )
      
      const withRemovals = TestPatterns.Effect.expectSuccess(
        withTestClock(withAdditions.removeActions(["update"]), Date.now())
      )

      // All entities should have the same ID
      expect(original.id).toBe(withAdditions.id)
      expect(original.id).toBe(withRemovals.id)
      
      // CreatedAt should remain unchanged
      expect(original.createdAt.getTime()).toBe(withAdditions.createdAt.getTime())
      expect(original.createdAt.getTime()).toBe(withRemovals.createdAt.getTime())
    })

    it("should maintain timestamp progression through mutations", () => {
      const baseTime = 1704067200000
      const laterTime = baseTime + 1000
      const evenLaterTime = baseTime + 2000

      const original = createAccessPolicyEntity({ actions: ["read"] })
      
      const withAdditions = TestPatterns.Effect.expectSuccess(
        withTestClock(original.addActions(["update"]), laterTime)
      )
      
      const withRemovals = TestPatterns.Effect.expectSuccess(
        withTestClock(withAdditions.removeActions(["update"]), evenLaterTime)
      )

      // Timestamps should progress correctly
      expect(original.updatedAt).toBeUndefined()
      const additionsUpdatedAt = TestPatterns.Option.expectSome(withAdditions.updatedAt)
      expect(additionsUpdatedAt.getTime()).toBe(laterTime)
      const removalsUpdatedAt = TestPatterns.Option.expectSome(withRemovals.updatedAt)
      expect(removalsUpdatedAt.getTime()).toBe(evenLaterTime)
    })

    it("should maintain permission level monotonicity for action supersets", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.constantFrom("read", "update", "delete", "download", "share"),
            { minLength: 1, maxLength: 5 }
          ),
          fc.array(
            fc.constantFrom("read", "update", "delete", "download", "share"),
            { minLength: 0, maxLength: 3 }
          ),
          (baseActions, additionalActions) => {
            // Type assertion to ensure proper typing
            const typedBaseActions = baseActions as readonly ("read" | "update" | "delete" | "download" | "share")[]
            const typedAdditionalActions = additionalActions as readonly ("read" | "update" | "delete" | "download" | "share")[]
            
            // Create base permission set
            const basePermissionSet = { actions: typedBaseActions }
            const baseLevel = computePermissionLevelSync(basePermissionSet)
            
            // Create superset by adding additional actions (with deduplication)
            const supersetActions = Array.from(new Set([...typedBaseActions, ...typedAdditionalActions]))
            const supersetPermissionSet = { actions: supersetActions }
            const supersetLevel = computePermissionLevelSync(supersetPermissionSet)
            
            // Verify monotonicity: superset level should be >= base level
            const baseLevelOrder = PermissionLevelOrder[baseLevel]
            const supersetLevelOrder = PermissionLevelOrder[supersetLevel]
            
            expect(supersetLevelOrder).toBeGreaterThanOrEqual(baseLevelOrder)
            
            // Additional invariant: if we add admin actions (delete/share), level should be admin
            const hasAdminActions = typedAdditionalActions.some(action => action === "delete" || action === "share")
            if (hasAdminActions) {
              expect(supersetLevel).toBe("admin")
            }
            
            // Additional invariant: if we add write actions (update/download) and no admin actions, level should be write
            const hasWriteActions = typedAdditionalActions.some(action => action === "update" || action === "download")
            const hasNoAdminActions = !typedAdditionalActions.some(action => action === "delete" || action === "share")
            if (hasWriteActions && hasNoAdminActions && baseLevel !== "admin") {
              expect(supersetLevel).toBe("write")
            }
          }
        ),
        { numRuns: 1000 }
      )
    })

    it("should maintain permission level monotonicity for specific action hierarchies", () => {
      // Test specific known hierarchies to ensure the property holds
      const testCases = [
        {
          base: ["read"],
          additions: ["update"],
          expectedUpgrade: true
        },
        {
          base: ["read"],
          additions: ["download"],
          expectedUpgrade: true
        },
        {
          base: ["read", "update"],
          additions: ["delete"],
          expectedUpgrade: true
        },
        {
          base: ["read", "update"],
          additions: ["share"],
          expectedUpgrade: true
        },
        {
          base: ["read", "update", "delete"],
          additions: ["download", "share"],
          expectedUpgrade: false // Already admin
        },
        {
          base: ["update"],
          additions: ["read"],
          expectedUpgrade: false // update is write, read is read
        },
        {
          base: ["delete"],
          additions: ["read", "update"],
          expectedUpgrade: false // Already admin
        }
      ]

      testCases.forEach(({ base, additions, expectedUpgrade }) => {
        const typedBase = base as readonly ("read" | "update" | "delete" | "download" | "share")[]
        const typedAdditions = additions as readonly ("read" | "update" | "delete" | "download" | "share")[]
        
        const baseLevel = computePermissionLevelSync({ actions: typedBase })
        const supersetActions = Array.from(new Set([...typedBase, ...typedAdditions]))
        const supersetLevel = computePermissionLevelSync({ actions: supersetActions })
        
        const baseLevelOrder = PermissionLevelOrder[baseLevel]
        const supersetLevelOrder = PermissionLevelOrder[supersetLevel]
        
        // Always verify monotonicity
        expect(supersetLevelOrder).toBeGreaterThanOrEqual(baseLevelOrder)
        
        // Verify expected upgrade behavior
        if (expectedUpgrade) {
          expect(supersetLevelOrder).toBeGreaterThan(baseLevelOrder)
        } else {
          expect(supersetLevelOrder).toBe(baseLevelOrder)
        }
      })
    })

    it("should maintain permission level consistency with entity permissionLevel getter", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.constantFrom("read", "update", "delete", "download", "share"),
            { minLength: 1, maxLength: 5 }
          ),
          (actions) => {
            // Type assertion to ensure proper typing
            const typedActions = actions as readonly ("read" | "update" | "delete" | "download" | "share")[]
            
            // Create entity and get permission level
            const policy = createAccessPolicyEntity({ actions: typedActions })
            const entityLevel = policy.permissionLevel
            
            // Compute permission level directly
            const computedLevel = computePermissionLevelSync({ actions: typedActions })
            
            // They should be identical
            expect(entityLevel).toBe(computedLevel)
            expect(PermissionLevelOrder[entityLevel]).toBe(PermissionLevelOrder[computedLevel])
          }
        ),
        { numRuns: 500 }
      )
    })
  })
})
