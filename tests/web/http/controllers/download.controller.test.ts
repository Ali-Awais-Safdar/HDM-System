import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { DownloadController } from "../../../../src/web/http/controllers/download.controller";
import { GenerateDownloadLinkUseCase } from "../../../../src/application/use-cases/generate-download-link.use-case";
import { DownloadDocumentUseCase } from "../../../../src/application/use-cases/download-document.use-case";
import { ok, err } from "../../../../src/shared/result/result";
import { Document } from "../../../../src/domain/entities/document.entity";
import { DownloadToken } from "../../../../src/domain/entities/download-token.entity";
import { 
  asUserId, 
  asDocumentId, 
  asFileSize,
  asMimeType
} from "../../../../src/shared/types/brand";
import { GenerateDownloadLinkError } from "../../../../src/application/use-cases/generate-download-link.use-case";
import { DownloadDocumentError } from "../../../../src/application/use-cases/download-document.use-case";

// Mock the use cases with proper typing
const mockGenerateDownloadLinkUseCase = {
  execute: vi.fn(),
} as any as GenerateDownloadLinkUseCase;

const mockDownloadDocumentUseCase = {
  execute: vi.fn(),
} as any as DownloadDocumentUseCase;

// Create test app
const app = express();
app.use(express.json());

// Mock authentication middleware
const mockAuthMiddleware = (req: any, _res: any, next: any) => {
  req.user = {
    id: asUserId("user-123"),
    role: "user" as const,
  };
  next();
};

const controller = new DownloadController(
  mockGenerateDownloadLinkUseCase,
  mockDownloadDocumentUseCase
);

// Setup routes
app.post("/documents/:id/download-link", mockAuthMiddleware, controller.generateDownloadLink.bind(controller));
app.get("/downloads/:token", controller.downloadDocument.bind(controller));

// Test data
const mockDocument = Document.create({
  id: asDocumentId("doc-123"),
  title: "Test Document",
  mimeType: asMimeType("application/pdf"),
  size: asFileSize(1024),
  storageKey: "storage/documents/doc-123.pdf",
  ownerId: asUserId("user-123"),
  metadata: {},
  tags: [],
});

const mockToken = DownloadToken.create({
  documentId: asDocumentId("doc-123"),
  issuedTo: asUserId("user-123"),
  expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
});

const mockFileData = Buffer.from("PDF file content");

describe("DownloadController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /documents/:id/download-link", () => {
    it("should generate download link successfully with default expiration", async () => {
      (mockGenerateDownloadLinkUseCase.execute as any).mockResolvedValue(
        ok({
          url: `/downloads/${mockToken.token}`,
          expiresAt: mockToken.expiresAt,
          documentId: "doc-123",
          issuedTo: "user-123",
          message: "Download link generated successfully",
        })
      );

      const response = await request(app)
        .post("/documents/doc-123/download-link")
        .send({}) // Send empty body to use defaults
        .expect(200);

      expect(response.body).toEqual({
        url: `/downloads/${mockToken.token}`,
        expiresAt: mockToken.expiresAt.toISOString(),
        documentId: "doc-123",
        issuedTo: "user-123",
        message: "Download link generated successfully",
      });

      expect(mockGenerateDownloadLinkUseCase.execute).toHaveBeenCalledWith(
        "user-123",
        "user",
        expect.objectContaining({
          documentId: "doc-123",
          expiresAt: expect.any(Date), // Controller calculates default when not provided
        })
      );
    });

    it("should generate download link with custom expiration", async () => {
      const customExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      (mockGenerateDownloadLinkUseCase.execute as any).mockResolvedValue(
        ok({
          url: `/downloads/${mockToken.token}`,
          expiresAt: customExpiresAt,
          documentId: "doc-123",
          issuedTo: "user-123",
          message: "Download link generated successfully",
        })
      );

      const response = await request(app)
        .post("/documents/doc-123/download-link")
        .send({ expiresInMinutes: 10 })
        .expect(200);

      expect(response.body).toEqual({
        url: `/downloads/${mockToken.token}`,
        expiresAt: customExpiresAt.toISOString(),
        documentId: "doc-123",
        issuedTo: "user-123",
        message: "Download link generated successfully",
      });

      expect(mockGenerateDownloadLinkUseCase.execute).toHaveBeenCalledWith(
        "user-123",
        "user",
        expect.objectContaining({
          documentId: "doc-123",
          expiresAt: expect.any(Date),
        })
      );
    });

    it("should handle document not found", async () => {
      (mockGenerateDownloadLinkUseCase.execute as any).mockResolvedValue(
        err(new GenerateDownloadLinkError("Document not found", "DOCUMENT_NOT_FOUND"))
      );

      const response = await request(app)
        .post("/documents/doc-404/download-link")
        .send({})
        .expect(404);

      expect(response.body).toEqual({
        error: "Document not found",
      });
    });

    it("should handle access denied", async () => {
      (mockGenerateDownloadLinkUseCase.execute as any).mockResolvedValue(
        err(new GenerateDownloadLinkError("Access denied", "ACCESS_DENIED"))
      );

      const response = await request(app)
        .post("/documents/doc-123/download-link")
        .send({})
        .expect(403);

      expect(response.body).toEqual({
        error: "Access denied",
      });
    });

    it("should handle invalid request body", async () => {
      const response = await request(app)
        .post("/documents/doc-123/download-link")
        .send({ expiresInMinutes: "invalid" }) // Invalid type
        .expect(400);

      expect(response.body.error).toBe("Invalid request body");
      expect(response.body.details).toBeDefined();
    });

    it("should handle invalid expiration time (too high)", async () => {
      const response = await request(app)
        .post("/documents/doc-123/download-link")
        .send({ expiresInMinutes: 120 }) // Max is 60
        .expect(400);

      expect(response.body.error).toBe("Invalid request body");
      expect(response.body.details).toBeDefined();
    });

    it("should handle invalid expiration time (too low)", async () => {
      const response = await request(app)
        .post("/documents/doc-123/download-link")
        .send({ expiresInMinutes: 0 }) // Min is 1
        .expect(400);

      expect(response.body.error).toBe("Invalid request body");
      expect(response.body.details).toBeDefined();
    });

    it("should handle token generation failure", async () => {
      (mockGenerateDownloadLinkUseCase.execute as any).mockResolvedValue(
        err(new GenerateDownloadLinkError("Failed to generate token", "TOKEN_GENERATION_FAILED"))
      );

      const response = await request(app)
        .post("/documents/doc-123/download-link")
        .send({})
        .expect(500);

      expect(response.body).toEqual({
        error: "Failed to generate download link",
      });
    });

    it("should handle permission check failure", async () => {
      (mockGenerateDownloadLinkUseCase.execute as any).mockResolvedValue(
        err(new GenerateDownloadLinkError("Permission check failed", "PERMISSION_CHECK_FAILED"))
      );

      const response = await request(app)
        .post("/documents/doc-123/download-link")
        .send({})
        .expect(500);

      expect(response.body).toEqual({
        error: "Failed to generate download link",
      });
    });

    it("should handle unexpected errors", async () => {
      (mockGenerateDownloadLinkUseCase.execute as any).mockResolvedValue(
        err(new GenerateDownloadLinkError("Unexpected error", "UNKNOWN_ERROR"))
      );

      const response = await request(app)
        .post("/documents/doc-123/download-link")
        .send({})
        .expect(500);

      expect(response.body).toEqual({
        error: "Internal server error",
      });
    });

    it("should handle unauthorized requests", async () => {
      // Create app without auth middleware
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.post("/documents/:id/download-link", controller.generateDownloadLink.bind(controller));

      const response = await request(unauthApp)
        .post("/documents/doc-123/download-link")
        .send({})
        .expect(401);

      expect(response.body).toEqual({
        error: "Unauthorized",
      });
    });

    it("should handle invalid document ID parameter", async () => {
      await request(app)
        .post("/documents//download-link") // Empty document ID
        .send({})
        .expect(404); // Express returns 404 for malformed routes

      // Express will return 404 for double slash in route
    });
  });

  describe("GET /downloads/:token", () => {
    it("should download document successfully", async () => {
      (mockDownloadDocumentUseCase.execute as any).mockResolvedValue(
        ok({
          document: mockDocument,
          fileData: mockFileData,
          token: mockToken.token,
          downloadedAt: new Date(),
          message: "Document downloaded successfully",
        })
      );

      const response = await request(app)
        .get(`/downloads/${mockToken.token}`)
        .expect(200);

      expect(response.headers["content-type"]).toBe("application/pdf");
      expect(response.headers["content-disposition"]).toBe('attachment; filename="Test%20Document"');
      expect(response.headers["content-length"]).toBe(mockFileData.length.toString());
      expect(response.headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
      expect(response.headers["pragma"]).toBe("no-cache");
      expect(response.headers["expires"]).toBe("0");
      expect(response.body).toEqual(mockFileData);

      expect(mockDownloadDocumentUseCase.execute).toHaveBeenCalledWith({
        token: mockToken.token,
      });
    });

    it("should handle invalid token", async () => {
      (mockDownloadDocumentUseCase.execute as any).mockResolvedValue(
        err(new DownloadDocumentError("Download token not found", "INVALID_TOKEN"))
      );

      const response = await request(app)
        .get("/downloads/invalid-token")
        .expect(404);

      expect(response.body).toEqual({
        error: "Invalid or expired download token",
      });
    });

    it("should handle expired token", async () => {
      (mockDownloadDocumentUseCase.execute as any).mockResolvedValue(
        err(new DownloadDocumentError("Download token has expired", "TOKEN_EXPIRED"))
      );

      const response = await request(app)
        .get(`/downloads/${mockToken.token}`)
        .expect(410);

      expect(response.body).toEqual({
        error: "Download token has expired",
      });
    });

    it("should handle already used token", async () => {
      (mockDownloadDocumentUseCase.execute as any).mockResolvedValue(
        err(new DownloadDocumentError("Download token has already been used", "TOKEN_ALREADY_USED"))
      );

      const response = await request(app)
        .get(`/downloads/${mockToken.token}`)
        .expect(410);

      expect(response.body).toEqual({
        error: "Download token has already been used",
      });
    });

    it("should handle document not found", async () => {
      (mockDownloadDocumentUseCase.execute as any).mockResolvedValue(
        err(new DownloadDocumentError("Document not found", "DOCUMENT_NOT_FOUND"))
      );

      const response = await request(app)
        .get(`/downloads/${mockToken.token}`)
        .expect(404);

      expect(response.body).toEqual({
        error: "Document not found",
      });
    });

    it("should handle file retrieval failure", async () => {
      (mockDownloadDocumentUseCase.execute as any).mockResolvedValue(
        err(new DownloadDocumentError("Failed to retrieve file", "FILE_RETRIEVAL_FAILED"))
      );

      const response = await request(app)
        .get(`/downloads/${mockToken.token}`)
        .expect(500);

      expect(response.body).toEqual({
        error: "Failed to retrieve document file",
      });
    });

    it("should handle token validation failure", async () => {
      (mockDownloadDocumentUseCase.execute as any).mockResolvedValue(
        err(new DownloadDocumentError("Token validation failed", "TOKEN_VALIDATION_FAILED"))
      );

      const response = await request(app)
        .get(`/downloads/${mockToken.token}`)
        .expect(400);

      expect(response.body).toEqual({
        error: "Token validation failed",
      });
    });

    it("should handle unexpected errors", async () => {
      (mockDownloadDocumentUseCase.execute as any).mockResolvedValue(
        err(new DownloadDocumentError("Unexpected error", "UNKNOWN_ERROR"))
      );

      const response = await request(app)
        .get(`/downloads/${mockToken.token}`)
        .expect(500);

      expect(response.body).toEqual({
        error: "Internal server error",
      });
    });

    it("should handle missing token parameter", async () => {
      await request(app)
        .get("/downloads/")
        .expect(404); // Express will return 404 for missing route parameter
    });

    it("should handle empty token parameter", async () => {
      await request(app)
        .get("/downloads/ ") // Space as token
        .expect(404); // Express treats space as missing parameter

      // Express will return 404 for routes with just a space
    });

    it("should handle very long token", async () => {
      const longToken = "a".repeat(1000);
      
      (mockDownloadDocumentUseCase.execute as any).mockResolvedValue(
        err(new DownloadDocumentError("Token not found", "INVALID_TOKEN"))
      );

      const response = await request(app)
        .get(`/downloads/${longToken}`)
        .expect(404);

      expect(response.body).toEqual({
        error: "Invalid or expired download token",
      });
    });

    it("should handle special characters in token", async () => {
      const specialToken = "token-with-special-chars-!@#$%^&*()";
      
      (mockDownloadDocumentUseCase.execute as any).mockResolvedValue(
        err(new DownloadDocumentError("Token not found", "INVALID_TOKEN"))
      );

      const response = await request(app)
        .get(`/downloads/${encodeURIComponent(specialToken)}`)
        .expect(404);

      expect(response.body).toEqual({
        error: "Invalid or expired download token",
      });
    });
  });

  describe("Content-Type handling", () => {
    it("should set correct content-type for different file types", async () => {
      const imageDocument = Document.create({
        id: asDocumentId("doc-image"),
        title: "Test Image.png",
        mimeType: asMimeType("image/png"),
        size: asFileSize(2048),
        storageKey: "storage/documents/doc-image.png",
        ownerId: asUserId("user-123"),
        metadata: {},
        tags: [],
      });

      (mockDownloadDocumentUseCase.execute as any).mockResolvedValue(
        ok({
          document: imageDocument,
          fileData: Buffer.from("PNG image data"),
          token: mockToken.token,
          downloadedAt: new Date(),
          message: "Document downloaded successfully",
        })
      );

      const response = await request(app)
        .get(`/downloads/${mockToken.token}`)
        .expect(200);

      expect(response.headers["content-type"]).toBe("image/png");
      expect(response.headers["content-disposition"]).toBe('attachment; filename="Test%20Image.png"');
    });

    it("should handle documents with no file extension", async () => {
      const noExtDocument = Document.create({
        id: asDocumentId("doc-noext"),
        title: "Document Without Extension",
        mimeType: asMimeType("text/plain"),
        size: asFileSize(512),
        storageKey: "storage/documents/doc-noext",
        ownerId: asUserId("user-123"),
        metadata: {},
        tags: [],
      });

      (mockDownloadDocumentUseCase.execute as any).mockResolvedValue(
        ok({
          document: noExtDocument,
          fileData: Buffer.from("Plain text content"),
          token: mockToken.token,
          downloadedAt: new Date(),
          message: "Document downloaded successfully",
        })
      );

      const response = await request(app)
        .get(`/downloads/${mockToken.token}`)
        .expect(200);

      expect(response.headers["content-type"]).toBe("text/plain");
      expect(response.headers["content-disposition"]).toBe('attachment; filename="Document%20Without%20Extension"');
    });

    it("should handle documents with special characters in filename", async () => {
      const specialDocument = Document.create({
        id: asDocumentId("doc-special"),
        title: "Document with Special Characters & Symbols!.pdf",
        mimeType: asMimeType("application/pdf"),
        size: asFileSize(1024),
        storageKey: "storage/documents/doc-special.pdf",
        ownerId: asUserId("user-123"),
        metadata: {},
        tags: [],
      });

      (mockDownloadDocumentUseCase.execute as any).mockResolvedValue(
        ok({
          document: specialDocument,
          fileData: mockFileData,
          token: mockToken.token,
          downloadedAt: new Date(),
          message: "Document downloaded successfully",
        })
      );

      const response = await request(app)
        .get(`/downloads/${mockToken.token}`)
        .expect(200);

      expect(response.headers["content-type"]).toBe("application/pdf");
      expect(response.headers["content-disposition"]).toBe('attachment; filename="Document%20with%20Special%20Characters%20%26%20Symbols!.pdf"');
    });
  });

  describe("Error handling edge cases", () => {
    it("should handle use case throwing an exception", async () => {
      (mockDownloadDocumentUseCase.execute as any).mockRejectedValue(
        new Error("Unexpected database error")
      );

      const response = await request(app)
        .get(`/downloads/${mockToken.token}`)
        .expect(500);

      expect(response.body).toEqual({
        error: "Internal server error",
      });
    });

    it("should handle generate use case throwing an exception", async () => {
      (mockGenerateDownloadLinkUseCase.execute as any).mockRejectedValue(
        new Error("Database connection failed")
      );

      const response = await request(app)
        .post("/documents/doc-123/download-link")
        .send({})
        .expect(500);

      expect(response.body).toEqual({
        error: "Internal server error",
      });
    });

    it("should handle malformed JSON in request body", async () => {
      await request(app)
        .post("/documents/doc-123/download-link")
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}') // Malformed JSON
        .expect(400);

      // Express will handle the JSON parsing error
    });

    it("should handle large file downloads", async () => {
      const largeFileData = Buffer.alloc(10 * 1024 * 1024, 'a'); // 10MB file

      (mockDownloadDocumentUseCase.execute as any).mockResolvedValue(
        ok({
          document: mockDocument,
          fileData: largeFileData,
          token: mockToken.token,
          downloadedAt: new Date(),
          message: "Document downloaded successfully",
        })
      );

      const response = await request(app)
        .get(`/downloads/${mockToken.token}`)
        .expect(200);

      expect(response.headers["content-length"]).toBe(largeFileData.length.toString());
      expect(response.body.length).toBe(largeFileData.length);
    });
  });

  describe("Security headers", () => {
    it("should set security headers for file downloads", async () => {
      (mockDownloadDocumentUseCase.execute as any).mockResolvedValue(
        ok({
          document: mockDocument,
          fileData: mockFileData,
          token: mockToken.token,
          downloadedAt: new Date(),
          message: "Document downloaded successfully",
        })
      );

      const response = await request(app)
        .get(`/downloads/${mockToken.token}`)
        .expect(200);

      expect(response.headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
      expect(response.headers["pragma"]).toBe("no-cache");
      expect(response.headers["expires"]).toBe("0");
    });
  });
});
