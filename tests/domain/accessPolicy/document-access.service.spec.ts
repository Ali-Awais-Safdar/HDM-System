import { describe, it, expect } from "vitest"
import { DocumentAccessService } from "@domain/accessPolicy/document-access.service"
import { DocumentEntity } from "@domain/document/document.entity"
import { AccessPolicyEntity } from "@domain/accessPolicy/access-policy.entity"
import { DocumentAccessDeniedError, DocumentAccessInsufficientPermissionsError, DocumentAccessContextInvalidError } from "@domain/accessPolicy/document-access.error"
import type { PermissionAction, Role } from "@domain/accessPolicy/access-policy.schema"
import { createUserEntity, createAdminUserEntity } from "../factories/user.factory"
import { generateDocument } from "../factories/document.factory"
import { createAccessPolicyEntity } from "../factories/access-policy.factory"
import { expectSuccess, expectFailure } from "../../utils/test.helpers"
import { UserId } from "@domain/refined/ids"

// Local helpers
const createDocumentEntity = (overrides: Partial<ReturnType<typeof generateDocument>> = {}) =>
  expectSuccess(DocumentEntity.create(generateDocument(overrides)))

const userPolicy = (resourceId: string, userId: string, actions: readonly PermissionAction[]) =>
  createAccessPolicyEntity({ resourceId, subjectType: "user", subjectId: userId as UserId, role: undefined, actions: [...actions] })

const rolePolicy = (resourceId: string, role: Role, actions: readonly PermissionAction[]) =>
  createAccessPolicyEntity({ resourceId, subjectType: "role", subjectId: undefined, role, actions: [...actions] })

describe("DocumentAccessService", () => {
  describe("happy path grants", () => {
    it("grants read when user policy permits read", () => {
      const user = createUserEntity()
      const doc = createDocumentEntity()
      const policies: ReadonlyArray<AccessPolicyEntity> = [
        userPolicy(String(doc.id), String(user.id), ["read"])
      ]

      const result = expectSuccess(
        DocumentAccessService.canReadDocument(user, doc, policies)
      )

      expect(result.granted).toBe(true)
      expect(result.reason).toBe("User policy grants read access")
      expect(result.effectiveLevel).toBe("read")
    })

    it("grants write when user policy permits write", () => {
      const user = createUserEntity()
      const doc = createDocumentEntity()
      const policies: ReadonlyArray<AccessPolicyEntity> = [
        userPolicy(String(doc.id), String(user.id), ["read", "update"]) // write
      ]

      const result = expectSuccess(
        DocumentAccessService.canWriteDocument(user, doc, policies)
      )

      expect(result.granted).toBe(true)
      expect(result.reason).toBe("User policy grants write access")
      expect(result.effectiveLevel).toBe("write")
    })

    it("grants admin when user policy permits admin", () => {
      const user = createUserEntity()
      const doc = createDocumentEntity()
      const policies: ReadonlyArray<AccessPolicyEntity> = [
        userPolicy(String(doc.id), String(user.id), ["read", "update", "delete"]) // admin
      ]

      const result = expectSuccess(
        DocumentAccessService.canAdminDocument(user, doc, policies)
      )

      expect(result.granted).toBe(true)
      expect(result.reason).toBe("User policy grants admin access")
      expect(result.effectiveLevel).toBe("admin")
    })

    it("grants via role policy when no user policies exist", () => {
      const user = createUserEntity({ roles: ["USER"] })
      const doc = createDocumentEntity()
      const policies: ReadonlyArray<AccessPolicyEntity> = [
        rolePolicy(String(doc.id), "USER", ["read", "update"]) // write
      ]

      const result = expectSuccess(
        DocumentAccessService.canWriteDocument(user, doc, policies)
      )

      expect(result.granted).toBe(true)
      expect(result.reason).toBe("Role policy grants write access")
      expect(result.effectiveLevel).toBe("write")
    })
  })

  describe("invalid policy encoding", () => {
    it("raises DocumentAccessContextInvalidError when a policy cannot be encoded", () => {
      const user = createUserEntity()
      const doc = createDocumentEntity()

      // Deliberately pass an invalid policy object casted as AccessPolicyEntity
      const invalidPolicy = { foo: "bar" } as unknown as AccessPolicyEntity
      const policies: ReadonlyArray<AccessPolicyEntity> = [invalidPolicy]

      const error = expectFailure(
        DocumentAccessService.canReadDocument(user, doc, policies) as any,
        DocumentAccessContextInvalidError
      )

      expect(error.code).toBe("DOCUMENT_ACCESS_CONTEXT_INVALID")
      expect(error.message).toMatch(/Invalid policy:/)
    })
  })

  describe("denied with fallback effective level", () => {
    it("raises DocumentAccessInsufficientPermissionsError when effective level exists but below required", () => {
      const user = createUserEntity()
      const doc = createDocumentEntity()
      const policies: ReadonlyArray<AccessPolicyEntity> = [
        userPolicy(String(doc.id), String(user.id), ["read", "update"]) // write
      ]

      const error = expectFailure(
        DocumentAccessService.canAdminDocument(user, doc, policies) as any,
        DocumentAccessInsufficientPermissionsError
      )

      expect(error.code).toBe("DOCUMENT_ACCESS_INSUFFICIENT_PERMISSIONS")
      expect(error.currentLevel).toBe("write")
      expect(error.requiredLevel).toBe("admin")
    })
  })

  describe("full denial (no effective level)", () => {
    it("raises DocumentAccessDeniedError when no policies and user is neither admin nor owner", () => {
      const user = createUserEntity({ roles: ["USER"] })
      const doc = createDocumentEntity()
      const policies: ReadonlyArray<AccessPolicyEntity> = []

      const error = expectFailure(
        DocumentAccessService.canReadDocument(user, doc, policies) as any,
        DocumentAccessDeniedError
      )

      expect(error.code).toBe("DOCUMENT_ACCESS_DENIED")
      expect(error.requiredLevel).toBe("read")
      expect(error.reason).toBe("No matching user/role policies and not owner/admin")
    })
  })

  describe("admin/owner bypass (service wiring)", () => {
    it("grants via admin role bypass regardless of policies", () => {
      const admin = createAdminUserEntity()
      const doc = createDocumentEntity()
      const result = expectSuccess(
        DocumentAccessService.canAdminDocument(admin, doc, [])
      )
      expect(result.granted).toBe(true)
      expect(result.effectiveLevel).toBe("admin")
    })

    it("grants via owner bypass regardless of policies", () => {
      const owner = createUserEntity()
      const doc = createDocumentEntity({ ownerId: owner.id })
      const result = expectSuccess(
        DocumentAccessService.canReadDocument(owner, doc, [])
      )
      expect(result.granted).toBe(true)
      expect(result.effectiveLevel).toBe("admin")
    })
  })

  describe("helper methods", () => {
    it("isOwner returns true when user id equals document owner id", () => {
      const owner = createUserEntity()
      const doc = createDocumentEntity({ ownerId: owner.id })
      expect(DocumentAccessService.isOwner(owner, doc)).toBe(true)
    })

    it("isOwner returns false when user id differs from document owner id", () => {
      const user = createUserEntity()
      const doc = createDocumentEntity()
      expect(DocumentAccessService.isOwner(user, doc)).toBe(false)
    })

    it("isAdmin returns true for ADMIN role and false otherwise", () => {
      const admin = createAdminUserEntity()
      const user = createUserEntity({ roles: ["USER"] })
      expect(DocumentAccessService.isAdmin(admin)).toBe(true)
      expect(DocumentAccessService.isAdmin(user)).toBe(false)
    })

    it("hasAccess returns true when underlying access is granted", () => {
      const user = createUserEntity()
      const doc = createDocumentEntity()
      const policies = [userPolicy(String(doc.id), String(user.id), ["read"]) ]
      const granted = expectSuccess(
        DocumentAccessService.hasAccess(user, doc, policies, "read")
      )
      expect(granted).toBe(true)
    })

    it("hasAccess returns false when underlying access denies (insufficient level)", () => {
      const user = createUserEntity()
      const doc = createDocumentEntity()
      const policies = [userPolicy(String(doc.id), String(user.id), ["read"]) ]
      const granted = expectSuccess(
        DocumentAccessService.hasAccess(user, doc, policies, "admin")
      )
      expect(granted).toBe(false)
    })

    it("hasAccess returns false when underlying access throws an error", () => {
      const user = createUserEntity()
      const doc = createDocumentEntity()
      // Invalid policy that will fail encoding/context validation and throw in canAccessDocument
      const invalidPolicies = [({ foo: "bar" } as unknown as AccessPolicyEntity)] as const
      const granted = expectSuccess(
        DocumentAccessService.hasAccess(user, doc, invalidPolicies as any, "read")
      )
      expect(granted).toBe(false)
    })
  })
})


