import { describe, it, expect, vi, beforeEach } from "vitest";
import { SearchDocumentsUseCase, SearchDocumentsParams } from "../../../src/application/use-cases/search-documents.use-case";
import { DocumentRepository } from "../../../src/domain/services/document.service";
import { Document } from "../../../src/domain/entities/document.entity";
import { asDocumentId, asUserId, asMimeType, asFileSize } from "../../../src/shared/types/brand";
import { ok, err } from "../../../src/shared/result/result";

describe("SearchDocumentsUseCase", () => {
  let mockRepository: DocumentRepository;
  let useCase: SearchDocumentsUseCase;

  beforeEach(() => {
    mockRepository = {
      findById: vi.fn(),
      findByOwner: vi.fn(),
      search: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
      saveInTransaction: vi.fn(),
      deleteInTransaction: vi.fn(),
      executeInTransaction: vi.fn(),
    };
    useCase = new SearchDocumentsUseCase(mockRepository);
  });

  const createMockDocument = (id: string, ownerId: string, title: string) => {
    return Document.create({
      id: asDocumentId(id),
      ownerId: asUserId(ownerId),
      title,
      mimeType: asMimeType("application/pdf"),
      size: asFileSize(1024),
      storageKey: `documents/${id}.pdf`,
      metadata: { department: "finance" },
      tags: ["urgent", "report"]
    });
  };

  describe("execute", () => {
    it("should search documents successfully with basic query", async () => {
      const mockDocuments = [
        createMockDocument("doc1", "user1", "Financial Report"),
        createMockDocument("doc2", "user1", "Budget Analysis"),
      ];

      vi.mocked(mockRepository.search).mockResolvedValue(ok(mockDocuments));

      const params: SearchDocumentsParams = {
        query: "financial",
        limit: 20,
        offset: 0,
      };

      const result = await useCase.execute("user1", "user", params);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents).toHaveLength(2);
        expect(result.value.documents[0]?.title).toBe("Financial Report");
        expect(result.value.pagination.limit).toBe(20);
        expect(result.value.pagination.offset).toBe(0);
        expect(result.value.appliedFilters.query).toBe("financial");
      }

      expect(mockRepository.search).toHaveBeenCalledWith({
        query: "financial",
        limit: 20,
        offset: 0,
        ownerId: asUserId("user1"), // Regular users can only see their own documents
        tags: undefined,
        metadata: undefined,
      });
    });

    it("should search with tags filter", async () => {
      const mockDocuments = [createMockDocument("doc1", "user1", "Report")];
      vi.mocked(mockRepository.search).mockResolvedValue(ok(mockDocuments));

      const params: SearchDocumentsParams = {
        tags: ["urgent", "finance"],
        limit: 10,
        offset: 0,
      };

      const result = await useCase.execute("user1", "user", params);

      expect(result.ok).toBe(true);
      expect(mockRepository.search).toHaveBeenCalledWith({
        query: undefined,
        tags: ["urgent", "finance"],
        limit: 10,
        offset: 0,
        ownerId: asUserId("user1"),
        metadata: undefined,
      });
    });

    it("should search with metadata filter", async () => {
      const mockDocuments = [createMockDocument("doc1", "user1", "Report")];
      vi.mocked(mockRepository.search).mockResolvedValue(ok(mockDocuments));

      const params: SearchDocumentsParams = {
        metadata: { department: "finance", status: "active" },
        limit: 20,
        offset: 0,
      };

      const result = await useCase.execute("user1", "user", params);

      expect(result.ok).toBe(true);
      expect(mockRepository.search).toHaveBeenCalledWith({
        query: undefined,
        tags: undefined,
        metadata: { department: "finance", status: "active" },
        limit: 20,
        offset: 0,
        ownerId: asUserId("user1"),
      });
    });

    it("should allow admins to search all documents", async () => {
      const mockDocuments = [
        createMockDocument("doc1", "user1", "Report 1"),
        createMockDocument("doc2", "user2", "Report 2"),
      ];
      vi.mocked(mockRepository.search).mockResolvedValue(ok(mockDocuments));

      const params: SearchDocumentsParams = {
        query: "report",
        limit: 20,
        offset: 0,
      };

      const result = await useCase.execute("admin1", "admin", params);

      expect(result.ok).toBe(true);
      expect(mockRepository.search).toHaveBeenCalledWith({
        query: "report",
        limit: 20,
        offset: 0,
        ownerId: undefined, // Admins can see all documents
        tags: undefined,
        metadata: undefined,
      });
    });

    it("should apply pagination limits", async () => {
      const mockDocuments = Array(50).fill(null).map((_, i) => 
        createMockDocument(`doc${i}`, "user1", `Document ${i}`)
      );
      vi.mocked(mockRepository.search).mockResolvedValue(ok(mockDocuments));

      const params: SearchDocumentsParams = {
        limit: 150, // Should be capped at 100
        offset: 10,
      };

      const result = await useCase.execute("user1", "user", params);

      expect(result.ok).toBe(true);
      expect(mockRepository.search).toHaveBeenCalledWith({
        query: undefined,
        limit: 100, // Capped at maximum
        offset: 10,
        ownerId: asUserId("user1"),
        tags: undefined,
        metadata: undefined,
      });
    });

    it("should handle negative offset", async () => {
      const mockDocuments = [createMockDocument("doc1", "user1", "Report")];
      vi.mocked(mockRepository.search).mockResolvedValue(ok(mockDocuments));

      const params: SearchDocumentsParams = {
        offset: -5, // Should be set to 0
      };

      const result = await useCase.execute("user1", "user", params);

      expect(result.ok).toBe(true);
      expect(mockRepository.search).toHaveBeenCalledWith({
        query: undefined,
        limit: 20, // Default
        offset: 0, // Corrected from negative
        ownerId: asUserId("user1"),
        tags: undefined,
        metadata: undefined,
      });
    });

    it("should filter out empty tags", async () => {
      const mockDocuments = [createMockDocument("doc1", "user1", "Report")];
      vi.mocked(mockRepository.search).mockResolvedValue(ok(mockDocuments));

      const params: SearchDocumentsParams = {
        tags: ["urgent", "", "  ", "finance"], // Empty and whitespace tags
      };

      const result = await useCase.execute("user1", "user", params);

      expect(result.ok).toBe(true);
      expect(mockRepository.search).toHaveBeenCalledWith({
        query: undefined,
        tags: ["urgent", "finance"], // Empty tags filtered out
        limit: 20,
        offset: 0,
        ownerId: asUserId("user1"),
        metadata: undefined,
      });
    });

    it("should trim query strings", async () => {
      const mockDocuments = [createMockDocument("doc1", "user1", "Report")];
      vi.mocked(mockRepository.search).mockResolvedValue(ok(mockDocuments));

      const params: SearchDocumentsParams = {
        query: "  financial report  ",
      };

      const result = await useCase.execute("user1", "user", params);

      expect(result.ok).toBe(true);
      expect(mockRepository.search).toHaveBeenCalledWith({
        query: "financial report", // Trimmed
        limit: 20,
        offset: 0,
        ownerId: asUserId("user1"),
        tags: undefined,
        metadata: undefined,
      });
    });

    it("should handle repository search failure", async () => {
      vi.mocked(mockRepository.search).mockResolvedValue(err(new Error("Database error")));

      const params: SearchDocumentsParams = {
        query: "test",
      };

      const result = await useCase.execute("user1", "user", params);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Failed to search documents");
        expect(result.error.code).toBe("SEARCH_FAILED");
      }
    });

    it("should handle unexpected errors", async () => {
      vi.mocked(mockRepository.search).mockRejectedValue(new Error("Unexpected error"));

      const params: SearchDocumentsParams = {
        query: "test",
      };

      const result = await useCase.execute("user1", "user", params);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Unexpected error during search");
        expect(result.error.code).toBe("INTERNAL_ERROR");
      }
    });

    it("should calculate hasMore correctly", async () => {
      // Return exactly the limit number of documents
      const mockDocuments = Array(10).fill(null).map((_, i) => 
        createMockDocument(`doc${i}`, "user1", `Document ${i}`)
      );
      vi.mocked(mockRepository.search).mockResolvedValue(ok(mockDocuments));

      const params: SearchDocumentsParams = {
        limit: 10,
      };

      const result = await useCase.execute("user1", "user", params);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pagination.hasMore).toBe(true); // Same as limit, so might have more
        expect(result.value.pagination.total).toBe(10);
      }
    });

    it("should set hasMore to false when fewer results than limit", async () => {
      // Return fewer documents than the limit
      const mockDocuments = Array(5).fill(null).map((_, i) => 
        createMockDocument(`doc${i}`, "user1", `Document ${i}`)
      );
      vi.mocked(mockRepository.search).mockResolvedValue(ok(mockDocuments));

      const params: SearchDocumentsParams = {
        limit: 10,
      };

      const result = await useCase.execute("user1", "user", params);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pagination.hasMore).toBe(false); // Less than limit, no more
        expect(result.value.pagination.total).toBe(5);
      }
    });
  });
});
