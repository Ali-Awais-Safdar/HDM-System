import { Result, ok, err } from "../../shared/result/result";
import { DocumentService } from "../../domain/services/document.service";
import { UserId, asDocumentId } from "../../shared/types/brand";
import { UserRole } from "../../domain/entities/user.entity";
import type { Permission } from "../../domain/policies/document.policy";
import { createServiceLogger, logPerformance } from "../../shared/logging/logger";

export interface UpdateDocumentMetadataRequest {
  documentId: string;
  userId: UserId;
  userRole: UserRole;
  metadata: Record<string, unknown>;
  directPermission?: Permission;
}

export interface UpdateDocumentMetadataResponse {
  id: string;
  title: string;
  mimeType: string;
  size: number;
  metadata: Record<string, unknown>;
  tags: string[];
  ownerId: string;
  createdAt: Date;
  updatedAt: Date | null;
}

export class UpdateDocumentMetadataUseCase {
  private readonly logger = createServiceLogger('UpdateDocumentMetadataUseCase');
  
  constructor(private readonly documentService: DocumentService) {}

  async execute(request: UpdateDocumentMetadataRequest): Promise<Result<UpdateDocumentMetadataResponse, UpdateDocumentMetadataError>> {
    const startTime = Date.now();
    
    try {
      const documentId = asDocumentId(request.documentId);

      this.logger.info({
        documentId: request.documentId,
        userId: request.userId,
        userRole: request.userRole,
        metadataKeys: Object.keys(request.metadata)
      }, "Starting document metadata update");

      const result = await this.documentService.updateMetadata(
        documentId,
        request.userId,
        request.userRole,
        request.metadata,
        request.directPermission
      );

      if (!result.ok) {
        this.logger.warn({
          documentId: request.documentId,
          userId: request.userId,
          error: result.error.message
        }, "Document metadata update failed");
        return err(new UpdateDocumentMetadataError(result.error.message));
      }

      const document = result.value;

      // Log successful update
      logPerformance(this.logger, 'update_document_metadata', startTime, {
        documentId: request.documentId,
        userId: request.userId
      });

      this.logger.info({
        documentId: document.id,
        userId: request.userId,
        title: document.title,
        metadataKeys: Object.keys(document.metadata)
      }, "Document metadata updated successfully");

      return ok({
        id: document.id,
        title: document.title,
        mimeType: document.mimeType,
        size: document.size,
        metadata: document.metadata,
        tags: document.tags,
        ownerId: document.ownerId,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt
      });

    } catch (error) {
      this.logger.error({
        documentId: request.documentId,
        userId: request.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      }, "Unexpected error during document metadata update");
      
      if (error instanceof Error) {
        return err(new UpdateDocumentMetadataError(error.message));
      }
      return err(new UpdateDocumentMetadataError("An unexpected error occurred while updating document metadata"));
    }
  }
}

export class UpdateDocumentMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpdateDocumentMetadataError";
  }
}
