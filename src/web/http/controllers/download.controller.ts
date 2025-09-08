import { Request, Response } from "express";
import { GenerateDownloadLinkUseCase } from "../../../application/use-cases/generate-download-link.use-case";
import { DownloadDocumentUseCase } from "../../../application/use-cases/download-document.use-case";
import { 
  generateDownloadLinkSchema,
  documentIdParamSchema,
  downloadTokenParamSchema 
} from "../schemas/download.schema";
import { handleValidationError, sendErr, sendOk } from "../errors";
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
      sendErr(res, new Error("Authentication required"), "Authentication required", "UNAUTHORIZED");
      return;
    }

    // Validate document ID parameter
    const paramValidation = documentIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      logger.warn("Invalid document ID parameter", {
        userId: userId,
        errors: paramValidation.error.issues,
      } as any);
      handleValidationError(res, paramValidation.error);
      return;
    }

    // Validate request body (optional expiration time)
    const bodyValidation = generateDownloadLinkSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      logger.warn("Generate download link validation failed", {
        userId: userId,
        documentId: req.params.id,
        errors: bodyValidation.error.issues,
      } as any);
      handleValidationError(res, bodyValidation.error);
      return;
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

        sendErr(res, result.error, result.error.message);
        return;
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

      sendOk(res, response, 200);

    } catch (error) {
      logger.error("Unexpected error in generate download link", {
        error: error instanceof Error ? error.message : String(error),
        userId: userId,
        documentId: documentId,
      } as any);

      sendErr(res, error);
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
      handleValidationError(res, paramValidation.error);
      return;
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

        sendErr(res, result.error, result.error.message);
        return;
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

      sendErr(res, error);
    }
  };
}
