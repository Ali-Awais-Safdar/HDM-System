import { describe, it, expect, vi, beforeEach } from "vitest";
import { DrizzleDownloadTokenRepository } from "../../../../src/infra/db/repositories/download-token.repository";
import { DownloadToken } from "../../../../src/domain/entities/download-token.entity";
import { asDocumentId, asUserId } from "../../../../src/shared/types/brand";

describe("DrizzleDownloadTokenRepository", () => {
  let repository: DrizzleDownloadTokenRepository;
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

    repository = new DrizzleDownloadTokenRepository(mockDb);
  });

  const mockToken = DownloadToken.create({
    documentId: asDocumentId("doc-123"),
    issuedTo: asUserId("user-456"),
    expiresAt: new Date("2023-01-01T10:05:00Z"),
  });

  describe("save", () => {
    it("should save a new download token successfully", async () => {
      mockDb.insert.mockReturnValue(mockDb);
      mockDb.values.mockResolvedValue(undefined);

      const result = await repository.save(mockToken);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(mockToken);
      }
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith({
        token: mockToken.token,
        documentId: mockToken.documentId,
        issuedTo: mockToken.issuedTo,
        expiresAt: mockToken.expiresAt,
        usedAt: mockToken.usedAt,
        createdAt: mockToken.createdAt,
      });
    });

    it("should handle duplicate token error", async () => {
      const duplicateError = new Error("duplicate key");
      mockDb.insert.mockReturnValue(mockDb);
      mockDb.values.mockRejectedValue(duplicateError);

      const result = await repository.save(mockToken);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("TOKEN_ALREADY_EXISTS");
        expect(result.error.message).toContain("Download token already exists");
      }
    });

    it("should handle database errors", async () => {
      const dbError = new Error("Database connection failed");
      mockDb.insert.mockReturnValue(mockDb);
      mockDb.values.mockRejectedValue(dbError);

      const result = await repository.save(mockToken);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DATABASE_ERROR");
      }
    });
  });

  describe("findByToken", () => {
    it("should find existing token", async () => {
      const mockRow = {
        token: "secure-token-123",
        documentId: "doc-123",
        issuedTo: "user-456",
        expiresAt: new Date("2023-01-01T10:05:00Z"),
        usedAt: null,
        createdAt: new Date("2023-01-01T10:00:00Z"),
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([mockRow]);

      const result = await repository.findByToken("secure-token-123");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        expect(result.value?.token).toBe("secure-token-123");
        expect(result.value?.documentId).toBe("doc-123");
      }
    });

    it("should return null when token not found", async () => {
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.findByToken("nonexistent-token");

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

      const result = await repository.findByToken("token-123");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DATABASE_ERROR");
      }
    });
  });

  describe("findByDocument", () => {
    it("should find all tokens for a document", async () => {
      const mockRows = [
        {
          token: "token-1",
          documentId: "doc-123",
          issuedTo: "user-1",
          expiresAt: new Date("2023-01-01T10:05:00Z"),
          usedAt: null,
          createdAt: new Date("2023-01-01T10:00:00Z"),
        },
        {
          token: "token-2",
          documentId: "doc-123",
          issuedTo: "user-2",
          expiresAt: new Date("2023-01-01T10:10:00Z"),
          usedAt: new Date("2023-01-01T10:02:00Z"),
          createdAt: new Date("2023-01-01T10:01:00Z"),
        },
      ];

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue(mockRows);

      const result = await repository.findByDocument(asDocumentId("doc-123"));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]?.token).toBe("token-1");
        expect(result.value[1]?.token).toBe("token-2");
      }
    });

    it("should return empty array when no tokens found", async () => {
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
    it("should find all tokens for a user", async () => {
      const mockRows = [
        {
          token: "token-1",
          documentId: "doc-1",
          issuedTo: "user-123",
          expiresAt: new Date("2023-01-01T10:05:00Z"),
          usedAt: null,
          createdAt: new Date("2023-01-01T10:00:00Z"),
        },
        {
          token: "token-2",
          documentId: "doc-2",
          issuedTo: "user-123",
          expiresAt: new Date("2023-01-01T10:10:00Z"),
          usedAt: null,
          createdAt: new Date("2023-01-01T10:01:00Z"),
        },
      ];

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue(mockRows);

      const result = await repository.findByUser(asUserId("user-123"));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]?.issuedTo).toBe("user-123");
        expect(result.value[1]?.issuedTo).toBe("user-123");
      }
    });
  });

  describe("update", () => {
    it("should update token successfully", async () => {
      const usedToken = mockToken.markAsUsed();
      const updatedRow = {
        token: usedToken.token,
        documentId: usedToken.documentId,
        issuedTo: usedToken.issuedTo,
        expiresAt: usedToken.expiresAt,
        usedAt: usedToken.usedAt,
        createdAt: usedToken.createdAt,
      };

      mockDb.update.mockReturnValue(mockDb);
      mockDb.set.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.returning.mockResolvedValue([updatedRow]);

      const result = await repository.update(usedToken);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value?.usedAt).not.toBeNull();
      }
    });

    it("should handle token not found for update", async () => {
      const usedToken = mockToken.markAsUsed();

      mockDb.update.mockReturnValue(mockDb);
      mockDb.set.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.returning.mockResolvedValue([]);

      const result = await repository.update(usedToken);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("TOKEN_NOT_FOUND");
      }
    });

    it("should handle database errors during update", async () => {
      const usedToken = mockToken.markAsUsed();
      const dbError = new Error("Update failed");

      mockDb.update.mockReturnValue(mockDb);
      mockDb.set.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.returning.mockRejectedValue(dbError);

      const result = await repository.update(usedToken);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DATABASE_ERROR");
      }
    });
  });

  describe("removeExpiredTokens", () => {
    it("should remove expired tokens successfully", async () => {
      mockDb.delete.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue({ rowCount: 5 });

      const result = await repository.removeExpiredTokens();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(5);
      }
    });

    it("should handle no expired tokens", async () => {
      mockDb.delete.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue({ rowCount: null });

      const result = await repository.removeExpiredTokens();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(0);
      }
    });
  });

  describe("removeByDocument", () => {
    it("should remove all tokens for a document", async () => {
      mockDb.delete.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue({ rowCount: 3 });

      const result = await repository.removeByDocument(asDocumentId("doc-123"));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(3);
      }
    });

    it("should handle no tokens to remove", async () => {
      mockDb.delete.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue({ rowCount: 0 });

      const result = await repository.removeByDocument(asDocumentId("doc-123"));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(0);
      }
    });
  });
});
