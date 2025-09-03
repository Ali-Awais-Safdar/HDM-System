import { Request, Response } from "express";
import { GenerateDownloadLinkUseCase } from "../../../application/use-cases/generate-download-link.use-case";
import { DownloadDocumentUseCase } from "../../../application/use-cases/download-document.use-case";
import { 
  generateDownloadLinkSchema,
  documentIdParamSchema,
  downloadTokenParamSchema 
} from "../schemas/download.schema";
import { asDocumentId } from "../../../shared/types/brand";
import { logger } from "../../../shared/logging/logger";

/**
 * Controller for document download functionality.
 */
export class DownloadController {
  constructor(
    private readonly generateDownloadLinkUseCase: GenerateDownloadLinkUseCase,
    private readonly downloadDocumentUseCase: DownloadDocumentUseCase
  ) {}

  /**
   * POST /documents/:id/download-link
   * Generates a secure, short-lived download link for a document.
   */
  generateDownloadLink = async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Validate document ID parameter
    const paramValidation = documentIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      logger.warn("Invalid document ID parameter", {
        userId: userId,
        errors: paramValidation.error.issues,
      } as any);
      return res.status(400).json({
        error: "Invalid document ID",
        details: paramValidation.error.issues,
      });
    }

    // Validate request body (optional expiration time)
    const bodyValidation = generateDownloadLinkSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      logger.warn("Generate download link validation failed", {
        userId: userId,
        documentId: req.params.id,
        errors: bodyValidation.error.issues,
      } as any);
      return res.status(400).json({
        error: "Invalid request body",
        details: bodyValidation.error.issues,
      });
    }

    const documentId = asDocumentId(paramValidation.data.id);
    const { expiresInMinutes } = bodyValidation.data;

    // Calculate expiration time if provided
    const expiresAt = expiresInMinutes 
      ? new Date(Date.now() + expiresInMinutes * 60 * 1000)
      : undefined; // Use default 5 minutes

    try {
      const result = await this.generateDownloadLinkUseCase.execute(
        userId,
        userRole,
        {
          documentId,
          expiresAt,
        }
      );

      if (!result.ok) {
        logger.warn("Failed to generate download link", {
          userId: userId,
          documentId: documentId,
          error: result.error.message,
          code: result.error.code,
        } as any);

        switch (result.error.code) {
          case "DOCUMENT_NOT_FOUND":
            return res.status(404).json({ error: result.error.message });
          case "ACCESS_DENIED":
            return res.status(403).json({ error: result.error.message });
          case "PERMISSION_CHECK_FAILED":
          case "TOKEN_GENERATION_FAILED":
            return res.status(500).json({ error: "Failed to generate download link" });
          default:
            return res.status(500).json({ error: "Internal server error" });
        }
      }

      logger.info("Download link generated successfully", {
        userId: userId,
        documentId: documentId,
        expiresAt: result.value.expiresAt,
        expiresInMinutes: expiresInMinutes,
      } as any);

      const response = {
        url: result.value.url,
        expiresAt: result.value.expiresAt.toISOString(),
        documentId: result.value.documentId,
        issuedTo: result.value.issuedTo,
        message: result.value.message,
      };

      return res.status(200).json(response);

    } catch (error) {
      logger.error("Unexpected error in generate download link", {
        error: error instanceof Error ? error.message : String(error),
        userId: userId,
        documentId: documentId,
      } as any);

      return res.status(500).json({ error: "Internal server error" });
    }
  };

  /**
   * GET /downloads/:token
   * Downloads a document using a secure token.
   * Streams the file directly to the client.
   */
  downloadDocument = async (req: Request, res: Response) => {
    // Validate token parameter
    const paramValidation = downloadTokenParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      logger.warn("Invalid download token parameter", {
        errors: paramValidation.error.issues,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      } as any);
      return res.status(400).json({
        error: "Invalid download token",
        details: paramValidation.error.issues,
      });
    }

    const { token } = paramValidation.data;

    try {
      const result = await this.downloadDocumentUseCase.execute({ token });

      if (!result.ok) {
        logger.warn("Failed to download document", {
          token: token.substring(0, 8) + "...", // Log only first 8 chars for security
          error: result.error.message,
          code: result.error.code,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        } as any);

        switch (result.error.code) {
          case "INVALID_TOKEN":
            return res.status(404).json({ error: "Invalid or expired download token" });
          case "TOKEN_EXPIRED":
            return res.status(410).json({ error: "Download token has expired" });
          case "TOKEN_ALREADY_USED":
            return res.status(410).json({ error: "Download token has already been used" });
          case "TOKEN_VALIDATION_FAILED":
            return res.status(400).json({ error: "Token validation failed" });
          case "DOCUMENT_NOT_FOUND":
            return res.status(404).json({ error: "Document not found" });
          case "FILE_RETRIEVAL_FAILED":
            return res.status(500).json({ error: "Failed to retrieve document file" });
          default:
            return res.status(500).json({ error: "Internal server error" });
        }
      }

      const { document, fileData } = result.value;

      logger.info("Document downloaded successfully", {
        documentId: document.id,
        documentTitle: document.title,
        fileSize: fileData.length,
        token: token.substring(0, 8) + "...",
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        downloadedAt: result.value.downloadedAt,
      } as any);

      // Set appropriate headers for file download
      res.setHeader('Content-Type', document.mimeType);
      res.setHeader('Content-Length', fileData.length);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.title)}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      // Stream the file
      return res.send(fileData);

    } catch (error) {
      logger.error("Unexpected error in download document", {
        error: error instanceof Error ? error.message : String(error),
        token: token.substring(0, 8) + "...",
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      } as any);

      return res.status(500).json({ error: "Internal server error" });
    }
  };
}
