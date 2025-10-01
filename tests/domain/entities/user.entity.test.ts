import { describe, expect, it } from "vitest";
import { UserEntity } from "../../../src/domain/entities/user.entity";
import { ValidationError } from "../../../src/domain/errors/domain.errors";
import { 
  generateTestUser, 
  createAdminUser,
  createRegularUser,
  createUserWithWorkspace,
  createUserWithoutWorkspace,
  userArbitrary
} from "../../factories/user.factory";
import { TestPatterns } from "../../utils/test.helpers";
import * as fc from "fast-check";

describe("UserEntity", () => {
  describe("Entity Creation", () => {
    it("should create valid user", () => {
      const userData = generateTestUser();
      const user = TestPatterns.Effect.expectSuccess(UserEntity.create(userData));

      expect(user).toBeInstanceOf(UserEntity);
      expect(user.email).toBeDefined();
      expect(user.roles.length).toBeGreaterThan(0);
    });

    it("should validate email format", () => {
      const invalidData = generateTestUser({ email: "invalid-email" as any });
      TestPatterns.Effect.expectFailure(UserEntity.create(invalidData), ValidationError);
    });
  });

  describe("Optional Fields", () => {
    it("should handle workspace assignment", () => {
      const workspaceId = crypto.randomUUID();
      const userData = createUserWithWorkspace(workspaceId);
      const user = TestPatterns.Effect.expectSuccess(UserEntity.create(userData));

      const wsId = TestPatterns.Option.expectSome(user.workspaceId);
      expect(wsId).toBe(workspaceId);
      expect(user.hasWorkspaceAssignment).toBe(true);
    });

    it("should handle missing workspace", () => {
      const userData = createUserWithoutWorkspace();
      const user = TestPatterns.Effect.expectSuccess(UserEntity.create(userData));

      TestPatterns.Option.expectNone(user.workspaceId);
      expect(user.hasWorkspaceAssignment).toBe(false);
    });
  });

  describe("Business Logic", () => {
    it("should identify admin users", () => {
      const adminData = createAdminUser();
      const regularData = createRegularUser();

      const admin = TestPatterns.Effect.expectSuccess(UserEntity.create(adminData));
      const regular = TestPatterns.Effect.expectSuccess(UserEntity.create(regularData));

      expect(admin.isAdminUser).toBe(true);
      expect(admin.isAdmin()).toBe(true);
      expect(regular.isAdminUser).toBe(false);
    });

    it("should assign/remove workspace", () => {
      const user = TestPatterns.Effect.expectSuccess(
        UserEntity.create(createUserWithoutWorkspace())
      );

      const workspaceId = crypto.randomUUID();
      const updated = TestPatterns.Effect.expectSuccess(user.assignToWorkspace(workspaceId as any));
      
      expect(updated.hasWorkspace()).toBe(true);

      const removed = TestPatterns.Effect.expectSuccess(updated.removeFromWorkspace());
      expect(removed.hasWorkspace()).toBe(false);
    });

    it("should check workspace membership", () => {
      const workspaceId = crypto.randomUUID();
      const user = TestPatterns.Effect.expectSuccess(
        UserEntity.create(createUserWithWorkspace(workspaceId))
      );

      expect(user.belongsToWorkspace(workspaceId as any)).toBe(true);
      expect(user.belongsToWorkspace(crypto.randomUUID() as any)).toBe(false);
    });
  });

  describe("Property-Based Testing", () => {
    it("should handle any valid user data", () => {
      fc.assert(
        fc.property(userArbitrary, (data) => {
          const user = TestPatterns.Effect.expectSuccess(UserEntity.create(data));
          expect(user).toBeInstanceOf(UserEntity);
          expect(user.email).toBe(data.email);
          expect(user.roles).toEqual(data.roles);
        }),
        { numRuns: 50 }
      );
    });
  });
});

