import { describe, it, expect } from "vitest"
import { UserEntity } from "@domain/user/user.entity"
import { createUserEntity, createAdminUserEntity, generateUser } from "../factories/user.factory"
import { expectSuccess, expectFailure, expectSome, expectNone } from "../../utils/test.helpers"
import { UserValidationError } from "@domain/user/user.error"
import { withTestClock } from "../setup/test-clock"
import * as fc from "fast-check"

describe("UserEntity", () => {
  describe("creation", () => {
    it("creates successfully with valid roles", () => {
      const user = createUserEntity({ roles: ["USER"] })
      expect(user.roleCount).toBe(1)
      const admin = createAdminUserEntity()
      expect(admin.roleCount).toBeGreaterThan(0)
    })

    it("fails when roles array is empty (schema guard)", () => {
      const encoded = generateUser({ roles: [] as any })
      const error = expectFailure(UserEntity.create(encoded), UserValidationError)
      expect(error.message).toMatch(/User must have at least one valid role/)
    })
  })

  describe("getters", () => {
    it("roleCount reflects number of roles", () => {
      const single = createUserEntity({ roles: ["USER"] })
      const multi = createUserEntity({ roles: ["USER", "ADMIN"] })
      expect(single.roleCount).toBe(1)
      expect(multi.roleCount).toBe(2)
    })

    it("hasWorkspaceAssignment indicates Option presence", () => {
      const noWs = createUserEntity({ workspaceId: undefined })
      expect(noWs.hasWorkspaceAssignment).toBe(false)
      const encoded = generateUser({ workspaceId: "550e8400-e29b-41d4-a716-446655440001" as any })
      const withWs = expectSuccess(UserEntity.create(encoded))
      expect(withWs.hasWorkspaceAssignment).toBe(true)
    })

    it("emailDomain extracts domain part", () => {
      const user = createUserEntity({ email: "jane.doe@company.org" as any })
      expect(user.emailDomain).toBe("company.org")
    })
  })

  describe("role queries", () => {
    it("isAdmin true for ADMIN, false otherwise", () => {
      const admin = createAdminUserEntity()
      const user = createUserEntity({ roles: ["USER"] })
      expect(admin.isAdmin()).toBe(true)
      expect(user.isAdmin()).toBe(false)
    })

    it("hasRole covers varied role sets", () => {
      const user = createUserEntity({ roles: ["USER"] })
      const admin = createUserEntity({ roles: ["USER", "ADMIN"] })
      expect(user.hasRole("USER" as any)).toBe(true)
      expect(user.hasRole("ADMIN" as any)).toBe(false)
      expect(admin.hasRole("ADMIN" as any)).toBe(true)
      expect(admin.hasRole("USER" as any)).toBe(true)
    })
  })

  describe("workspace assignment mutations", () => {
    it("assignToWorkspace and removeFromWorkspace update updatedAt and Option states (with test clock)", () => {
      const user = createUserEntity({ workspaceId: undefined })
      expect(user.hasWorkspaceAssignment).toBe(false)
      expect(user.updatedAt).toBeDefined()
      expectNone(user.updatedAt)

      const wsId = "550e8400-e29b-41d4-a716-446655440001" as any
      const t1 = Date.parse("2025-01-03T10:00:00.000Z")
      const assigned = expectSuccess(
        withTestClock(user.assignToWorkspace(wsId), t1)
      )

      expect(assigned.hasWorkspaceAssignment).toBe(true)
      const assignedUpdatedAt = expectSome(assigned.updatedAt)
      expect(assignedUpdatedAt.getTime()).toBe(t1)

      const t2 = Date.parse("2025-01-03T11:15:00.000Z")
      const removed = expectSuccess(
        withTestClock(assigned.removeFromWorkspace(), t2)
      )

      expect(removed.hasWorkspaceAssignment).toBe(false)
      const removedUpdatedAt = expectSome(removed.updatedAt)
      expect(removedUpdatedAt.getTime()).toBe(t2)
    })
  })

  describe("serialization round-trip", () => {
    it("retains id and passwordHash across serialize -> create", () => {
      const original = createUserEntity()

      const encoded = expectSuccess(original.serialized())
      const recreated = expectSuccess(UserEntity.create(encoded))

      expect(recreated.id).toBe(original.id)
      expect(recreated.passwordHash).toBe(original.passwordHash)
      expect(recreated.email).toBe(original.email)
    })
  })

  describe("property: factory-generated roles are valid", () => {
    it("any sampled factory output has non-empty roles limited to allowed literals", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          () => {
            const encoded = generateUser()
            expect(Array.isArray(encoded.roles)).toBe(true)
            expect(encoded.roles.length).toBeGreaterThan(0)
            encoded.roles.forEach((r: "USER" | "ADMIN") => {
              expect(["USER", "ADMIN"]).toContain(r)
            })
          }
        ),
        { numRuns: 200 }
      )
    })
  })
})


