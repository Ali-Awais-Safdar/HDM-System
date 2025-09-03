import { describe, it, expect, vi, beforeEach } from "vitest";
import { GenerateDownloadLinkUseCase } from "../../../src/application/use-cases/generate-download-link.use-case";
import { Document } from "../../../src/domain/entities/document.entity";
import { Permission } from "../../../src/domain/entities/permission.entity";
import { DownloadToken } from "../../../src/domain/entities/download-token.entity";
import { asDocumentId, asUserId, asMimeType, asFileSize } from "../../../src/shared/types/brand";
import { ok, err } from "../../../src/shared/result/result";

describe("GenerateDownloadLinkUseCase", () => {
  let useCase: GenerateDownloadLinkUseCase;
  let mockDocumentRepository: any;
  let mockPermissionRepository: any;
  let mockDownloadTokenRepository: any;

  beforeEach(() => {
    mockDocumentRepository = {
      findById: vi.fn(),
    };

    mockPermissionRepository = {
      findByDocumentAndUser: vi.fn(),
    };

    mockDownloadTokenRepository = {
      save: vi.fn(),
    };

    useCase = new GenerateDownloadLinkUseCase(
      mockDocumentRepository,
      mockPermissionRepository,
      mockDownloadTokenRepository
    );
  });

  const mockDocument = Document.create({
    id: asDocumentId("doc-123"),
    ownerId: asUserId("owner-456"),
    title: "Test Document.pdf",
    mimeType: asMimeType("application/pdf"),
    size: asFileSize(1024),
    storageKey: "test-key",
    metadata: {},
    tags: [],
  });

  describe("execute", () => {
    it("should allow document owner to generate download link", async () => {
      const params = {
        documentId: asDocumentId("doc-123"),
        expiresAt: new Date("2023-01-01T10:05:00Z"),
      };

      // Mock document exists
      mockDocumentRepository.findById.mockResolvedValue(ok(mockDocument));
      
      // Mock requester has no explicit permissions (but is owner)
      mockPermissionRepository.findByDocumentAndUser.mockResolvedValue(ok(null));
      
      // Mock token creation
      const mockToken = DownloadToken.create({
        documentId: params.documentId,
        issuedTo: asUserId("owner-456"),
        expiresAt: params.expiresAt!,
      });
      mockDownloadTokenRepository.save.mockResolvedValue(ok(mockToken));

      const result = await useCase.execute(
        asUserId("owner-456"), // requester is owner
        "user",
        params
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.url).toBe(`/downloads/${mockToken.token}`);
        expect(result.value.documentId).toBe(params.documentId);
        expect(result.value.issuedTo).toBe(asUserId("owner-456"));
        expect(result.value.expiresAt).toBe(params.expiresAt);
      }
    });

    it("should allow admin to generate download link for any document", async () => {
      const params = {
        documentId: asDocumentId("doc-123"),
      };

      // Mock document exists
      mockDocumentRepository.findById.mockResolvedValue(ok(mockDocument));
      
      // Mock requester permissions
      mockPermissionRepository.findByDocumentAndUser.mockResolvedValue(ok(null));
      
      // Mock token creation
      const mockToken = DownloadToken.createWithDefaultExpiry({
        documentId: params.documentId,
        issuedTo: asUserId("admin-123"),
      });
      mockDownloadTokenRepository.save.mockResolvedValue(ok(mockToken));

      const result = await useCase.execute(
        asUserId("admin-123"), // admin user
        "admin",
        params
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.url).toBe(`/downloads/${mockToken.token}`);
        expect(result.value.issuedTo).toBe(asUserId("admin-123"));
      }
    });

    it("should allow user with read permission to generate download link", async () => {
      const params = {
        documentId: asDocumentId("doc-123"),
      };

      const readPermission = Permission.create({
        documentId: params.documentId,
        userId: asUserId("user-with-read"),
        level: "read",
      });

      // Mock document exists
      mockDocumentRepository.findById.mockResolvedValue(ok(mockDocument));
      
      // Mock requester has read permission
      mockPermissionRepository.findByDocumentAndUser.mockResolvedValue(ok(readPermission));
      
      // Mock token creation
      const mockToken = DownloadToken.createWithDefaultExpiry({
        documentId: params.documentId,
        issuedTo: asUserId("user-with-read"),
      });
      mockDownloadTokenRepository.save.mockResolvedValue(ok(mockToken));

      const result = await useCase.execute(
        asUserId("user-with-read"),
        "user",
        params
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.url).toBe(`/downloads/${mockToken.token}`);
      }
    });

    it("should deny access when user has no permissions", async () => {
      const params = {
        documentId: asDocumentId("doc-123"),
      };

      // Mock document exists
      mockDocumentRepository.findById.mockResolvedValue(ok(mockDocument));
      
      // Mock requester has no permissions
      mockPermissionRepository.findByDocumentAndUser.mockResolvedValue(ok(null));

      const result = await useCase.execute(
        asUserId("unauthorized-user"),
        "user",
        params
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("ACCESS_DENIED");
        expect(result.error.message).toContain("Access denied");
      }
    });

    it("should handle document not found", async () => {
      const params = {
        documentId: asDocumentId("nonexistent-doc"),
      };

      // Mock document not found
      mockDocumentRepository.findById.mockResolvedValue(ok(null));

      const result = await useCase.execute(
        asUserId("owner-456"),
        "user",
        params
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DOCUMENT_NOT_FOUND");
      }
    });

    it("should handle document repository error", async () => {
      const params = {
        documentId: asDocumentId("doc-123"),
      };

      // Mock document repository error
      mockDocumentRepository.findById.mockResolvedValue(err(new Error("Database error")));

      const result = await useCase.execute(
        asUserId("owner-456"),
        "user",
        params
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DOCUMENT_NOT_FOUND");
      }
    });

    it("should handle permission check failure", async () => {
      const params = {
        documentId: asDocumentId("doc-123"),
      };

      // Mock document exists
      mockDocumentRepository.findById.mockResolvedValue(ok(mockDocument));
      
      // Mock permission check failure
      mockPermissionRepository.findByDocumentAndUser.mockResolvedValue(err(new Error("Permission check failed")));

      const result = await useCase.execute(
        asUserId("user-123"),
        "user",
        params
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PERMISSION_CHECK_FAILED");
      }
    });

    it("should handle token generation failure", async () => {
      const params = {
        documentId: asDocumentId("doc-123"),
      };

      // Mock document exists
      mockDocumentRepository.findById.mockResolvedValue(ok(mockDocument));
      
      // Mock requester is owner
      mockPermissionRepository.findByDocumentAndUser.mockResolvedValue(ok(null));
      
      // Mock token generation failure
      mockDownloadTokenRepository.save.mockResolvedValue(err(new Error("Token save failed")));

      const result = await useCase.execute(
        asUserId("owner-456"),
        "user",
        params
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("TOKEN_GENERATION_FAILED");
      }
    });

    it("should handle unexpected errors", async () => {
      const params = {
        documentId: asDocumentId("doc-123"),
      };

      // Mock document repository throws
      mockDocumentRepository.findById.mockRejectedValue(new Error("Unexpected error"));

      const result = await useCase.execute(
        asUserId("owner-456"),
        "user",
        params
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNKNOWN_ERROR");
      }
    });

    it("should use custom expiration time when provided", async () => {
      const customExpiry = new Date("2023-01-01T11:00:00Z"); // 1 hour
      const params = {
        documentId: asDocumentId("doc-123"),
        expiresAt: customExpiry,
      };

      // Mock document exists
      mockDocumentRepository.findById.mockResolvedValue(ok(mockDocument));
      
      // Mock requester is owner
      mockPermissionRepository.findByDocumentAndUser.mockResolvedValue(ok(null));
      
      // Mock token creation
      const mockToken = DownloadToken.create({
        documentId: params.documentId,
        issuedTo: asUserId("owner-456"),
        expiresAt: customExpiry,
      });
      mockDownloadTokenRepository.save.mockResolvedValue(ok(mockToken));

      const result = await useCase.execute(
        asUserId("owner-456"),
        "user",
        params
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.expiresAt).toBe(customExpiry);
      }
    });

    it("should use default expiration when not provided", async () => {
      const params = {
        documentId: asDocumentId("doc-123"),
        // No expiresAt provided
      };

      // Mock document exists
      mockDocumentRepository.findById.mockResolvedValue(ok(mockDocument));
      
      // Mock requester is owner
      mockPermissionRepository.findByDocumentAndUser.mockResolvedValue(ok(null));
      
      // Mock token creation with default expiry
      const mockToken = DownloadToken.createWithDefaultExpiry({
        documentId: params.documentId,
        issuedTo: asUserId("owner-456"),
      });
      mockDownloadTokenRepository.save.mockResolvedValue(ok(mockToken));

      const result = await useCase.execute(
        asUserId("owner-456"),
        "user",
        params
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should have default 5-minute expiration
        expect(result.value.expiresAt).toBe(mockToken.expiresAt);
      }
    });
  });
});
