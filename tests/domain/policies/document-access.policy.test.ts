import { describe, it, expect } from "vitest";
import { 
  DocumentAccessPolicy, 
  DocumentAccessContext 
} from "../../../src/domain/policies/document-access.policy";
import { Permission } from "../../../src/domain/entities/permission.entity";
import { asDocumentId, asUserId } from "../../../src/shared/types/brand";
import { UserRole } from "../../../src/domain/entities/user.entity";

describe("DocumentAccessPolicy", () => {
  const mockDocumentId = asDocumentId("doc-123");
  const mockOwnerId = asUserId("owner-456");
  const mockUserId = asUserId("user-789");
  // const mockAdminId = asUserId("admin-101"); // Unused for now

  const createContext = (
    userId: string,
    userRole: UserRole,
    permissions: Permission[] = []
  ): DocumentAccessContext => ({
    userId: asUserId(userId),
    userRole,
    documentId: mockDocumentId,
    documentOwnerId: mockOwnerId,
    userPermissions: permissions,
  });

  describe("canAccess", () => {
    describe("Admin access", () => {
      it("should grant admin full access to any document", () => {
        const context = createContext("admin-101", "admin");

        const readResult = DocumentAccessPolicy.canAccess(context, "read");
        const writeResult = DocumentAccessPolicy.canAccess(context, "write");
        const adminResult = DocumentAccessPolicy.canAccess(context, "admin");

        expect(readResult.granted).toBe(true);
        expect(readResult.reason).toContain("Admin role bypasses");
        expect(readResult.effectiveLevel).toBe("admin");

        expect(writeResult.granted).toBe(true);
        expect(adminResult.granted).toBe(true);
      });
    });

    describe("Owner access", () => {
      it("should grant document owner full access", () => {
        const context = createContext(mockOwnerId, "user");

        const readResult = DocumentAccessPolicy.canAccess(context, "read");
        const writeResult = DocumentAccessPolicy.canAccess(context, "write");
        const adminResult = DocumentAccessPolicy.canAccess(context, "admin");

        expect(readResult.granted).toBe(true);
        expect(readResult.reason).toContain("Document owner has full access");
        expect(readResult.effectiveLevel).toBe("admin");

        expect(writeResult.granted).toBe(true);
        expect(adminResult.granted).toBe(true);
      });
    });

    describe("Permission-based access", () => {
      it("should grant access based on explicit read permission", () => {
        const readPermission = Permission.create({
          documentId: mockDocumentId,
          userId: mockUserId,
          level: "read",
        });

        const context = createContext("user-789", "user", [readPermission]);

        const readResult = DocumentAccessPolicy.canAccess(context, "read");
        const writeResult = DocumentAccessPolicy.canAccess(context, "write");

        expect(readResult.granted).toBe(true);
        expect(readResult.reason).toContain("Explicit permission grants read access");
        expect(readResult.effectiveLevel).toBe("read");

        expect(writeResult.granted).toBe(false);
        expect(writeResult.reason).toContain("Insufficient permission: has read, requires write");
      });

      it("should grant access based on explicit write permission", () => {
        const writePermission = Permission.create({
          documentId: mockDocumentId,
          userId: mockUserId,
          level: "write",
        });

        const context = createContext("user-789", "user", [writePermission]);

        const readResult = DocumentAccessPolicy.canAccess(context, "read");
        const writeResult = DocumentAccessPolicy.canAccess(context, "write");
        const adminResult = DocumentAccessPolicy.canAccess(context, "admin");

        expect(readResult.granted).toBe(true);
        expect(writeResult.granted).toBe(true);
        expect(writeResult.reason).toContain("Explicit permission grants write access");
        expect(writeResult.effectiveLevel).toBe("write");

        expect(adminResult.granted).toBe(false);
      });

      it("should grant access based on explicit admin permission", () => {
        const adminPermission = Permission.create({
          documentId: mockDocumentId,
          userId: mockUserId,
          level: "admin",
        });

        const context = createContext("user-789", "user", [adminPermission]);

        const readResult = DocumentAccessPolicy.canAccess(context, "read");
        const writeResult = DocumentAccessPolicy.canAccess(context, "write");
        const adminResult = DocumentAccessPolicy.canAccess(context, "admin");

        expect(readResult.granted).toBe(true);
        expect(writeResult.granted).toBe(true);
        expect(adminResult.granted).toBe(true);
        expect(adminResult.reason).toContain("Explicit permission grants admin access");
        expect(adminResult.effectiveLevel).toBe("admin");
      });

      it("should use highest permission when multiple permissions exist", () => {
        const readPermission = Permission.create({
          documentId: mockDocumentId,
          userId: mockUserId,
          level: "read",
        });

        const adminPermission = Permission.create({
          documentId: mockDocumentId,
          userId: mockUserId,
          level: "admin",
        });

        const context = createContext("user-789", "user", [readPermission, adminPermission]);

        const adminResult = DocumentAccessPolicy.canAccess(context, "admin");

        expect(adminResult.granted).toBe(true);
        expect(adminResult.reason).toContain("Explicit permission grants admin access");
        expect(adminResult.effectiveLevel).toBe("admin");
      });
    });

    describe("Default deny", () => {
      it("should deny access when no permissions exist", () => {
        const context = createContext("user-999", "user");

        const readResult = DocumentAccessPolicy.canAccess(context, "read");

        expect(readResult.granted).toBe(false);
        expect(readResult.reason).toContain("No explicit permissions found");
        expect(readResult.effectiveLevel).toBeUndefined();
      });
    });
  });

  describe("canRead", () => {
    it("should be a convenience method for read access", () => {
      const readPermission = Permission.create({
        documentId: mockDocumentId,
        userId: mockUserId,
        level: "read",
      });

      const context = createContext("user-789", "user", [readPermission]);
      const result = DocumentAccessPolicy.canRead(context);

      expect(result.granted).toBe(true);
      expect(result.effectiveLevel).toBe("read");
    });
  });

  describe("canWrite", () => {
    it("should be a convenience method for write access", () => {
      const readPermission = Permission.create({
        documentId: mockDocumentId,
        userId: mockUserId,
        level: "read",
      });

      const context = createContext("user-789", "user", [readPermission]);
      const result = DocumentAccessPolicy.canWrite(context);

      expect(result.granted).toBe(false);
    });
  });

  describe("canAdmin", () => {
    it("should be a convenience method for admin access", () => {
      const writePermission = Permission.create({
        documentId: mockDocumentId,
        userId: mockUserId,
        level: "write",
      });

      const context = createContext("user-789", "user", [writePermission]);
      const result = DocumentAccessPolicy.canAdmin(context);

      expect(result.granted).toBe(false);
    });
  });

  describe("canShare", () => {
    it("should require admin-level access", () => {
      const writePermission = Permission.create({
        documentId: mockDocumentId,
        userId: mockUserId,
        level: "write",
      });

      const context = createContext("user-789", "user", [writePermission]);
      const result = DocumentAccessPolicy.canShare(context);

      expect(result.granted).toBe(false);
    });

    it("should allow sharing with admin permission", () => {
      const adminPermission = Permission.create({
        documentId: mockDocumentId,
        userId: mockUserId,
        level: "admin",
      });

      const context = createContext("user-789", "user", [adminPermission]);
      const result = DocumentAccessPolicy.canShare(context);

      expect(result.granted).toBe(true);
    });
  });

  describe("getEffectivePermissionLevel", () => {
    it("should return admin for document owner", () => {
      const context = createContext(mockOwnerId, "user");
      const level = DocumentAccessPolicy.getEffectivePermissionLevel(context);
      expect(level).toBe("admin");
    });

    it("should return admin for admin users", () => {
      const context = createContext("admin-101", "admin");
      const level = DocumentAccessPolicy.getEffectivePermissionLevel(context);
      expect(level).toBe("admin");
    });

    it("should return the highest explicit permission level", () => {
      const writePermission = Permission.create({
        documentId: mockDocumentId,
        userId: mockUserId,
        level: "write",
      });

      const context = createContext("user-789", "user", [writePermission]);
      const level = DocumentAccessPolicy.getEffectivePermissionLevel(context);
      expect(level).toBe("write");
    });

    it("should return null when no access is granted", () => {
      const context = createContext("user-999", "user");
      const level = DocumentAccessPolicy.getEffectivePermissionLevel(context);
      expect(level).toBeNull();
    });
  });
});
