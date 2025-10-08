import { describe, expect, it } from "vitest";
import { DocumentAccessPolicy, DocumentAccessContext } from "../../../src/app/domain/accessPolicy/document-access.policy";
import { AccessPolicyEntity } from "../../../src/app/domain/accessPolicy/access-policy.entity";
import { createUserReadPolicy, createUserWritePolicy, createUserAdminPolicy, createRolePolicy } from "../../factories/access-policy.factory";
import { TestPatterns } from "../../utils/test.helpers";

describe("DocumentAccessPolicy", () => {
  const userId = crypto.randomUUID() as any;
  const documentId = crypto.randomUUID() as any;
  const ownerId = crypto.randomUUID() as any;

  describe("Admin Role Access", () => {
    it("should grant admin role full access", () => {
      const context: DocumentAccessContext = {
        userId,
        roles: ["ADMIN"],
        documentId,
        documentOwnerId: ownerId,
        userPolicies: []
      };

      const result = DocumentAccessPolicy.canAccess(context, "read");
      expect(result.granted).toBe(true);
      expect(result.effectiveLevel).toBe("admin");

      const adminResult = DocumentAccessPolicy.canAdmin(context);
      expect(adminResult.granted).toBe(true);
    });
  });

  describe("Owner Access", () => {
    it("should grant owner full access", () => {
      const context: DocumentAccessContext = {
        userId,
        roles: ["USER"],
        documentId,
        documentOwnerId: userId,
        userPolicies: []
      };

      const result = DocumentAccessPolicy.canAccess(context, "read");
      expect(result.granted).toBe(true);
      expect(result.effectiveLevel).toBe("admin");

      const writeResult = DocumentAccessPolicy.canWrite(context);
      expect(writeResult.granted).toBe(true);
    });
  });

  describe("Policy-Based Access", () => {
    it("should grant access based on user policy", () => {
      const policyData = createUserReadPolicy(userId, documentId);
      const policy = TestPatterns.Effect.expectSuccess(AccessPolicyEntity.create(policyData));

      const context: DocumentAccessContext = {
        userId,
        roles: ["USER"],
        documentId,
        documentOwnerId: ownerId,
        userPolicies: [policy]
      };

      const readResult = DocumentAccessPolicy.canRead(context);
      expect(readResult.granted).toBe(true);

      const writeResult = DocumentAccessPolicy.canWrite(context);
      expect(writeResult.granted).toBe(false);
    });

    it("should grant write access with write policy", () => {
      const policyData = createUserWritePolicy(userId, documentId);
      const policy = TestPatterns.Effect.expectSuccess(AccessPolicyEntity.create(policyData));

      const context: DocumentAccessContext = {
        userId,
        roles: ["USER"],
        documentId,
        documentOwnerId: ownerId,
        userPolicies: [policy]
      };

      const readResult = DocumentAccessPolicy.canRead(context);
      expect(readResult.granted).toBe(true);

      const writeResult = DocumentAccessPolicy.canWrite(context);
      expect(writeResult.granted).toBe(true);

      const adminResult = DocumentAccessPolicy.canAdmin(context);
      expect(adminResult.granted).toBe(false);
    });

    it("should grant admin access with admin policy", () => {
      const policyData = createUserAdminPolicy(userId, documentId);
      const policy = TestPatterns.Effect.expectSuccess(AccessPolicyEntity.create(policyData));

      const context: DocumentAccessContext = {
        userId,
        roles: ["USER"],
        documentId,
        documentOwnerId: ownerId,
        userPolicies: [policy]
      };

      const adminResult = DocumentAccessPolicy.canAdmin(context);
      expect(adminResult.granted).toBe(true);

      const shareResult = DocumentAccessPolicy.canShare(context);
      expect(shareResult.granted).toBe(true);
    });
  });

  describe("Permission Level Hierarchy", () => {
    it("should use highest permission when multiple policies exist", () => {
      const readPolicy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createUserReadPolicy(userId, documentId))
      );
      const writePolicy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createUserWritePolicy(userId, documentId))
      );

      const context: DocumentAccessContext = {
        userId,
        roles: ["USER"],
        documentId,
        documentOwnerId: ownerId,
        userPolicies: [readPolicy, writePolicy]
      };

      const result = DocumentAccessPolicy.canAccess(context, "write");
      expect(result.granted).toBe(true);
      expect(result.effectiveLevel).toBe("write");
    });

    it("should determine effective permission level", () => {
      const adminPolicy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createUserAdminPolicy(userId, documentId))
      );

      const context: DocumentAccessContext = {
        userId,
        roles: ["USER"],
        documentId,
        documentOwnerId: ownerId,
        userPolicies: [adminPolicy]
      };

      const level = DocumentAccessPolicy.getEffectivePermissionLevel(context);
      expect(level).toBe("admin");
    });
  });

  describe("Access Denial", () => {
    it("should deny access without policies", () => {
      const context: DocumentAccessContext = {
        userId,
        roles: ["USER"],
        documentId,
        documentOwnerId: ownerId,
        userPolicies: []
      };

      const result = DocumentAccessPolicy.canRead(context);
      expect(result.granted).toBe(false);

      const level = DocumentAccessPolicy.getEffectivePermissionLevel(context);
      expect(level).toBeNull();
    });

    it("should deny access when permission insufficient", () => {
      const readPolicy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createUserReadPolicy(userId, documentId))
      );

      const context: DocumentAccessContext = {
        userId,
        roles: ["USER"],
        documentId,
        documentOwnerId: ownerId,
        userPolicies: [readPolicy]
      };

      const deleteResult = DocumentAccessPolicy.canAdmin(context);
      expect(deleteResult.granted).toBe(false);
    });
  });

  describe("Role-Based Policies", () => {
    it("should apply role-based policies", () => {
      const rolePolicy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createRolePolicy("USER", documentId, "read"))
      );

      const context: DocumentAccessContext = {
        userId,
        roles: ["USER"],
        documentId,
        documentOwnerId: ownerId,
        userPolicies: [rolePolicy] // Pre-filtered to include role policies matching user's roles
      };

      // Verify that role-based policy grants read access
      const readResult = DocumentAccessPolicy.canRead(context);
      expect(readResult.granted).toBe(true);
      expect(readResult.effectiveLevel).toBe("read");
      
      // Verify other permissions are not granted by read-only policy
      const writeResult = DocumentAccessPolicy.canWrite(context);
      expect(writeResult.granted).toBe(false);
      
      const adminResult = DocumentAccessPolicy.canAdmin(context);
      expect(adminResult.granted).toBe(false);
      
      // Permission level should be read
      expect(DocumentAccessPolicy.getEffectivePermissionLevel(context)).toBe("read");
    });
  });
});
