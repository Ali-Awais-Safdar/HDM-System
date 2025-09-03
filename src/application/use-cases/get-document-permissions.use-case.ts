import { Result, ok, err } from "../../shared/result/result";
import { UserId, DocumentId } from "../../shared/types/brand";
import { UserRole } from "../../domain/entities/user.entity";
// Removed unused Permission import
import { DocumentAccessPolicy } from "../../domain/policies/document-access.policy";
import { PermissionRepository } from "../../domain/services/permission.service";
import { DocumentRepository } from "../../domain/services/document.service";

/**
 * Use case for retrieving document permissions.
 * Returns all users who have explicit permissions on a document.
 */
export class GetDocumentPermissionsUseCase {
  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly permissionRepository: PermissionRepository
  ) {}

  async execute(
    requesterId: UserId,
    requesterRole: UserRole,
    params: GetDocumentPermissionsParams
  ): Promise<Result<GetDocumentPermissionsResponse, GetDocumentPermissionsError>> {
    try {
      // 1. Verify document exists and get owner
      const documentResult = await this.documentRepository.findById(params.documentId);
      if (!documentResult.ok) {
        return err(new GetDocumentPermissionsError(
          "Failed to find document",
          "DOCUMENT_NOT_FOUND"
        ));
      }

      if (!documentResult.value) {
        return err(new GetDocumentPermissionsError(
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
        return err(new GetDocumentPermissionsError(
          "Failed to check requester permissions",
          "PERMISSION_CHECK_FAILED"
        ));
      }

      const requesterPermissions = requesterPermissionsResult.value ? [requesterPermissionsResult.value] : [];

      // 3. Check if requester can view permissions for this document
      const accessContext = {
        userId: requesterId,
        userRole: requesterRole,
        documentId: params.documentId,
        documentOwnerId: document.ownerId,
        userPermissions: requesterPermissions,
      };

      // Only users with admin access can view permissions
      const canViewResult = DocumentAccessPolicy.canAdmin(accessContext);
      if (!canViewResult.granted) {
        return err(new GetDocumentPermissionsError(
          `Access denied: ${canViewResult.reason}`,
          "ACCESS_DENIED"
        ));
      }

      // 4. Get all permissions for the document
      const permissionsResult = await this.permissionRepository.findByDocument(params.documentId);
      if (!permissionsResult.ok) {
        return err(new GetDocumentPermissionsError(
          "Failed to retrieve document permissions",
          "PERMISSION_RETRIEVAL_FAILED",
          permissionsResult.error
        ));
      }

      const permissions = permissionsResult.value;

      // 5. Format the response
      const permissionEntries = permissions.map(permission => ({
        userId: permission.userId,
        permissionLevel: permission.level,
        grantedAt: permission.createdAt,
        permissionId: permission.id,
      }));

      return ok({
        documentId: params.documentId,
        ownerId: document.ownerId,
        permissions: permissionEntries,
        totalCount: permissionEntries.length,
      });

    } catch (error) {
      return err(new GetDocumentPermissionsError(
        "Unexpected error while retrieving permissions",
        "UNKNOWN_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }
}

/**
 * Parameters for getting document permissions.
 */
export interface GetDocumentPermissionsParams {
  /** The document to get permissions for */
  documentId: DocumentId;
}

/**
 * Response from getting document permissions.
 */
export interface GetDocumentPermissionsResponse {
  documentId: DocumentId;
  ownerId: UserId;
  permissions: DocumentPermissionEntry[];
  totalCount: number;
}

/**
 * Individual permission entry in the response.
 */
export interface DocumentPermissionEntry {
  userId: UserId;
  permissionLevel: string;
  grantedAt: Date;
  permissionId: string;
}

/**
 * Error class for getting document permissions operations.
 */
export class GetDocumentPermissionsError extends Error {
  constructor(
    message: string,
    public readonly code: GetDocumentPermissionsErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "GetDocumentPermissionsError";
  }
}

export type GetDocumentPermissionsErrorCode =
  | "DOCUMENT_NOT_FOUND"
  | "ACCESS_DENIED"
  | "PERMISSION_CHECK_FAILED"
  | "PERMISSION_RETRIEVAL_FAILED"
  | "UNKNOWN_ERROR";
