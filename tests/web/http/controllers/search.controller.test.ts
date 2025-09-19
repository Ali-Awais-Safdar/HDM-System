import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";
import { SearchController } from "../../../../src/web/http/controllers/search.controller";
import { SearchDocumentsUseCase, SearchDocumentsError } from "../../../../src/application/use-cases/search-documents.use-case";
import { Document } from "../../../../src/domain/entities/document.entity";
import { asDocumentId, asUserId, asMimeType, asFileSize } from "../../../../src/shared/types/brand";
import { ok, err } from "../../../../src/shared/result/result";
import { Option } from "effect";

describe("SearchController", () => {
  let mockUseCase: SearchDocumentsUseCase;
  let controller: SearchController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockUseCase = {
      execute: vi.fn(),
    } as unknown as SearchDocumentsUseCase;

    controller = new SearchController(mockUseCase);

    mockRequest = {
      query: {},
      user: {
        id: asUserId("user1"),
        role: "user" as const,
        email: "user1@example.com",
      },
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  const createMockDocument = (id: string, title: string, updatedAt: Option.Option<Date> = Option.none()) => {
    return new Document(
      asDocumentId(id),
      asUserId("user1"),
      title,
      asMimeType("application/pdf"),
      asFileSize(1024),
      `documents/${id}.pdf`,
      { department: "finance" },
      ["urgent", "report"],
      new Date("2023-01-01T10:00:00Z"), // Fixed createdAt for consistent tests
      updatedAt
    );
  };

  describe("searchDocuments", () => {
    it("should handle successful search with basic query", async () => {
      const mockDocuments = [createMockDocument("doc1", "Financial Report")];
      const mockUseCaseResponse = {
        documents: mockDocuments,
        pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
        appliedFilters: { query: "financial" }
      };

      vi.mocked(mockUseCase.execute).mockResolvedValue(ok(mockUseCaseResponse));

      mockRequest.query = { query: "financial" };

      await controller.searchDocuments(mockRequest as Request, mockResponse as Response);

      expect(mockUseCase.execute).toHaveBeenCalledWith(
        "user1",
        "user",
        { query: "financial", limit: 20, offset: 0 }
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        documents: [{
          id: "doc1",
          title: "Financial Report",
          mimeType: "application/pdf",
          size: 1024,
          metadata: { department: "finance" },
          tags: ["urgent", "report"],
          createdAt: "2023-01-01T10:00:00.000Z",
          updatedAt: null,
          ownerId: "user1",
        }],
        pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
        appliedFilters: { query: "financial" }
      });
    });

    it("should handle search with tags parameter", async () => {
      const mockDocuments = [createMockDocument("doc1", "Report")];
      const mockUseCaseResponse = {
        documents: mockDocuments,
        pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
        appliedFilters: { tags: ["urgent", "finance"] }
      };

      vi.mocked(mockUseCase.execute).mockResolvedValue(ok(mockUseCaseResponse));

      mockRequest.query = { tags: "urgent,finance" };

      await controller.searchDocuments(mockRequest as Request, mockResponse as Response);

      expect(mockUseCase.execute).toHaveBeenCalledWith(
        "user1",
        "user",
        { tags: ["urgent", "finance"], limit: 20, offset: 0 }
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it("should handle search with metadata parameter", async () => {
      const mockDocuments = [createMockDocument("doc1", "Report")];
      const mockUseCaseResponse = {
        documents: mockDocuments,
        pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
        appliedFilters: { metadata: { department: "finance" } }
      };

      vi.mocked(mockUseCase.execute).mockResolvedValue(ok(mockUseCaseResponse));

      mockRequest.query = { 
        metadata: JSON.stringify({ department: "finance" })
      };

      await controller.searchDocuments(mockRequest as Request, mockResponse as Response);

      expect(mockUseCase.execute).toHaveBeenCalledWith(
        "user1",
        "user",
        { metadata: { department: "finance" }, limit: 20, offset: 0 }
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it("should handle pagination parameters", async () => {
      const mockDocuments = [createMockDocument("doc1", "Report")];
      const mockUseCaseResponse = {
        documents: mockDocuments,
        pagination: { limit: 10, offset: 20, total: 1, hasMore: false },
        appliedFilters: {}
      };

      vi.mocked(mockUseCase.execute).mockResolvedValue(ok(mockUseCaseResponse));

      mockRequest.query = { limit: "10", offset: "20" };

      await controller.searchDocuments(mockRequest as Request, mockResponse as Response);

      expect(mockUseCase.execute).toHaveBeenCalledWith(
        "user1",
        "user",
        { limit: 10, offset: 20 }
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it("should handle validation errors", async () => {
      mockRequest.query = { limit: "invalid" };

      await controller.searchDocuments(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(422);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: expect.arrayContaining([
          expect.objectContaining({
            field: expect.any(String),
            message: expect.any(String),
          })
        ])
      });
    });

    it("should handle missing authentication", async () => {
      delete mockRequest.user;

      await controller.searchDocuments(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Authentication required",
        code: "UNAUTHORIZED"
      });
    });

    it("should handle use case errors", async () => {
      vi.mocked(mockUseCase.execute).mockResolvedValue(
        err(new SearchDocumentsError("Search failed", "SEARCH_FAILED"))
      );

      mockRequest.query = { query: "test" };

      await controller.searchDocuments(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Search failed",
        code: "SEARCH_FAILED"
      });
    });

    it("should handle invalid params error from use case", async () => {
      vi.mocked(mockUseCase.execute).mockResolvedValue(
        err(new SearchDocumentsError("Invalid parameters", "INVALID_PARAMS"))
      );

      mockRequest.query = { query: "test" };

      await controller.searchDocuments(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Invalid parameters",
        code: "INVALID_PARAMS"
      });
    });

    it("should handle invalid JSON in metadata parameter", async () => {
      mockRequest.query = { metadata: "invalid-json" };

      await controller.searchDocuments(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Invalid JSON in metadata parameter",
        code: "BAD_REQUEST"
      });
    });

    it("should handle unexpected errors", async () => {
      vi.mocked(mockUseCase.execute).mockRejectedValue(new Error("Unexpected error"));

      mockRequest.query = { query: "test" };

      await controller.searchDocuments(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Unexpected error",
        code: "INTERNAL_ERROR"
      });
    });

    it("should parse comma-separated tags correctly", async () => {
      const mockDocuments = [createMockDocument("doc1", "Report")];
      const mockUseCaseResponse = {
        documents: mockDocuments,
        pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
        appliedFilters: { tags: ["urgent", "finance", "report"] }
      };

      vi.mocked(mockUseCase.execute).mockResolvedValue(ok(mockUseCaseResponse));

      mockRequest.query = { tags: "urgent, finance , report" }; // With spaces

      await controller.searchDocuments(mockRequest as Request, mockResponse as Response);

      expect(mockUseCase.execute).toHaveBeenCalledWith(
        "user1",
        "user",
        { tags: ["urgent", "finance", "report"], limit: 20, offset: 0 }
      );
    });

    it("should filter out empty tags from comma-separated list", async () => {
      const mockDocuments = [createMockDocument("doc1", "Report")];
      const mockUseCaseResponse = {
        documents: mockDocuments,
        pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
        appliedFilters: { tags: ["urgent", "finance"] }
      };

      vi.mocked(mockUseCase.execute).mockResolvedValue(ok(mockUseCaseResponse));

      mockRequest.query = { tags: "urgent,,finance," }; // Empty elements

      await controller.searchDocuments(mockRequest as Request, mockResponse as Response);

      expect(mockUseCase.execute).toHaveBeenCalledWith(
        "user1",
        "user",
        { tags: ["urgent", "finance"], limit: 20, offset: 0 }
      );
    });

    it("should handle document with updatedAt timestamp", async () => {
      const updatedDate = new Date("2023-12-01T10:00:00Z");
      const updatedDoc = createMockDocument("doc1", "Updated Report", Option.some(updatedDate));

      const mockUseCaseResponse = {
        documents: [updatedDoc],
        pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
        appliedFilters: { query: "updated" }
      };

      vi.mocked(mockUseCase.execute).mockResolvedValue(ok(mockUseCaseResponse));

      mockRequest.query = { query: "updated" };

      await controller.searchDocuments(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        documents: [{
          id: "doc1",
          title: "Updated Report",
          mimeType: "application/pdf",
          size: 1024,
          metadata: { department: "finance" },
          tags: ["urgent", "report"],
          createdAt: "2023-01-01T10:00:00.000Z",
          updatedAt: updatedDate.toISOString(),
          ownerId: "user1",
        }],
        pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
        appliedFilters: { query: "updated" }
      });
    });
  });
});
