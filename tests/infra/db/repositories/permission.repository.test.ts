import { describe, it, expect, vi, beforeEach } from "vitest";
import { DrizzlePermissionRepository } from "../../../../src/infra/db/repositories/permission.repository";
import { Permission } from "../../../../src/domain/entities/permission.entity";
import { asDocumentId, asUserId } from "../../../../src/shared/types/brand";

describe("DrizzlePermissionRepository", () => {
  let repository: DrizzlePermissionRepository;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    };

    repository = new DrizzlePermissionRepository(mockDb);
  });

  const mockPermission = Permission.create({
    documentId: asDocumentId("doc-123"),
    userId: asUserId("user-456"),
    level: "read",
  });

  describe("save", () => {
    it("should save a new permission successfully", async () => {
      mockDb.insert.mockReturnValue(mockDb);
      mockDb.values.mockResolvedValue(undefined);

      const result = await repository.save(mockPermission);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(mockPermission);
      }
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith({
        id: mockPermission.id,
        documentId: mockPermission.documentId,
        userId: mockPermission.userId,
        permission: mockPermission.level,
        createdAt: mockPermission.createdAt,
      });
    });

    it("should handle duplicate key error", async () => {
      const duplicateError = new Error("duplicate key");
      mockDb.insert.mockReturnValue(mockDb);
      mockDb.values.mockRejectedValue(duplicateError);

      const result = await repository.save(mockPermission);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PERMISSION_ALREADY_EXISTS");
        expect(result.error.message).toContain("Permission already exists");
      }
    });

    it("should handle database errors", async () => {
      const dbError = new Error("Database connection failed");
      mockDb.insert.mockReturnValue(mockDb);
      mockDb.values.mockRejectedValue(dbError);

      const result = await repository.save(mockPermission);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DATABASE_ERROR");
      }
    });
  });

  describe("findByDocumentAndUser", () => {
    it("should find existing permission", async () => {
      const mockRow = {
        id: "perm-123",
        documentId: "doc-123",
        userId: "user-456",
        permission: "read",
        createdAt: new Date(),
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([mockRow]);

      const result = await repository.findByDocumentAndUser(
        asDocumentId("doc-123"),
        asUserId("user-456")
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        expect(result.value?.level).toBe("read");
      }
    });

    it("should return null when permission not found", async () => {
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.findByDocumentAndUser(
        asDocumentId("doc-123"),
        asUserId("user-456")
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it("should handle database errors", async () => {
      const dbError = new Error("Database query failed");
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockRejectedValue(dbError);

      const result = await repository.findByDocumentAndUser(
        asDocumentId("doc-123"),
        asUserId("user-456")
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DATABASE_ERROR");
      }
    });
  });

  describe("findByDocument", () => {
    it("should find all permissions for a document", async () => {
      const mockRows = [
        {
          id: "perm-1",
          documentId: "doc-123",
          userId: "user-1",
          permission: "read",
          createdAt: new Date(),
        },
        {
          id: "perm-2",
          documentId: "doc-123",
          userId: "user-2",
          permission: "write",
          createdAt: new Date(),
        },
      ];

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue(mockRows);

      const result = await repository.findByDocument(asDocumentId("doc-123"));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]?.level).toBe("read");
        expect(result.value[1]?.level).toBe("write");
      }
    });

    it("should return empty array when no permissions found", async () => {
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue([]);

      const result = await repository.findByDocument(asDocumentId("doc-123"));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });
  });

  describe("findByUser", () => {
    it("should find all permissions for a user", async () => {
      const mockRows = [
        {
          id: "perm-1",
          documentId: "doc-1",
          userId: "user-123",
          permission: "read",
          createdAt: new Date(),
        },
        {
          id: "perm-2",
          documentId: "doc-2",
          userId: "user-123",
          permission: "admin",
          createdAt: new Date(),
        },
      ];

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue(mockRows);

      const result = await repository.findByUser(asUserId("user-123"));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]?.level).toBe("read");
        expect(result.value[1]?.level).toBe("admin");
      }
    });
  });

  describe("removeByDocumentAndUser", () => {
    it("should remove permission successfully", async () => {
      mockDb.delete.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue({ rowCount: 1 });

      const result = await repository.removeByDocumentAndUser(
        asDocumentId("doc-123"),
        asUserId("user-456")
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    });

    it("should return false when no permission found to remove", async () => {
      mockDb.delete.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue({ rowCount: 0 });

      const result = await repository.removeByDocumentAndUser(
        asDocumentId("doc-123"),
        asUserId("user-456")
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });

    it("should handle null rowCount", async () => {
      mockDb.delete.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue({ rowCount: null });

      const result = await repository.removeByDocumentAndUser(
        asDocumentId("doc-123"),
        asUserId("user-456")
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });
  });

  describe("removeByDocument", () => {
    it("should remove all permissions for a document", async () => {
      mockDb.delete.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue({ rowCount: 3 });

      const result = await repository.removeByDocument(asDocumentId("doc-123"));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(3);
      }
    });

    it("should handle no permissions to remove", async () => {
      mockDb.delete.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue({ rowCount: null });

      const result = await repository.removeByDocument(asDocumentId("doc-123"));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(0);
      }
    });
  });

  describe("updatePermissionLevel", () => {
    it("should update permission level successfully", async () => {
      const updatedRow = {
        id: "perm-123",
        documentId: "doc-123",
        userId: "user-456",
        permission: "write",
        createdAt: new Date(),
      };

      mockDb.update.mockReturnValue(mockDb);
      mockDb.set.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.returning.mockResolvedValue([updatedRow]);

      const result = await repository.updatePermissionLevel(
        asDocumentId("doc-123"),
        asUserId("user-456"),
        "write"
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value?.level).toBe("write");
      }
    });

    it("should handle permission not found for update", async () => {
      mockDb.update.mockReturnValue(mockDb);
      mockDb.set.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.returning.mockResolvedValue([]);

      const result = await repository.updatePermissionLevel(
        asDocumentId("doc-123"),
        asUserId("user-456"),
        "write"
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PERMISSION_NOT_FOUND");
      }
    });

    it("should handle database errors during update", async () => {
      const dbError = new Error("Update failed");
      mockDb.update.mockReturnValue(mockDb);
      mockDb.set.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.returning.mockRejectedValue(dbError);

      const result = await repository.updatePermissionLevel(
        asDocumentId("doc-123"),
        asUserId("user-456"),
        "write"
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DATABASE_ERROR");
      }
    });
  });
});
