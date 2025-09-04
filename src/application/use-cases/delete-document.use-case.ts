import { Result, ok, err } from "../../shared/result/result";
import { DocumentService } from "../../domain/services/document.service";
import { UserId, asDocumentId } from "../../shared/types/brand";
import { UserRole } from "../../domain/entities/user.entity";
import type { Permission } from "../../domain/policies/document.policy";
import { createServiceLogger, logPerformance } from "../../shared/logging/logger";

export interface DeleteDocumentRequest {
  documentId: string;
  userId: UserId;
  userRole: UserRole;
  directPermission?: Permission;
}

export interface DeleteDocumentResponse {
  success: boolean;
  message: string;
}

export class DeleteDocumentUseCase {
  private readonly logger = createServiceLogger('DeleteDocumentUseCase');
  
  constructor(private readonly documentService: DocumentService) {}

  async execute(request: DeleteDocumentRequest): Promise<Result<DeleteDocumentResponse, DeleteDocumentError>> {
    const startTime = Date.now();
    
    try {
      const documentId = asDocumentId(request.documentId);

      this.logger.info({
        documentId: request.documentId,
        userId: request.userId,
        userRole: request.userRole
      }, "Starting document deletion");

      const result = await this.documentService.deleteDocument(
        documentId,
        request.userId,
        request.userRole,
        request.directPermission
      );

      if (!result.ok) {
        this.logger.warn({
          documentId: request.documentId,
          userId: request.userId,
          error: result.error.message
        }, "Document deletion failed");
        return err(new DeleteDocumentError(result.error.message));
      }

      // Log successful deletion
      logPerformance(this.logger, 'delete_document', startTime, {
        documentId: request.documentId,
        userId: request.userId
      });

      this.logger.info({
        documentId: request.documentId,
        userId: request.userId
      }, "Document deleted successfully");

      return ok({
        success: true,
        message: "Document deleted successfully"
      });

    } catch (error) {
      this.logger.error({
        documentId: request.documentId,
        userId: request.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      }, "Unexpected error during document deletion");
      
      if (error instanceof Error) {
        return err(new DeleteDocumentError(error.message));
      }
      return err(new DeleteDocumentError("An unexpected error occurred while deleting document"));
    }
  }
}

export class DeleteDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeleteDocumentError";
  }
}
