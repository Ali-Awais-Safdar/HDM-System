import { Result, ok, err } from "../../shared/result/result";
import { UserId, DocumentId } from "../../shared/types/brand";
import { UserRole } from "../../domain/entities/user.entity";
import { DocumentAccessPolicy } from "../../domain/policies/document-access.policy";
import { 
  DownloadTokenService, 
  DownloadTokenRepository 
} from "/services/download-token.service";
import { PermissionRepository } from "/services/permission.service";
import { DocumentRepository } from "/services/document.service";
import { env } from "../../env/env";

/**
 * Use case for generating secure download links for documents.
 * Handles authorization checks and token generation.
 */
export class GenerateDownloadLinkUseCase {
  private readonly downloadTokenService: DownloadTokenService;

  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly permissionRepository: PermissionRepository,
    downloadTokenRepository: DownloadTokenRepository
  ) {
    this.downloadTokenService = new DownloadTokenService(
      downloadTokenRepository,
      env.DOWNLOAD_TOKEN_CLOCK_SKEW_TOLERANCE_MS
    );
  }

  async execute(
    requesterId: UserId,
    requesterRole: UserRole,
    params: GenerateDownloadLinkParams
  ): Promise<Result<GenerateDownloadLinkResponse, GenerateDownloadLinkError>> {
    try {
      // 1. Verify document exists and get owner
      const documentResult = await this.documentRepository.findById(params.documentId);
      if (!documentResult.ok) {
        return err(new GenerateDownloadLinkError(
          "Failed to find document",
          "DOCUMENT_NOT_FOUND"
        ));
      }

      if (!documentResult.value) {
        return err(new GenerateDownloadLinkError(
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
        return err(new GenerateDownloadLinkError(
          "Failed to check requester permissions",
          "PERMISSION_CHECK_FAILED"
        ));
      }

      const requesterPermissions = requesterPermissionsResult.value ? [requesterPermissionsResult.value] : [];

      // 3. Check if requester can read this document
      const accessContext = {
        userId: requesterId,
        userRole: requesterRole,
        documentId: params.documentId,
        documentOwnerId: document.ownerId,
        userPermissions: requesterPermissions,
      };

      const canReadResult = DocumentAccessPolicy.canRead(accessContext);
      if (!canReadResult.granted) {
        return err(new GenerateDownloadLinkError(
          `Access denied: ${canReadResult.reason}`,
          "ACCESS_DENIED"
        ));
      }

      // 4. Generate download token
      const tokenResult = await this.downloadTokenService.generateDownloadToken(
        params.documentId,
        requesterId,
        params.expiresAt
      );

      if (!tokenResult.ok) {
        return err(new GenerateDownloadLinkError(
          "Failed to generate download token",
          "TOKEN_GENERATION_FAILED",
          tokenResult.error
        ));
      }

      const token = tokenResult.value;

      // 5. Construct download URL
      const downloadUrl = `/downloads/${token.token}`;

      return ok({
        url: downloadUrl,
        token: token.token,
        expiresAt: token.expiresAt,
        documentId: params.documentId,
        issuedTo: requesterId,
        message: "Download link generated successfully",
      });

    } catch (error) {
      return err(new GenerateDownloadLinkError(
        "Unexpected error during download link generation",
        "UNKNOWN_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }
}

/**
 * Parameters for generating a download link.
 */
export interface GenerateDownloadLinkParams {
  /** The document to generate a download link for */
  documentId: DocumentId;
  /** Optional custom expiration time (defaults to 5 minutes) */
  expiresAt?: Date;
}

/**
 * Response from generating a download link.
 */
export interface GenerateDownloadLinkResponse {
  /** The download URL */
  url: string;
  /** The secure token (for reference, not for client storage) */
  token: string;
  /** When the link expires */
  expiresAt: Date;
  /** The document ID */
  documentId: DocumentId;
  /** Who the token was issued to */
  issuedTo: UserId;
  /** Success message */
  message: string;
}

/**
 * Error class for download link generation operations.
 */
export class GenerateDownloadLinkError extends Error {
  constructor(
    message: string,
    public readonly code: GenerateDownloadLinkErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "GenerateDownloadLinkError";
  }
}

export type GenerateDownloadLinkErrorCode =
  | "DOCUMENT_NOT_FOUND"
  | "ACCESS_DENIED"
  | "PERMISSION_CHECK_FAILED"
  | "TOKEN_GENERATION_FAILED"
  | "UNKNOWN_ERROR";
