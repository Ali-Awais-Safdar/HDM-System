import { Request, Response } from "express";
import { ShareDocumentUseCase } from "../../../application/use-cases/share-document.use-case";
import { RevokeDocumentAccessUseCase } from "../../../application/use-cases/revoke-document-access.use-case";
import { GetDocumentPermissionsUseCase } from "../../../application/use-cases/get-document-permissions.use-case";
import { 
  shareDocumentSchema,
  revokeDocumentAccessSchema,
  documentIdParamSchema 
} from "../schemas/permission.schema";
import { asUserId, asDocumentId } from "../../../shared/types/brand";
import { logger } from "../../../shared/logging/logger";

/**
 * Controller for document permission management endpoints.
 */
export class PermissionController {
  constructor(
    private readonly shareDocumentUseCase: ShareDocumentUseCase,
    private readonly revokeDocumentAccessUseCase: RevokeDocumentAccessUseCase,
    private readonly getDocumentPermissionsUseCase: GetDocumentPermissionsUseCase
  ) {}

  /**
   * POST /documents/:id/share
   * Grants permissions to a user for a specific document.
   */
  shareDocument = async (req: Request, res: Response) => {
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

    // Validate request body
    const bodyValidation = shareDocumentSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      logger.warn("Share document validation failed", {
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
    const { targetUserId, permissionLevel } = bodyValidation.data;

    try {
      const result = await this.shareDocumentUseCase.execute(
        userId,
        userRole,
        {
          documentId,
          targetUserId: asUserId(targetUserId),
          permissionLevel,
        }
      );

      if (!result.ok) {
        logger.warn("Failed to share document", {
          userId: userId,
          documentId: documentId,
          targetUserId: targetUserId,
          error: result.error.message,
          code: result.error.code,
        } as any);

        switch (result.error.code) {
          case "DOCUMENT_NOT_FOUND":
            return res.status(404).json({ error: result.error.message });
          case "ACCESS_DENIED":
            return res.status(403).json({ error: result.error.message });
          case "PERMISSION_CHECK_FAILED":
          case "PERMISSION_GRANT_FAILED":
            return res.status(500).json({ error: "Failed to share document" });
          default:
            return res.status(500).json({ error: "Internal server error" });
        }
      }

      logger.info("Document shared successfully", {
        userId: userId,
        documentId: documentId,
        targetUserId: targetUserId,
        permissionLevel: permissionLevel,
        permissionId: result.value.permissionId,
      } as any);

      const response = {
        documentId: result.value.documentId,
        targetUserId: result.value.targetUserId,
        permissionLevel: result.value.permissionLevel,
        permissionId: result.value.permissionId,
        granted: result.value.granted,
        message: result.value.message,
      };

      return res.status(200).json(response);

    } catch (error) {
      logger.error("Unexpected error in share document", {
        error: error instanceof Error ? error.message : String(error),
        userId: userId,
        documentId: documentId,
        targetUserId: targetUserId,
      } as any);

      return res.status(500).json({ error: "Internal server error" });
    }
  };

  /**
   * DELETE /documents/:id/share
   * Revokes permissions from a user for a specific document.
   */
  revokeDocumentAccess = async (req: Request, res: Response) => {
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

    // Validate request body
    const bodyValidation = revokeDocumentAccessSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      logger.warn("Revoke document access validation failed", {
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
    const { targetUserId } = bodyValidation.data;

    try {
      const result = await this.revokeDocumentAccessUseCase.execute(
        userId,
        userRole,
        {
          documentId,
          targetUserId: asUserId(targetUserId),
        }
      );

      if (!result.ok) {
        logger.warn("Failed to revoke document access", {
          userId: userId,
          documentId: documentId,
          targetUserId: targetUserId,
          error: result.error.message,
          code: result.error.code,
        } as any);

        switch (result.error.code) {
          case "DOCUMENT_NOT_FOUND":
            return res.status(404).json({ error: result.error.message });
          case "ACCESS_DENIED":
            return res.status(403).json({ error: result.error.message });
          case "PERMISSION_NOT_FOUND":
            return res.status(404).json({ error: result.error.message });
          case "CANNOT_REVOKE_OWNER_ACCESS":
            return res.status(400).json({ error: result.error.message });
          case "PERMISSION_CHECK_FAILED":
          case "PERMISSION_REVOKE_FAILED":
            return res.status(500).json({ error: "Failed to revoke document access" });
          default:
            return res.status(500).json({ error: "Internal server error" });
        }
      }

      logger.info("Document access revoked successfully", {
        userId: userId,
        documentId: documentId,
        targetUserId: targetUserId,
        revoked: result.value.revoked,
      } as any);

      const response = {
        documentId: result.value.documentId,
        targetUserId: result.value.targetUserId,
        revoked: result.value.revoked,
        message: result.value.message,
      };

      return res.status(200).json(response);

    } catch (error) {
      logger.error("Unexpected error in revoke document access", {
        error: error instanceof Error ? error.message : String(error),
        userId: userId,
        documentId: documentId,
        targetUserId: targetUserId,
      } as any);

      return res.status(500).json({ error: "Internal server error" });
    }
  };

  /**
   * GET /documents/:id/permissions
   * Gets all permissions for a specific document.
   */
  getDocumentPermissions = async (req: Request, res: Response) => {
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

    const documentId = asDocumentId(paramValidation.data.id);

    try {
      const result = await this.getDocumentPermissionsUseCase.execute(
        userId,
        userRole,
        { documentId }
      );

      if (!result.ok) {
        logger.warn("Failed to get document permissions", {
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
          case "PERMISSION_RETRIEVAL_FAILED":
            return res.status(500).json({ error: "Failed to retrieve document permissions" });
          default:
            return res.status(500).json({ error: "Internal server error" });
        }
      }

      logger.info("Document permissions retrieved successfully", {
        userId: userId,
        documentId: documentId,
        permissionCount: result.value.totalCount,
      } as any);

      const response = {
        documentId: result.value.documentId,
        ownerId: result.value.ownerId,
        permissions: result.value.permissions.map(permission => ({
          userId: permission.userId,
          permissionLevel: permission.permissionLevel,
          grantedAt: permission.grantedAt.toISOString(),
          permissionId: permission.permissionId,
        })),
        totalCount: result.value.totalCount,
      };

      return res.status(200).json(response);

    } catch (error) {
      logger.error("Unexpected error in get document permissions", {
        error: error instanceof Error ? error.message : String(error),
        userId: userId,
        documentId: documentId,
      } as any);

      return res.status(500).json({ error: "Internal server error" });
    }
  };
}
