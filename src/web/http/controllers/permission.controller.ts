import { Request, Response } from "express";
import { ShareDocumentUseCase } from "../../../application/use-cases/share-document.use-case";
import { RevokeDocumentAccessUseCase } from "../../../application/use-cases/revoke-document-access.use-case";
import { GetDocumentPermissionsUseCase } from "../../../application/use-cases/get-document-permissions.use-case";
import { 
  shareDocumentSchema,
  revokeDocumentAccessSchema,
  documentIdParamSchema 
} from "../schemas/permission.schema";
import { handleValidationError, sendErr, sendOk } from "../errors";
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

    // Validate request body
    const bodyValidation = shareDocumentSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      logger.warn("Share document validation failed", {
        userId: userId,
        documentId: req.params.id,
        errors: bodyValidation.error.issues,
      } as any);
      handleValidationError(res, bodyValidation.error);
      return;
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

        sendErr(res, result.error, result.error.message);
        return;
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

      sendOk(res, response, 200);

    } catch (error) {
      logger.error("Unexpected error in share document", {
        error: error instanceof Error ? error.message : String(error),
        userId: userId,
        documentId: documentId,
        targetUserId: targetUserId,
      } as any);

      sendErr(res, error);
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

    // Validate request body
    const bodyValidation = revokeDocumentAccessSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      logger.warn("Revoke document access validation failed", {
        userId: userId,
        documentId: req.params.id,
        errors: bodyValidation.error.issues,
      } as any);
      handleValidationError(res, bodyValidation.error);
      return;
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

        sendErr(res, result.error, result.error.message);
        return;
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

      sendOk(res, response, 200);

    } catch (error) {
      logger.error("Unexpected error in revoke document access", {
        error: error instanceof Error ? error.message : String(error),
        userId: userId,
        documentId: documentId,
        targetUserId: targetUserId,
      } as any);

      sendErr(res, error);
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

        sendErr(res, result.error, result.error.message);
        return;
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

      sendOk(res, response, 200);

    } catch (error) {
      logger.error("Unexpected error in get document permissions", {
        error: error instanceof Error ? error.message : String(error),
        userId: userId,
        documentId: documentId,
      } as any);

      sendErr(res, error);
    }
  };
}
