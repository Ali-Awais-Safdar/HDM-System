import { describe, it, expect, vi, beforeEach } from "vitest";
import { DownloadDocumentUseCase } from "../../../src/application/use-cases/download-document.use-case";
import { Document } from "../../../src/domain/entities/document.entity";
import { DownloadToken } from "../../../src/domain/entities/download-token.entity";
import { asDocumentId, asUserId, asMimeType, asFileSize } from "../../../src/shared/types/brand";
import { ok, err } from "../../../src/shared/result/result";

describe("DownloadDocumentUseCase", () => {
  let useCase: DownloadDocumentUseCase;
  let mockDocumentRepository: any;
  let mockDownloadTokenRepository: any;
  let mockFileStorage: any;

  beforeEach(() => {
    mockDocumentRepository = {
      findById: vi.fn(),
    };

    mockDownloadTokenRepository = {
      findByToken: vi.fn(),
      update: vi.fn(),
    };

    mockFileStorage = {
      retrieve: vi.fn(),
    };

    useCase = new DownloadDocumentUseCase(
      mockDocumentRepository,
      mockDownloadTokenRepository,
      mockFileStorage
    );
  });

  const mockDocument = Document.create({
    id: asDocumentId("doc-123"),
    ownerId: asUserId("owner-456"),
    title: "Test Document.pdf",
    mimeType: asMimeType("application/pdf"),
    size: asFileSize(1024),
    storageKey: "storage/documents/doc-123.pdf",
    metadata: {},
    tags: [],
  });

  const mockToken = DownloadToken.create({
    documentId: asDocumentId("doc-123"),
    issuedTo: asUserId("user-456"),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
  });

  const mockFileData = Buffer.from("PDF file content");

  describe("execute", () => {
    it("should download document successfully with valid token", async () => {
      const params = { token: mockToken.token };

      // Mock token validation and consumption
      const usedToken = mockToken.markAsUsed();
      mockDownloadTokenRepository.findByToken.mockResolvedValue(ok(mockToken));
      mockDownloadTokenRepository.update.mockResolvedValue(ok(usedToken));

      // Mock document retrieval
      mockDocumentRepository.findById.mockResolvedValue(ok(mockDocument));

      // Mock file retrieval
      mockFileStorage.retrieve.mockResolvedValue(ok(mockFileData));

      const result = await useCase.execute(params);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.document).toBe(mockDocument);
        expect(result.value.fileData).toBe(mockFileData);
        expect(result.value.token).toBe(mockToken.token);
        expect(result.value.downloadedAt).toBeInstanceOf(Date);
        expect(result.value.message).toBe("Document downloaded successfully");
      }

      // Verify token was marked as used (check the call structure, not exact object)
      expect(mockDownloadTokenRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockToken.id,
          token: mockToken.token,
          documentId: mockToken.documentId,
          issuedTo: mockToken.issuedTo,
          usedAt: expect.any(Date),
        })
      );
    });

    it("should fail with invalid token", async () => {
      const params = { token: "invalid-token" };

      // Mock token not found
      mockDownloadTokenRepository.findByToken.mockResolvedValue(ok(null));

      const result = await useCase.execute(params);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_TOKEN");
        expect(result.error.message).toBe("Download token not found");
      }
    });

    it("should fail with expired token", async () => {
      const expiredToken = DownloadToken.create({
        documentId: asDocumentId("doc-123"),
        issuedTo: asUserId("user-456"),
        expiresAt: new Date("2022-12-31T10:00:00Z"), // Expired
      });

      const params = { token: expiredToken.token };

      // Mock expired token found
      mockDownloadTokenRepository.findByToken.mockResolvedValue(ok(expiredToken));

      const result = await useCase.execute(params);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("TOKEN_EXPIRED");
        expect(result.error.message).toBe("Download token has expired");
      }
    });

    it("should handle clock-skew tolerance for recently expired tokens", async () => {
      // Create a token that expired 30 seconds ago
      const recentlyExpiredToken = DownloadToken.create({
        documentId: asDocumentId("doc-123"),
        issuedTo: asUserId("user-456"),
        expiresAt: new Date(Date.now() - 30000), // 30 seconds ago
      });

      const params = { token: recentlyExpiredToken.token };

      // Mock token found
      mockDownloadTokenRepository.findByToken.mockResolvedValue(ok(recentlyExpiredToken));
      
      // Mock successful token update (mark as used)
      const usedToken = recentlyExpiredToken.markAsUsed();
      mockDownloadTokenRepository.update.mockResolvedValue(ok(usedToken));
      
      // Mock document and file retrieval
      mockDocumentRepository.findById.mockResolvedValue(ok(mockDocument));
      mockFileStorage.retrieve.mockResolvedValue(ok(mockFileData));

      const result = await useCase.execute(params);

      // Should succeed due to clock-skew tolerance (default 30 seconds)
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.document).toBe(mockDocument);
        expect(result.value.fileData).toBe(mockFileData);
      }
    });

    it("should fail with already used token", async () => {
      const usedToken = mockToken.markAsUsed();
      const params = { token: usedToken.token };

      // Mock used token found
      mockDownloadTokenRepository.findByToken.mockResolvedValue(ok(usedToken));

      const result = await useCase.execute(params);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("TOKEN_ALREADY_USED");
        expect(result.error.message).toBe("Download token has already been used");
      }
    });

    it("should handle token repository error", async () => {
      const params = { token: mockToken.token };

      // Mock repository error
      mockDownloadTokenRepository.findByToken.mockResolvedValue(err(new Error("DB error")));

      const result = await useCase.execute(params);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("TOKEN_VALIDATION_FAILED");
      }
    });

    it("should handle document not found", async () => {
      const params = { token: mockToken.token };

      // Mock valid token
      const usedToken = mockToken.markAsUsed();
      mockDownloadTokenRepository.findByToken.mockResolvedValue(ok(mockToken));
      mockDownloadTokenRepository.update.mockResolvedValue(ok(usedToken));

      // Mock document not found
      mockDocumentRepository.findById.mockResolvedValue(ok(null));

      const result = await useCase.execute(params);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DOCUMENT_NOT_FOUND");
      }
    });

    it("should handle document repository error", async () => {
      const params = { token: mockToken.token };

      // Mock valid token
      const usedToken = mockToken.markAsUsed();
      mockDownloadTokenRepository.findByToken.mockResolvedValue(ok(mockToken));
      mockDownloadTokenRepository.update.mockResolvedValue(ok(usedToken));

      // Mock document repository error
      mockDocumentRepository.findById.mockResolvedValue(err(new Error("DB error")));

      const result = await useCase.execute(params);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DOCUMENT_NOT_FOUND");
      }
    });

    it("should handle file retrieval failure", async () => {
      const params = { token: mockToken.token };

      // Mock valid token and document
      const usedToken = mockToken.markAsUsed();
      mockDownloadTokenRepository.findByToken.mockResolvedValue(ok(mockToken));
      mockDownloadTokenRepository.update.mockResolvedValue(ok(usedToken));
      mockDocumentRepository.findById.mockResolvedValue(ok(mockDocument));

      // Mock file retrieval error
      mockFileStorage.retrieve.mockResolvedValue(err(new Error("File not found")));

      const result = await useCase.execute(params);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("FILE_RETRIEVAL_FAILED");
        expect(result.error.message).toBe("Failed to retrieve file from storage");
      }
    });

    it("should handle token update failure", async () => {
      const params = { token: mockToken.token };

      // Mock valid token
      mockDownloadTokenRepository.findByToken.mockResolvedValue(ok(mockToken));

      // Mock token update failure
      mockDownloadTokenRepository.update.mockResolvedValue(err(new Error("Update failed")));

      const result = await useCase.execute(params);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("TOKEN_VALIDATION_FAILED");
      }
    });

    it("should handle unexpected errors", async () => {
      const params = { token: mockToken.token };

      // Mock a valid token and successful repository calls, but break something later
      const usedToken = mockToken.markAsUsed();
      mockDownloadTokenRepository.findByToken.mockResolvedValue(ok(mockToken));
      mockDownloadTokenRepository.update.mockResolvedValue(ok(usedToken));
      mockDocumentRepository.findById.mockResolvedValue(ok(mockDocument));
      
      // Mock file storage to throw an unexpected error (not return an error result)
      mockFileStorage.retrieve.mockImplementation(() => {
        throw new Error("Unexpected synchronous error");
      });

      const result = await useCase.execute(params);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNKNOWN_ERROR");
        expect(result.error.message).toBe("Unexpected error during document download");
      }
    });

    it("should verify token consumption order", async () => {
      const params = { token: mockToken.token };

      // Mock successful flow
      const usedToken = mockToken.markAsUsed();
      mockDownloadTokenRepository.findByToken.mockResolvedValue(ok(mockToken));
      mockDownloadTokenRepository.update.mockResolvedValue(ok(usedToken));
      mockDocumentRepository.findById.mockResolvedValue(ok(mockDocument));
      mockFileStorage.retrieve.mockResolvedValue(ok(mockFileData));

      await useCase.execute(params);

      // Verify the order of operations
      expect(mockDownloadTokenRepository.findByToken).toHaveBeenCalledBefore(mockDownloadTokenRepository.update);
      expect(mockDownloadTokenRepository.update).toHaveBeenCalledBefore(mockDocumentRepository.findById);
      expect(mockDocumentRepository.findById).toHaveBeenCalledBefore(mockFileStorage.retrieve);
    });
  });
});
