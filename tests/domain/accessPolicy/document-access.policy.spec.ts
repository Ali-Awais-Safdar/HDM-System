import { describe, it, expect } from "vitest"
import { DocumentAccessPolicy, type DocumentAccessContext } from "@domain/accessPolicy/document-access.policy"
import { TestPatterns } from "../../utils/test-patterns"
import { UserId, DocumentId } from "@domain/refined/ids"
import type { Role, PermissionLevel, PermissionAction } from "@domain/accessPolicy/access-policy.schema"

describe("DocumentAccessPolicy", () => {
  // Test data factories
  const createUserId = (id: string): UserId => id as UserId
  const createDocumentId = (id: string): DocumentId => id as DocumentId

  const createContext = (overrides: Partial<DocumentAccessContext> = {}): DocumentAccessContext => ({
    userId: createUserId("user-123"),
    roles: [],
    documentId: createDocumentId("doc-456"),
    documentOwnerId: createUserId("owner-789"),
    userPolicies: [],
    ...overrides
  })

  const createUserPolicy = (
    subjectId: UserId,
    actions: readonly PermissionAction[]
  ) => ({
    subjectType: "user" as const,
    subjectId,
    actions
  })

  const createRolePolicy = (
    role: Role,
    actions: readonly PermissionAction[]
  ) => ({
    subjectType: "role" as const,
    role,
    actions
  })

  describe("Admin Bypass", () => {
    it("should grant admin access when user has ADMIN role", () => {
      const context = createContext({
        userId: createUserId("admin-user"),
        roles: ["ADMIN" as Role]
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAccessE(context, "admin")
      )

      expect(result.granted).toBe(true)
      expect(result.reason).toBe("Admin role bypasses all checks")
      expect(result.effectiveLevel).toBe("admin")
    })

    it("should grant admin access for any permission level when user has ADMIN role", () => {
      const context = createContext({
        userId: createUserId("admin-user"),
        roles: ["ADMIN" as Role]
      })

      const levels: PermissionLevel[] = ["read", "write", "admin"]
      
      levels.forEach(level => {
        const result = TestPatterns.Effect.expectSuccess(
          DocumentAccessPolicy.canAccessE(context, level)
        )

        expect(result.granted).toBe(true)
        expect(result.reason).toBe("Admin role bypasses all checks")
        expect(result.effectiveLevel).toBe("admin")
      })
    })

    it("should work with multiple roles including ADMIN", () => {
      const context = createContext({
        userId: createUserId("admin-user"),
        roles: ["USER" as Role, "ADMIN" as Role]
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAccessE(context, "admin")
      )

      expect(result.granted).toBe(true)
      expect(result.reason).toBe("Admin role bypasses all checks")
      expect(result.effectiveLevel).toBe("admin")
    })
  })

  describe("Owner Bypass", () => {
    it("should grant admin access when user is document owner", () => {
      const userId = createUserId("owner-123")
      const context = createContext({
        userId,
        documentOwnerId: userId // Same user is owner
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAccessE(context, "admin")
      )

      expect(result.granted).toBe(true)
      expect(result.reason).toBe("Document owner has full access")
      expect(result.effectiveLevel).toBe("admin")
    })

    it("should grant admin access for any permission level when user is owner", () => {
      const userId = createUserId("owner-123")
      const context = createContext({
        userId,
        documentOwnerId: userId
      })

      const levels: PermissionLevel[] = ["read", "write", "admin"]
      
      levels.forEach(level => {
        const result = TestPatterns.Effect.expectSuccess(
          DocumentAccessPolicy.canAccessE(context, level)
        )

        expect(result.granted).toBe(true)
        expect(result.reason).toBe("Document owner has full access")
        expect(result.effectiveLevel).toBe("admin")
      })
    })

    it("should prioritize admin over owner when both conditions are met", () => {
      const userId = createUserId("admin-owner")
      const context = createContext({
        userId,
        documentOwnerId: userId,
        roles: ["ADMIN" as Role]
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAccessE(context, "admin")
      )

      expect(result.granted).toBe(true)
      expect(result.reason).toBe("Admin role bypasses all checks")
      expect(result.effectiveLevel).toBe("admin")
    })
  })

  describe("Explicit User Grant", () => {
    it("should grant access based on user policy with read level", () => {
      const userId = createUserId("user-123")
      const context = createContext({
        userId,
        userPolicies: [
          createUserPolicy(userId, ["read"])
        ]
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAccessE(context, "read")
      )

      expect(result.granted).toBe(true)
      expect(result.reason).toBe("User policy grants read access")
      expect(result.effectiveLevel).toBe("read")
    })

    it("should grant access based on user policy with write level", () => {
      const userId = createUserId("user-123")
      const context = createContext({
        userId,
        userPolicies: [
          createUserPolicy(userId, ["read", "update"])
        ]
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAccessE(context, "write")
      )

      expect(result.granted).toBe(true)
      expect(result.reason).toBe("User policy grants write access")
      expect(result.effectiveLevel).toBe("write")
    })

    it("should grant access based on user policy with admin level", () => {
      const userId = createUserId("user-123")
      const context = createContext({
        userId,
        userPolicies: [
          createUserPolicy(userId, ["read", "update", "delete"])
        ]
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAccessE(context, "admin")
      )

      expect(result.granted).toBe(true)
      expect(result.reason).toBe("User policy grants admin access")
      expect(result.effectiveLevel).toBe("admin")
    })

    it("should use highest user policy when multiple exist", () => {
      const userId = createUserId("user-123")
      const context = createContext({
        userId,
        userPolicies: [
          createUserPolicy(userId, ["read"]), // read level
          createUserPolicy(userId, ["read", "update", "delete"]), // admin level
          createUserPolicy(userId, ["read", "update"]) // write level
        ]
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAccessE(context, "admin")
      )

      expect(result.granted).toBe(true)
      expect(result.reason).toBe("User policy grants admin access")
      expect(result.effectiveLevel).toBe("admin")
    })

    it("should deny access when user policy is insufficient", () => {
      const userId = createUserId("user-123")
      const context = createContext({
        userId,
        userPolicies: [
          createUserPolicy(userId, ["read"]) // Only read, but need write
        ]
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAccessE(context, "write")
      )

      expect(result.granted).toBe(false)
      expect(result.reason).toBe("User policy insufficient: has read, requires write")
      expect(result.effectiveLevel).toBeUndefined()
    })
  })

  describe("Insufficient User Policy", () => {
    it("should fall back to role policies when user policy is insufficient", () => {
      const userId = createUserId("user-123")
      const context = createContext({
        userId,
        userPolicies: [
          createUserPolicy(userId, ["read"]), // Insufficient user policy
          createRolePolicy("USER" as Role, ["read", "update"]) // Sufficient role policy
        ]
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAccessE(context, "write")
      )

      expect(result.granted).toBe(true)
      expect(result.reason).toBe("Role policy grants write access")
      expect(result.effectiveLevel).toBe("write")
    })

    it("should deny access when both user and role policies are insufficient", () => {
      const userId = createUserId("user-123")
      const context = createContext({
        userId,
        userPolicies: [
          createUserPolicy(userId, ["read"]), // Insufficient
          createRolePolicy("USER" as Role, ["read"]) // Also insufficient
        ]
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAccessE(context, "write")
      )

      expect(result.granted).toBe(false)
      expect(result.reason).toBe("Role policy insufficient: has read, requires write")
      expect(result.effectiveLevel).toBeUndefined()
    })
  })

  describe("Highest Role Policy", () => {
    it("should use highest role policy when no user policies exist", () => {
      const userId = createUserId("user-123")
      const context = createContext({
        userId,
        roles: ["USER" as Role],
        userPolicies: [
          createRolePolicy("USER" as Role, ["read", "update"])
        ]
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAccessE(context, "write")
      )

      expect(result.granted).toBe(true)
      expect(result.reason).toBe("Role policy grants write access")
      expect(result.effectiveLevel).toBe("write")
    })

    it("should use highest role policy when multiple role policies exist", () => {
      const userId = createUserId("user-123")
      const context = createContext({
        userId,
        roles: ["USER" as Role],
        userPolicies: [
          createRolePolicy("USER" as Role, ["read"]), // read level
          createRolePolicy("USER" as Role, ["read", "update", "delete"]) // admin level
        ]
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAccessE(context, "admin")
      )

      expect(result.granted).toBe(true)
      expect(result.reason).toBe("Role policy grants admin access")
      expect(result.effectiveLevel).toBe("admin")
    })

    it("should prioritize user policies over role policies", () => {
      const userId = createUserId("user-123")
      const context = createContext({
        userId,
        roles: ["USER" as Role],
        userPolicies: [
          createUserPolicy(userId, ["read"]), // User policy: read
          createRolePolicy("USER" as Role, ["read", "update", "delete"]) // Role policy: admin
        ]
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAccessE(context, "write")
      )

      // Should use user policy (insufficient) rather than role policy (sufficient)
      expect(result.granted).toBe(false)
      expect(result.reason).toBe("User policy insufficient: has read, requires write")
      expect(result.effectiveLevel).toBeUndefined()
    })
  })

  describe("Default Deny", () => {
    it("should deny access when no policies exist", () => {
      const context = createContext({
        userPolicies: []
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAccessE(context, "read")
      )

      expect(result.granted).toBe(false)
      expect(result.reason).toBe("No matching user/role policies and not owner/admin")
      expect(result.effectiveLevel).toBeUndefined()
    })

    it("should deny access when user policies exist but for different user", () => {
      const userId = createUserId("user-123")
      const otherUserId = createUserId("other-user")
      const context = createContext({
        userId,
        userPolicies: [
          createUserPolicy(otherUserId, ["read", "update"]) // Policy for different user
        ]
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAccessE(context, "read")
      )

      expect(result.granted).toBe(false)
      expect(result.reason).toBe("No matching user/role policies and not owner/admin")
      expect(result.effectiveLevel).toBeUndefined()
    })

    it("should deny access when role policies exist but user doesn't have those roles", () => {
      const userId = createUserId("user-123")
      const context = createContext({
        userId,
        roles: ["USER" as Role],
        userPolicies: [
          createRolePolicy("ADMIN" as Role, ["read", "update"]) // Policy for different role
        ]
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAccessE(context, "read")
      )

      expect(result.granted).toBe(false)
      expect(result.reason).toBe("No matching user/role policies and not owner/admin")
      expect(result.effectiveLevel).toBeUndefined()
    })
  })

  describe("Convenience Methods", () => {
    const userId = createUserId("user-123")
    const context = createContext({
      userId,
      userPolicies: [
        createUserPolicy(userId, ["read", "update"])
      ]
    })

    it("should work with canRead method", () => {
      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canRead(context)
      )

      expect(result.granted).toBe(true)
      expect(result.reason).toBe("User policy grants write access")
      expect(result.effectiveLevel).toBe("write")
    })

    it("should work with canWrite method", () => {
      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canWrite(context)
      )

      expect(result.granted).toBe(true)
      expect(result.reason).toBe("User policy grants write access")
      expect(result.effectiveLevel).toBe("write")
    })

    it("should work with canAdmin method", () => {
      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAdmin(context)
      )

      expect(result.granted).toBe(false)
      expect(result.reason).toBe("User policy insufficient: has write, requires admin")
      expect(result.effectiveLevel).toBeUndefined()
    })

    it("should work with canShare method (same as canAdmin)", () => {
      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canShare(context)
      )

      expect(result.granted).toBe(false)
      expect(result.reason).toBe("User policy insufficient: has write, requires admin")
      expect(result.effectiveLevel).toBeUndefined()
    })
  })

  describe("Effective Permission Level", () => {
    it("should return admin level for admin users", () => {
      const context = createContext({
        roles: ["ADMIN" as Role]
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.getEffectivePermissionLevel(context)
      )

      expect(result).toBe("admin")
    })

    it("should return admin level for document owners", () => {
      const userId = createUserId("owner-123")
      const context = createContext({
        userId,
        documentOwnerId: userId
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.getEffectivePermissionLevel(context)
      )

      expect(result).toBe("admin")
    })

    it("should return highest user policy level", () => {
      const userId = createUserId("user-123")
      const context = createContext({
        userId,
        userPolicies: [
          createUserPolicy(userId, ["read"]),
          createUserPolicy(userId, ["read", "update", "delete"])
        ]
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.getEffectivePermissionLevel(context)
      )

      expect(result).toBe("admin")
    })

    it("should return highest role policy level when no user policies", () => {
      const userId = createUserId("user-123")
      const context = createContext({
        userId,
        roles: ["USER" as Role],
        userPolicies: [
          createRolePolicy("USER" as Role, ["read", "update"])
        ]
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.getEffectivePermissionLevel(context)
      )

      expect(result).toBe("write")
    })

    it("should return null when no policies exist", () => {
      const context = createContext({
        userPolicies: []
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.getEffectivePermissionLevel(context)
      )

      expect(result).toBeNull()
    })
  })

  describe("Edge Cases", () => {
    it("should handle empty action arrays gracefully", () => {
      const userId = createUserId("user-123")
      const context = createContext({
        userId,
        userPolicies: [
          createUserPolicy(userId, []) // Empty actions
        ]
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAccessE(context, "read")
      )

      expect(result.granted).toBe(true) // Empty actions default to read level
      expect(result.reason).toBe("User policy grants read access")
      expect(result.effectiveLevel).toBe("read")
    })

    it("should handle mixed user and role policies correctly", () => {
      const userId = createUserId("user-123")
      const context = createContext({
        userId,
        roles: ["USER" as Role],
        userPolicies: [
          createUserPolicy(userId, ["read"]), // User policy: read
          createRolePolicy("USER" as Role, ["read", "update", "delete"]) // Role policy: admin
        ]
      })

      // Should use user policy (read) and deny write access
      const writeResult = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAccessE(context, "write")
      )

      expect(writeResult.granted).toBe(false)
      expect(writeResult.reason).toBe("User policy insufficient: has read, requires write")

      // Should use user policy (read) and allow read access
      const readResult = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAccessE(context, "read")
      )

      expect(readResult.granted).toBe(true)
      expect(readResult.reason).toBe("User policy grants read access")
    })

    it("should handle duplicate actions in policies", () => {
      const userId = createUserId("user-123")
      const context = createContext({
        userId,
        userPolicies: [
          createUserPolicy(userId, ["read", "read", "update", "update"]) // Duplicates
        ]
      })

      const result = TestPatterns.Effect.expectSuccess(
        DocumentAccessPolicy.canAccessE(context, "write")
      )

      expect(result.granted).toBe(true)
      expect(result.reason).toBe("User policy grants write access")
      expect(result.effectiveLevel).toBe("write")
    })
  })
})
