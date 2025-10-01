import { describe, expect, it } from "vitest";
import { AccessPolicyEntity } from "../../../src/domain/entities/access-policy.entity";
import { 
  generateTestAccessPolicy,
  createUserReadPolicy,
  createUserWritePolicy,
  createUserAdminPolicy,
  createRolePolicy,
  accessPolicyArbitrary
} from "../../factories/access-policy.factory";
import { TestPatterns } from "../../utils/test.helpers";
import * as fc from "fast-check";

describe("AccessPolicyEntity", () => {
  describe("Creation & Validation", () => {
    it("should create valid access policy", () => {
      const policyData = generateTestAccessPolicy();
      const policy = TestPatterns.Effect.expectSuccess(AccessPolicyEntity.create(policyData));

      expect(policy).toBeInstanceOf(AccessPolicyEntity);
      expect(policy.actions.length).toBeGreaterThan(0);
    });

    it("should create user-based policy with subjectId", () => {
      const userId = crypto.randomUUID();
      const policyData = generateTestAccessPolicy({
        subjectType: "user",
        subjectId: userId,
        role: undefined,
      });

      const policy = TestPatterns.Effect.expectSuccess(AccessPolicyEntity.create(policyData));
      expect(policy.subjectType).toBe("user");
      expect(policy.isUserSpecificPolicy).toBe(true);
    });

    it("should create role-based policy with role", () => {
      const policyData = generateTestAccessPolicy({
        subjectType: "role",
        role: "USER",
        subjectId: undefined,
      });

      const policy = TestPatterns.Effect.expectSuccess(AccessPolicyEntity.create(policyData));
      expect(policy.subjectType).toBe("role");
      expect(policy.isRoleBasedPolicy).toBe(true);
    });
  });

  describe("Permission Levels", () => {
    it("should determine permission level from actions", () => {
      const readPolicy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createUserReadPolicy(crypto.randomUUID(), crypto.randomUUID()))
      );
      const writePolicy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createUserWritePolicy(crypto.randomUUID(), crypto.randomUUID()))
      );
      const adminPolicy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createUserAdminPolicy(crypto.randomUUID(), crypto.randomUUID()))
      );

      expect(readPolicy.permissionLevel).toBe("read");
      expect(writePolicy.permissionLevel).toBe("write");
      expect(adminPolicy.permissionLevel).toBe("admin");
    });
  });

  describe("Subject Matching", () => {
    it("should match user-based subject", () => {
      const userId = crypto.randomUUID();
      const policy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createUserReadPolicy(userId, crypto.randomUUID()))
      );

      expect(policy.appliesToSubject("user", userId)).toBe(true);
      expect(policy.appliesToSubject("user", crypto.randomUUID())).toBe(false);
      expect(policy.isUserSpecificPolicy).toBe(true);
    });

    it("should match role-based subject", () => {
      const policy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createRolePolicy("ADMIN", crypto.randomUUID()))
      );

      expect(policy.appliesToSubject("role", undefined, "ADMIN")).toBe(true);
      expect(policy.appliesToSubject("role", undefined, "USER")).toBe(false);
      expect(policy.isRoleBasedPolicy).toBe(true);
    });
  });

  describe("Action Grants", () => {
    it("should check single action grant", () => {
      const policy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createUserReadPolicy(crypto.randomUUID(), crypto.randomUUID()))
      );

      expect(policy.grantsAction("read")).toBe(true);
      expect(policy.grantsAction("delete")).toBe(false);
    });

    it("should check multiple action grants", () => {
      const policy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createUserWritePolicy(crypto.randomUUID(), crypto.randomUUID()))
      );

      expect(policy.grantsAllActions(["read", "update"])).toBe(true);
      expect(policy.grantsAllActions(["read", "delete"])).toBe(false);
      expect(policy.grantsAnyAction(["read", "delete"])).toBe(true);
    });
  });

  describe("Policy Modifications", () => {
    it("should add actions", () => {
      const policy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createUserReadPolicy(crypto.randomUUID(), crypto.randomUUID()))
      );

      const updated = TestPatterns.Effect.expectSuccess(
        policy.addActions(["update", "download"])
      );

      expect(updated.grantsAction("update")).toBe(true);
      expect(updated.grantsAction("download")).toBe(true);
    });

    it("should remove actions maintaining at least one", () => {
      const policy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createUserWritePolicy(crypto.randomUUID(), crypto.randomUUID()))
      );

      const updated = TestPatterns.Effect.expectSuccess(
        policy.removeActions(["update"])
      );

      expect(updated.grantsAction("read")).toBe(true);
      expect(updated.grantsAction("update")).toBe(false);
    });

    it("should reject removing all actions", () => {
      const policy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createUserReadPolicy(crypto.randomUUID(), crypto.randomUUID()))
      );

      TestPatterns.Effect.expectFailure(
        policy.removeActions(["read"])
      );
    });
  });

  describe("Property-Based Testing", () => {
    it("should handle valid data", () => {
      fc.assert(
        fc.property(accessPolicyArbitrary, (data) => {
          const policy = TestPatterns.Effect.expectSuccess(AccessPolicyEntity.create(data));
          expect(policy.resourceType).toBe("document");
          expect(policy.effect).toBe("allow");
        }),
        { numRuns: 30 }
      );
    });
  });
});

