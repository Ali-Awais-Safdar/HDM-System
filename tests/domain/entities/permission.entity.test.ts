import { describe, it, expect } from "vitest";
import { Permission, PermissionLevel } from "../../../src/domain/entities/permission.entity";
import { asDocumentId, asUserId, asPermissionId } from "../../../src/shared/types/brand";

describe("Permission Entity", () => {
  const mockDocumentId = asDocumentId("doc-123");
  const mockUserId = asUserId("user-456");

  describe("create", () => {
    it("should create a new permission with generated ID", () => {
      const permission = Permission.create({
        documentId: mockDocumentId,
        userId: mockUserId,
        level: "read",
      });

      expect(permission.documentId).toBe(mockDocumentId);
      expect(permission.userId).toBe(mockUserId);
      expect(permission.level).toBe("read");
      expect(permission.id).toBeDefined();
      expect(permission.createdAt).toBeInstanceOf(Date);
    });

    it("should create permissions with different levels", () => {
      const levels: PermissionLevel[] = ["read", "write", "admin"];
      
      levels.forEach(level => {
        const permission = Permission.create({
          documentId: mockDocumentId,
          userId: mockUserId,
          level,
        });
        
        expect(permission.level).toBe(level);
      });
    });
  });

  describe("fromPersistence", () => {
    it("should recreate permission from persistence data", () => {
      const createdAt = new Date("2023-01-01T00:00:00Z");
      const permissionId = asPermissionId("perm-123");

      const permission = Permission.fromPersistence({
        id: permissionId,
        documentId: mockDocumentId,
        userId: mockUserId,
        level: "write",
        createdAt,
      });

      expect(permission.id).toBe(permissionId);
      expect(permission.documentId).toBe(mockDocumentId);
      expect(permission.userId).toBe(mockUserId);
      expect(permission.level).toBe("write");
      expect(permission.createdAt).toBe(createdAt);
    });
  });

  describe("grantsAccess", () => {
    it("should grant access when permission level is sufficient", () => {
      const adminPermission = Permission.create({
        documentId: mockDocumentId,
        userId: mockUserId,
        level: "admin",
      });

      expect(adminPermission.grantsAccess("read")).toBe(true);
      expect(adminPermission.grantsAccess("write")).toBe(true);
      expect(adminPermission.grantsAccess("admin")).toBe(true);
    });

    it("should deny access when permission level is insufficient", () => {
      const readPermission = Permission.create({
        documentId: mockDocumentId,
        userId: mockUserId,
        level: "read",
      });

      expect(readPermission.grantsAccess("read")).toBe(true);
      expect(readPermission.grantsAccess("write")).toBe(false);
      expect(readPermission.grantsAccess("admin")).toBe(false);
    });

    it("should handle write permission correctly", () => {
      const writePermission = Permission.create({
        documentId: mockDocumentId,
        userId: mockUserId,
        level: "write",
      });

      expect(writePermission.grantsAccess("read")).toBe(true);
      expect(writePermission.grantsAccess("write")).toBe(true);
      expect(writePermission.grantsAccess("admin")).toBe(false);
    });
  });

  describe("canBeUpgradedTo", () => {
    it("should allow upgrading to higher permission level", () => {
      const readPermission = Permission.create({
        documentId: mockDocumentId,
        userId: mockUserId,
        level: "read",
      });

      expect(readPermission.canBeUpgradedTo("write")).toBe(true);
      expect(readPermission.canBeUpgradedTo("admin")).toBe(true);
      expect(readPermission.canBeUpgradedTo("read")).toBe(false); // Same level
    });

    it("should not allow downgrading permission level", () => {
      const adminPermission = Permission.create({
        documentId: mockDocumentId,
        userId: mockUserId,
        level: "admin",
      });

      expect(adminPermission.canBeUpgradedTo("write")).toBe(false);
      expect(adminPermission.canBeUpgradedTo("read")).toBe(false);
      expect(adminPermission.canBeUpgradedTo("admin")).toBe(false); // Same level
    });
  });

  describe("toPlainObject", () => {
    it("should return a plain object representation", () => {
      const permission = Permission.create({
        documentId: mockDocumentId,
        userId: mockUserId,
        level: "write",
      });

      const plainObject = permission.toPlainObject();

      expect(plainObject).toEqual({
        id: permission.id,
        documentId: mockDocumentId,
        userId: mockUserId,
        level: "write",
        createdAt: permission.createdAt,
      });
    });

    it("should be serializable to JSON", () => {
      const permission = Permission.create({
        documentId: mockDocumentId,
        userId: mockUserId,
        level: "admin",
      });

      const plainObject = permission.toPlainObject();
      
      expect(() => JSON.stringify(plainObject)).not.toThrow();
      
      const serialized = JSON.stringify(plainObject);
      const deserialized = JSON.parse(serialized);
      
      expect(deserialized.id).toBe(permission.id);
      expect(deserialized.level).toBe("admin");
    });
  });
});
