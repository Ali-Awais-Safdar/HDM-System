import { describe, it, expect } from "vitest";
import { DocumentAccessPolicy } from "../../../src/domain/policies/document-access.policy";
import { Role } from "../../../src/domain/schema/access-policy.schema";
import type { UserId, DocumentId } from "../../../src/domain/value-objects/id.vo";

describe("Document Access Policy", () => {
  const adminUserId = "admin-user-id" as unknown as UserId;
  const regularUserId = "regular-user-id" as unknown as UserId;
  const otherUserId = "other-user-id" as unknown as UserId;
  const documentId = "document-id" as unknown as DocumentId;

  describe("canRead", () => {
    it("should allow admin to read any document", () => {
      const result = DocumentAccessPolicy.canRead({
        userId: adminUserId,
        roles: ["ADMIN" as Role],
        documentId,
        documentOwnerId: otherUserId,
        userPermissions: []
      });

      expect(result.granted).toBe(true);
    });

    it("should allow owner to read their own document", () => {
      const result = DocumentAccessPolicy.canRead({
        userId: regularUserId,
        roles: [],
        documentId,
        documentOwnerId: regularUserId,
        userPermissions: []
      });

      expect(result.granted).toBe(true);
    });

    it("should allow user with read permission", () => {
      const result = DocumentAccessPolicy.canRead({
        userId: regularUserId,
        roles: [],
        documentId,
        documentOwnerId: otherUserId,
        userPermissions: [{
          // minimal shape for Permission entity interop via 'as any'
          level: "read",
          grantsAccess: (lvl: any) => ["read", "write", "admin"].includes(lvl),
        } as any]
      });

      expect(result.granted).toBe(true);
    });

    it("should allow user with write permission to read", () => {
      const result = DocumentAccessPolicy.canRead({
        userId: regularUserId,
        roles: [],
        documentId,
        documentOwnerId: otherUserId,
        userPermissions: [{
          level: "write",
          grantsAccess: (lvl: any) => ["read", "write", "admin"].includes(lvl),
        } as any]
      });

      expect(result.granted).toBe(true);
    });

    it("should deny user without permission", () => {
      const result = DocumentAccessPolicy.canRead({
        userId: regularUserId,
        roles: [],
        documentId,
        documentOwnerId: otherUserId,
        userPermissions: []
      });

      expect(result.granted).toBe(false);
    });
  });

  describe("canWrite", () => {
    it("should allow admin to write any document", () => {
      const result = DocumentAccessPolicy.canWrite({
        userId: adminUserId,
        roles: ["ADMIN" as Role],
        documentId,
        documentOwnerId: otherUserId,
        userPermissions: []
      });

      expect(result.granted).toBe(true);
    });

    it("should allow owner to write their own document", () => {
      const result = DocumentAccessPolicy.canWrite({
        userId: regularUserId,
        roles: [],
        documentId,
        documentOwnerId: regularUserId,
        userPermissions: []
      });

      expect(result.granted).toBe(true);
    });

    it("should allow user with write permission", () => {
      const result = DocumentAccessPolicy.canWrite({
        userId: regularUserId,
        roles: [],
        documentId,
        documentOwnerId: otherUserId,
        userPermissions: [{
          level: "write",
          grantsAccess: (lvl: any) => ["write", "admin"].includes(lvl),
        } as any]
      });

      expect(result.granted).toBe(true);
    });

    it("should deny user with only read permission", () => {
      const result = DocumentAccessPolicy.canWrite({
        userId: regularUserId,
        roles: [],
        documentId,
        documentOwnerId: otherUserId,
        userPermissions: [{
          level: "read",
          grantsAccess: (lvl: any) => ["read"].includes(lvl),
        } as any]
      });

      expect(result.granted).toBe(false);
    });
  });

  describe("canDelete", () => {
    it("should allow admin to delete any document", () => {
      const result = DocumentAccessPolicy.canAdmin({
        userId: adminUserId,
        roles: ["ADMIN" as Role],
        documentId,
        documentOwnerId: otherUserId,
        userPermissions: []
      });

      expect(result.granted).toBe(true);
    });

    it("should allow owner to delete their own document", () => {
      const result = DocumentAccessPolicy.canAdmin({
        userId: regularUserId,
        roles: [],
        documentId,
        documentOwnerId: regularUserId,
        userPermissions: []
      });

      expect(result.granted).toBe(true);
    });

    it("should deny user with write permission from deleting", () => {
      const result = DocumentAccessPolicy.canAdmin({
        userId: regularUserId,
        roles: [],
        documentId,
        documentOwnerId: otherUserId,
        userPermissions: [{
          level: "write",
          grantsAccess: (lvl: any) => ["write", "admin"].includes(lvl),
        } as any]
      });

      expect(result.granted).toBe(false);
    });

    it("should allow user with admin permission to delete", () => {
      const result = DocumentAccessPolicy.canAdmin({
        userId: regularUserId,
        roles: [],
        documentId,
        documentOwnerId: otherUserId,
        userPermissions: [{
          level: "admin",
          grantsAccess: (lvl: any) => ["admin"].includes(lvl),
        } as any]
      });

      expect(result.granted).toBe(true);
    });
  });

  describe("canShare", () => {
    it("should allow admin to share any document", () => {
      const result = DocumentAccessPolicy.canShare({
        userId: adminUserId,
        roles: ["ADMIN" as Role],
        documentId,
        documentOwnerId: otherUserId,
        userPermissions: []
      });

      expect(result.granted).toBe(true);
    });

    it("should allow owner to share their own document", () => {
      const result = DocumentAccessPolicy.canShare({
        userId: regularUserId,
        roles: [],
        documentId,
        documentOwnerId: regularUserId,
        userPermissions: []
      });

      expect(result.granted).toBe(true);
    });

    it("should deny user with write permission from sharing", () => {
      const result = DocumentAccessPolicy.canShare({
        userId: regularUserId,
        roles: [],
        documentId,
        documentOwnerId: otherUserId,
        userPermissions: [{
          level: "write",
          grantsAccess: (lvl: any) => ["write", "admin"].includes(lvl),
        } as any]
      });

      expect(result.granted).toBe(false);
    });
  });
});
