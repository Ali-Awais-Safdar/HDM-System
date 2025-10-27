import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { workflowTestLifecycle } from "../setup/test-harness"
import type { WorkflowTestHarness } from "../setup/test-harness"
import { seedTestActors } from "../fixtures/actors"
import { seedDocumentWithOwnerAndVersion } from "../../infra/setup/seed-helpers"
import { expectAsyncSuccess, expectSome } from "../../utils/test.helpers"
import { withTestClock } from "../../domain/setup/test-clock"
import { Option } from "effect"

describe("AccessPolicyWorkflow", () => {
  let harness: WorkflowTestHarness
  let actors: Awaited<ReturnType<typeof seedTestActors>>

  beforeAll(async () => {
    harness = await workflowTestLifecycle.beforeAll()
    actors = await seedTestActors(harness.db)
  })

  afterAll(async () => {
    await workflowTestLifecycle.afterAll(harness)
  })

  beforeEach(async () => {
    await workflowTestLifecycle.beforeEach(harness)
    actors = await seedTestActors(harness.db)
  })

  describe("addPolicy - Policy Creation", () => {
    it("should create user policy and persist to repository", async () => {
      // Seed document with admin actor as owner
      const { document } = await seedDocumentWithOwnerAndVersion(harness.db)

      // Create a policy command for collaborator with read permissions
      const addPolicyCommand = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId, // Owner is admin by default
        resourceType: "document" as const,
        resourceId: document.id,
        subjectType: "user" as const,
        subjectId: actors.collaborator.id,
        role: undefined,
        actions: ["read"] as const,
        effect: "allow" as const
      }

      const response = await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.addPolicy(addPolicyCommand),
          Date.now()
        )
      )

      // Assert serialized response fields
      expect(response.id).toBeDefined()
      expect(response.resourceType).toBe("document")
      expect(response.resourceId).toBe(document.id)
      expect(response.subjectType).toBe("user")
      expect(response.subjectId).toBe(actors.collaborator.id)
      expect(response.role).toBeUndefined()
      expect(response.actions).toEqual(["read"])
      expect(response.effect).toBe("allow")
      expect(response.createdAt).toBeDefined()
      expect(response.updatedAt).toBeUndefined()

      // Verify repository state matches
      const foundOption = await expectAsyncSuccess(
        harness.accessPolicyRepository.findById(response.id as any)
      )
      const found = expectSome(foundOption)

      expect(found.id).toBe(response.id)
      expect(found.resourceId).toBe(document.id)
      expect(Option.getOrNull(found.subjectId)).toBe(actors.collaborator.id)
      expect(found.actions).toEqual(["read"])
      expect(found.effect).toBe("allow")
    })

    it("should create role-based policy when role is specified", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(harness.db)

      const addPolicyCommand = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId,
        resourceType: "document" as const,
        resourceId: document.id,
        subjectType: "role" as const,
        subjectId: undefined,
        role: "USER" as const,
        actions: ["read"] as const,
        effect: "allow" as const
      }

      const response = await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.addPolicy(addPolicyCommand),
          Date.now()
        )
      )

      expect(response.subjectType).toBe("role")
      expect(response.subjectId).toBeUndefined()
      expect(response.role).toBe("USER")

      // Verify in repository
      const foundOption = await expectAsyncSuccess(
        harness.accessPolicyRepository.findById(response.id as any)
      )
      const found = expectSome(foundOption)
      
      expect(Option.getOrNull(found.role)).toBe("USER")
      expect(found.isRoleBasedPolicy).toBe(true)
    })

    it("should create policy with multiple actions", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(harness.db)

      const addPolicyCommand = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId,
        resourceType: "document" as const,
        resourceId: document.id,
        subjectType: "user" as const,
        subjectId: actors.collaborator.id,
        role: undefined,
        actions: ["read", "update", "delete"] as const,
        effect: "allow" as const
      }

      const response = await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.addPolicy(addPolicyCommand),
          Date.now()
        )
      )

      expect(response.actions).toEqual(["read", "update", "delete"])
      
      // Verify repository state
      const foundOption = await expectAsyncSuccess(
        harness.accessPolicyRepository.findById(response.id as any)
      )
      const found = expectSome(foundOption)
      expect(found.actions).toEqual(["read", "update", "delete"])
      expect(found.permissionLevel).toBe("admin") // delete makes it admin level
    })

    it("should fail when actor is not admin", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(harness.db)

      const addPolicyCommand = {
        workspaceId: document.workspaceId,
        actorId: actors.collaborator.id, // Non-admin actor
        resourceType: "document" as const,
        resourceId: document.id,
        subjectType: "user" as const,
        subjectId: actors.admin.id,
        role: undefined,
        actions: ["read"] as const,
        effect: "allow" as const
      }

      // Should fail with permission error
      try {
        await expectAsyncSuccess(
          harness.accessPolicyWorkflow.addPolicy(addPolicyCommand)
        )
        throw new Error("Expected permission error but got success")
      } catch (error) {
        expect(error).toBeDefined()
        // Error should be about permission denial
      }
    })
  })

  describe("updatePolicyActions - Permission Escalation", () => {
    it("should escalate permissions from read to write level", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(harness.db)

      // Create initial read-only policy
      const addPolicyCommand = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId,
        resourceType: "document" as const,
        resourceId: document.id,
        subjectType: "user" as const,
        subjectId: actors.collaborator.id,
        role: undefined,
        actions: ["read"] as const,
        effect: "allow" as const
      }

      const created = await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.addPolicy(addPolicyCommand),
          Date.now()
        )
      )

      // Verify initial permission level is read
      const initialPolicy = expectSome(
        await expectAsyncSuccess(
          harness.accessPolicyRepository.findById(created.id as any)
        )
      )
      expect(initialPolicy.permissionLevel).toBe("read")

      // Update to add write permission
      const updateCommand = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId,
        policyId: created.id,
        actions: ["read", "update"] as const
      }

      const updated = await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.updatePolicyActions(updateCommand),
          Date.now() + 1000
        )
      )

      expect(updated.actions).toEqual(["read", "update"])

      // Confirm monotonic permission level via entity accessor
      const updatedPolicy = expectSome(
        await expectAsyncSuccess(
          harness.accessPolicyRepository.findById(created.id as any)
        )
      )
      expect(updatedPolicy.permissionLevel).toBe("write")
      expect(updatedPolicy.updatedAt).toBeDefined()
    })

    it("should escalate permissions from write to admin level", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(harness.db)

      // Create initial write policy
      const addPolicyCommand = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId,
        resourceType: "document" as const,
        resourceId: document.id,
        subjectType: "user" as const,
        subjectId: actors.collaborator.id,
        role: undefined,
        actions: ["read", "update"] as const,
        effect: "allow" as const
      }

      const created = await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.addPolicy(addPolicyCommand),
          Date.now()
        )
      )

      // Verify initial permission level is write
      const initialPolicy = expectSome(
        await expectAsyncSuccess(
          harness.accessPolicyRepository.findById(created.id as any)
        )
      )
      expect(initialPolicy.permissionLevel).toBe("write")

      // Update to add admin permissions (delete or share)
      const updateCommand = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId,
        policyId: created.id,
        actions: ["read", "update", "delete", "share"] as const
      }

      const updated = await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.updatePolicyActions(updateCommand),
          Date.now() + 1000
        )
      )

      expect(updated.actions).toEqual(["read", "update", "delete", "share"])

      // Confirm monotonic permission level escalation
      const updatedPolicy = expectSome(
        await expectAsyncSuccess(
          harness.accessPolicyRepository.findById(created.id as any)
        )
      )
      expect(updatedPolicy.permissionLevel).toBe("admin")
    })

    it("should maintain permission level monotonicity when removing non-critical actions", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(harness.db)

      // Create admin policy
      const addPolicyCommand = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId,
        resourceType: "document" as const,
        resourceId: document.id,
        subjectType: "user" as const,
        subjectId: actors.collaborator.id,
        role: undefined,
        actions: ["read", "update", "delete", "share"] as const,
        effect: "allow" as const
      }

      const created = await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.addPolicy(addPolicyCommand),
          Date.now()
        )
      )

      // Remove some actions but keep admin level (delete/share)
      const updateCommand = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId,
        policyId: created.id,
        actions: ["read", "delete"] as const
      }

      const updated = await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.updatePolicyActions(updateCommand),
          Date.now() + 1000
        )
      )

      expect(updated.actions).toEqual(["read", "delete"])

      // Should still be admin level
      const updatedPolicy = expectSome(
        await expectAsyncSuccess(
          harness.accessPolicyRepository.findById(created.id as any)
        )
      )
      expect(updatedPolicy.permissionLevel).toBe("admin")
    })

    it("should fail when actor is not admin", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(harness.db)

      // Create a policy
      const addPolicyCommand = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId,
        resourceType: "document" as const,
        resourceId: document.id,
        subjectType: "user" as const,
        subjectId: actors.collaborator.id,
        role: undefined,
        actions: ["read"] as const,
        effect: "allow" as const
      }

      const created = await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.addPolicy(addPolicyCommand),
          Date.now()
        )
      )

      // Try to update as non-admin
      const updateCommand = {
        workspaceId: document.workspaceId,
        actorId: actors.collaborator.id, // Not admin
        policyId: created.id,
        actions: ["read", "update"] as const
      }

      try {
        await expectAsyncSuccess(
          harness.accessPolicyWorkflow.updatePolicyActions(updateCommand)
        )
        throw new Error("Expected permission error but got success")
      } catch (error) {
        expect(error).toBeDefined()
      }
    })
  })

  describe("removePolicy - Policy Deletion", () => {
    it("should delete policy and return true", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(harness.db)

      // Create a policy
      const addPolicyCommand = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId,
        resourceType: "document" as const,
        resourceId: document.id,
        subjectType: "user" as const,
        subjectId: actors.collaborator.id,
        role: undefined,
        actions: ["read"] as const,
        effect: "allow" as const
      }

      const created = await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.addPolicy(addPolicyCommand),
          Date.now()
        )
      )

      // Verify policy exists
      const existsBefore = await expectAsyncSuccess(
        harness.accessPolicyRepository.exists(created.id as any)
      )
      expect(existsBefore).toBe(true)

      // Remove the policy
      const removeCommand = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId,
        policyId: created.id
      }

      const result = await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.removePolicy(removeCommand),
          Date.now() + 1000
        )
      )

      expect(result).toBe(true)

      // Verify policy no longer exists
      const existsAfter = await expectAsyncSuccess(
        harness.accessPolicyRepository.exists(created.id as any)
      )
      expect(existsAfter).toBe(false)
    })

    it("should fail when non-admin attempts to remove policy", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(harness.db)

      // Create a policy as admin
      const addPolicyCommand = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId,
        resourceType: "document" as const,
        resourceId: document.id,
        subjectType: "user" as const,
        subjectId: actors.admin.id,
        role: undefined,
        actions: ["read"] as const,
        effect: "allow" as const
      }

      const created = await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.addPolicy(addPolicyCommand),
          Date.now()
        )
      )

      // Attempt removal by non-admin to trigger PermissionCheckError
      const removeCommand = {
        workspaceId: document.workspaceId,
        actorId: actors.collaborator.id, // Non-admin
        policyId: created.id
      }

      try {
        await expectAsyncSuccess(
          harness.accessPolicyWorkflow.removePolicy(removeCommand)
        )
        throw new Error("Expected PermissionCheckError but got success")
      } catch (error) {
        expect(error).toBeDefined()
        // Should be a permission check error
      }

      // Verify policy still exists
      const existsAfter = await expectAsyncSuccess(
        harness.accessPolicyRepository.exists(created.id as any)
      )
      expect(existsAfter).toBe(true)
    })

    it("should allow removal by document owner", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(harness.db)

      // Create a policy
      const addPolicyCommand = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId,
        resourceType: "document" as const,
        resourceId: document.id,
        subjectType: "user" as const,
        subjectId: actors.collaborator.id,
        role: undefined,
        actions: ["read"] as const,
        effect: "allow" as const
      }

      const created = await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.addPolicy(addPolicyCommand),
          Date.now()
        )
      )

      // Remove as owner
      const removeCommand = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId, // Owner has admin rights
        policyId: created.id
      }

      const result = await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.removePolicy(removeCommand),
          Date.now() + 1000
        )
      )

      expect(result).toBe(true)
    })
  })

  describe("Policy Filtering - Actor-scoped Policies", () => {
    it("should return actor-scoped policies with Option-to-undefined serialization", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(harness.db)

      // Create user-specific policy
      const userPolicyCommand = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId,
        resourceType: "document" as const,
        resourceId: document.id,
        subjectType: "user" as const,
        subjectId: actors.collaborator.id,
        role: undefined,
        actions: ["read"] as const,
        effect: "allow" as const
      }

      const userPolicy = await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.addPolicy(userPolicyCommand),
          Date.now()
        )
      )

      // Create role-based policy
      const rolePolicyCommand = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId,
        resourceType: "document" as const,
        resourceId: document.id,
        subjectType: "role" as const,
        subjectId: undefined,
        role: "USER" as const,
        actions: ["read", "update"] as const,
        effect: "allow" as const
      }

      const rolePolicy = await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.addPolicy(rolePolicyCommand),
          Date.now() + 1000
        )
      )

      // Get policies for the actor (collaborator has USER role)
      const actorPolicies = await expectAsyncSuccess(
        harness.accessPolicyWorkflow.getPoliciesForActor(
          document.id,
          actors.collaborator
        )
      )

      // Should include both user-specific and role-based policies
      expect(actorPolicies.length).toBeGreaterThanOrEqual(2)

      // Verify Option-to-undefined serialization
      const userPolicyEntity = actorPolicies.find(p => p.id === userPolicy.id)
      expect(userPolicyEntity).toBeDefined()
      if (userPolicyEntity) {
        expect(Option.getOrNull(userPolicyEntity.subjectId)).toBe(actors.collaborator.id)
        // role should be None for user-specific policy
        expect(Option.isNone(userPolicyEntity.role)).toBe(true)
      }

      const rolePolicyEntity = actorPolicies.find(p => p.id === rolePolicy.id)
      expect(rolePolicyEntity).toBeDefined()
      if (rolePolicyEntity) {
        expect(Option.getOrNull(rolePolicyEntity.role)).toBe("USER")
        // subjectId should be None for role-based policy
        expect(Option.isNone(rolePolicyEntity.subjectId)).toBe(true)
      }
    })

    it("should filter out policies not applicable to actor", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(harness.db)

      // Create policy for a different user
      const otherUserPolicyCommand = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId,
        resourceType: "document" as const,
        resourceId: document.id,
        subjectType: "user" as const,
        subjectId: actors.admin.id,
        role: undefined,
        actions: ["read", "update"] as const,
        effect: "allow" as const
      }

      await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.addPolicy(otherUserPolicyCommand),
          Date.now()
        )
      )

      // Create policy for ADMIN role (collaborator doesn't have this role)
      const adminRolePolicyCommand = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId,
        resourceType: "document" as const,
        resourceId: document.id,
        subjectType: "role" as const,
        subjectId: undefined,
        role: "ADMIN" as const,
        actions: ["read", "update", "delete"] as const,
        effect: "allow" as const
      }

      await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.addPolicy(adminRolePolicyCommand),
          Date.now() + 1000
        )
      )

      // Get policies for collaborator
      const collaboratorPolicies = await expectAsyncSuccess(
        harness.accessPolicyWorkflow.getPoliciesForActor(
          document.id,
          actors.collaborator
        )
      )

      // Should not include policies for other users or roles the actor doesn't have
      const hasAdminUserPolicy = collaboratorPolicies.some(
        p => Option.getOrNull(p.subjectId) === actors.admin.id
      )
      const hasAdminRolePolicy = collaboratorPolicies.some(
        p => Option.getOrNull(p.role) === "ADMIN"
      )

      expect(hasAdminUserPolicy).toBe(false)
      expect(hasAdminRolePolicy).toBe(false)
    })

    it("should return empty array when actor has no policies", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(harness.db)

      // Don't create any policies for the document

      // Get policies for collaborator
      const policies = await expectAsyncSuccess(
        harness.accessPolicyWorkflow.getPoliciesForActor(
          document.id,
          actors.collaborator
        )
      )

      expect(policies).toHaveLength(0)
    })

    it("should verify Option-to-undefined conversion in responses", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(harness.db)

      // Create user-specific policy and verify serialized response
      const userPolicyCommand = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId,
        resourceType: "document" as const,
        resourceId: document.id,
        subjectType: "user" as const,
        subjectId: actors.collaborator.id,
        role: undefined, // undefined in command
        actions: ["read"] as const,
        effect: "allow" as const
      }

      const userPolicyResponse = await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.addPolicy(userPolicyCommand),
          Date.now()
        )
      )

      // Verify role is undefined (not null) in response
      expect(userPolicyResponse.role).toBeUndefined()
      expect(userPolicyResponse.subjectId).toBe(actors.collaborator.id)

      // Create role-based policy and verify serialized response
      const rolePolicyCommand = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId,
        resourceType: "document" as const,
        resourceId: document.id,
        subjectType: "role" as const,
        subjectId: undefined, // undefined in command
        role: "USER" as const,
        actions: ["read"] as const,
        effect: "allow" as const
      }

      const rolePolicyResponse = await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.addPolicy(rolePolicyCommand),
          Date.now() + 1000
        )
      )

      // Verify subjectId is undefined (not null) in response
      expect(rolePolicyResponse.subjectId).toBeUndefined()
      expect(rolePolicyResponse.role).toBe("USER")
    })
  })

  describe("getPoliciesForDocument - Batch Retrieval", () => {
    it("should return all policies for a document", async () => {
      const { document } = await seedDocumentWithOwnerAndVersion(harness.db)

      // Create multiple policies
      const policy1Command = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId,
        resourceType: "document" as const,
        resourceId: document.id,
        subjectType: "user" as const,
        subjectId: actors.collaborator.id,
        role: undefined,
        actions: ["read"] as const,
        effect: "allow" as const
      }

      const policy2Command = {
        workspaceId: document.workspaceId,
        actorId: document.ownerId,
        resourceType: "document" as const,
        resourceId: document.id,
        subjectType: "role" as const,
        subjectId: undefined,
        role: "USER" as const,
        actions: ["read", "update"] as const,
        effect: "allow" as const
      }

      await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.addPolicy(policy1Command),
          Date.now()
        )
      )

      await expectAsyncSuccess(
        withTestClock(
          harness.accessPolicyWorkflow.addPolicy(policy2Command),
          Date.now() + 1000
        )
      )

      // Get all policies
      const allPolicies = await expectAsyncSuccess(
        harness.accessPolicyWorkflow.getPoliciesForDocument(document.id)
      )

      expect(allPolicies.length).toBeGreaterThanOrEqual(2)
    })
  })
})

