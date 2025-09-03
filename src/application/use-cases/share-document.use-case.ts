import { Result, ok, err } from "../../shared/result/result";
import { UserId, DocumentId } from "../../shared/types/brand";
import { UserRole } from "../../domain/entities/user.entity";
import { PermissionLevel } from "../../domain/entities/permission.entity";
import { DocumentAccessPolicy } from "../../domain/policies/document-access.policy";
import { 
  PermissionService, 
  PermissionRepository 
} from "../../domain/services/permission.service";
import { DocumentRepository } from "../../domain/services/document.service";

/**
 * Use case for sharing a document with another user.
 * Handles granting permissions with proper authorization checks.
 */
export class ShareDocumentUseCase {
  private readonly permissionService: PermissionService;

  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly permissionRepository: PermissionRepository
  ) {
    this.permissionService = new PermissionService(permissionRepository);
  }

  async execute(
    requesterId: UserId,
    requesterRole: UserRole,
    params: ShareDocumentParams
  ): Promise<Result<ShareDocumentResponse, ShareDocumentError>> {
    try {
      // 1. Verify document exists and get owner
      const documentResult = await this.documentRepository.findById(params.documentId);
      if (!documentResult.ok) {
        return err(new ShareDocumentError(
          "Failed to find document",
          "DOCUMENT_NOT_FOUND"
        ));
      }

      if (!documentResult.value) {
        return err(new ShareDocumentError(
          "Document not found",
          "DOCUMENT_NOT_FOUND"
        ));
      }

      const document = documentResult.value;

      // 2. Get requester's existing permissions for the document
      const requesterPermissionsResult = await this.permissionRepository.findByDocumentAndUser(
        params.documentId,
        requesterId
      );

      if (!requesterPermissionsResult.ok) {
        return err(new ShareDocumentError(
          "Failed to check requester permissions",
          "PERMISSION_CHECK_FAILED"
        ));
      }

      const requesterPermissions = requesterPermissionsResult.value ? [requesterPermissionsResult.value] : [];

      // 3. Check if requester can share this document
      const accessContext = {
        userId: requesterId,
        userRole: requesterRole,
        documentId: params.documentId,
        documentOwnerId: document.ownerId,
        userPermissions: requesterPermissions,
      };

      const canShareResult = DocumentAccessPolicy.canShare(accessContext);
      if (!canShareResult.granted) {
        return err(new ShareDocumentError(
          `Access denied: ${canShareResult.reason}`,
          "ACCESS_DENIED"
        ));
      }

      // 4. Grant or update the permission
      const grantResult = await this.permissionService.grantPermission(
        params.documentId,
        params.targetUserId,
        params.permissionLevel
      );

      if (!grantResult.ok) {
        return err(new ShareDocumentError(
          "Failed to grant permission",
          "PERMISSION_GRANT_FAILED",
          grantResult.error
        ));
      }

      const permission = grantResult.value;

      return ok({
        documentId: params.documentId,
        targetUserId: params.targetUserId,
        permissionLevel: permission.level,
        permissionId: permission.id,
        granted: true,
        message: `Successfully granted ${permission.level} access to document`,
      });

    } catch (error) {
      return err(new ShareDocumentError(
        "Unexpected error during document sharing",
        "UNKNOWN_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }
}

/**
 * Parameters for sharing a document.
 */
export interface ShareDocumentParams {
  /** The document to share */
  documentId: DocumentId;
  /** The user to share with */
  targetUserId: UserId;
  /** The permission level to grant */
  permissionLevel: PermissionLevel;
}

/**
 * Response from sharing a document.
 */
export interface ShareDocumentResponse {
  documentId: DocumentId;
  targetUserId: UserId;
  permissionLevel: PermissionLevel;
  permissionId: string;
  granted: boolean;
  message: string;
}

/**
 * Error class for document sharing operations.
 */
export class ShareDocumentError extends Error {
  constructor(
    message: string,
    public readonly code: ShareDocumentErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "ShareDocumentError";
  }
}

export type ShareDocumentErrorCode =
  | "DOCUMENT_NOT_FOUND"
  | "ACCESS_DENIED"
  | "PERMISSION_CHECK_FAILED"
  | "PERMISSION_GRANT_FAILED"
  | "UNKNOWN_ERROR";
