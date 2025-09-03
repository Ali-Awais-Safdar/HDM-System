import { Result, ok, err } from "../../shared/result/result";
import { UserId, DocumentId } from "../../shared/types/brand";
import { UserRole } from "../../domain/entities/user.entity";
import { DocumentAccessPolicy } from "../../domain/policies/document-access.policy";
import { 
  PermissionService, 
  PermissionRepository 
} from "../../domain/services/permission.service";
import { DocumentRepository } from "../../domain/services/document.service";

/**
 * Use case for revoking access to a document.
 * Handles permission removal with proper authorization checks.
 */
export class RevokeDocumentAccessUseCase {
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
    params: RevokeDocumentAccessParams
  ): Promise<Result<RevokeDocumentAccessResponse, RevokeDocumentAccessError>> {
    try {
      // 1. Verify document exists and get owner
      const documentResult = await this.documentRepository.findById(params.documentId);
      if (!documentResult.ok) {
        return err(new RevokeDocumentAccessError(
          "Failed to find document",
          "DOCUMENT_NOT_FOUND"
        ));
      }

      if (!documentResult.value) {
        return err(new RevokeDocumentAccessError(
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
        return err(new RevokeDocumentAccessError(
          "Failed to check requester permissions",
          "PERMISSION_CHECK_FAILED"
        ));
      }

      const requesterPermissions = requesterPermissionsResult.value ? [requesterPermissionsResult.value] : [];

      // 3. Check if requester can revoke access for this document
      const accessContext = {
        userId: requesterId,
        userRole: requesterRole,
        documentId: params.documentId,
        documentOwnerId: document.ownerId,
        userPermissions: requesterPermissions,
      };

      const canShareResult = DocumentAccessPolicy.canShare(accessContext);
      if (!canShareResult.granted) {
        return err(new RevokeDocumentAccessError(
          `Access denied: ${canShareResult.reason}`,
          "ACCESS_DENIED"
        ));
      }

      // 4. Prevent revoking access from the document owner
      if (params.targetUserId === document.ownerId) {
        return err(new RevokeDocumentAccessError(
          "Cannot revoke access from document owner",
          "CANNOT_REVOKE_OWNER_ACCESS"
        ));
      }

      // 5. Check if the target user actually has explicit permissions
      const targetPermissionResult = await this.permissionRepository.findByDocumentAndUser(
        params.documentId,
        params.targetUserId
      );

      if (!targetPermissionResult.ok) {
        return err(new RevokeDocumentAccessError(
          "Failed to check target user permissions",
          "PERMISSION_CHECK_FAILED"
        ));
      }

      if (!targetPermissionResult.value) {
        return err(new RevokeDocumentAccessError(
          "User does not have explicit permissions for this document",
          "PERMISSION_NOT_FOUND"
        ));
      }

      // 6. Revoke the permission
      const revokeResult = await this.permissionService.revokePermission(
        params.documentId,
        params.targetUserId
      );

      if (!revokeResult.ok) {
        return err(new RevokeDocumentAccessError(
          "Failed to revoke permission",
          "PERMISSION_REVOKE_FAILED",
          revokeResult.error
        ));
      }

      return ok({
        documentId: params.documentId,
        targetUserId: params.targetUserId,
        revoked: revokeResult.value,
        message: revokeResult.value 
          ? "Successfully revoked document access"
          : "No permission found to revoke",
      });

    } catch (error) {
      return err(new RevokeDocumentAccessError(
        "Unexpected error during access revocation",
        "UNKNOWN_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }
}

/**
 * Parameters for revoking document access.
 */
export interface RevokeDocumentAccessParams {
  /** The document to revoke access from */
  documentId: DocumentId;
  /** The user to revoke access from */
  targetUserId: UserId;
}

/**
 * Response from revoking document access.
 */
export interface RevokeDocumentAccessResponse {
  documentId: DocumentId;
  targetUserId: UserId;
  revoked: boolean;
  message: string;
}

/**
 * Error class for document access revocation operations.
 */
export class RevokeDocumentAccessError extends Error {
  constructor(
    message: string,
    public readonly code: RevokeDocumentAccessErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "RevokeDocumentAccessError";
  }
}

export type RevokeDocumentAccessErrorCode =
  | "DOCUMENT_NOT_FOUND"
  | "ACCESS_DENIED"
  | "PERMISSION_CHECK_FAILED"
  | "PERMISSION_NOT_FOUND"
  | "PERMISSION_REVOKE_FAILED"
  | "CANNOT_REVOKE_OWNER_ACCESS"
  | "UNKNOWN_ERROR";
