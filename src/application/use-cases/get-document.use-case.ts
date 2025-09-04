import { Result, ok, err } from "../../shared/result/result";
import { DocumentService } from "../../domain/services/document.service";
import { UserId, asDocumentId } from "../../shared/types/brand";
import { UserRole } from "../../domain/entities/user.entity";
import type { Permission } from "../../domain/policies/document.policy";
import { createServiceLogger, logPerformance } from "../../shared/logging/logger";

export interface GetDocumentRequest {
  documentId: string;
  userId: UserId;
  userRole: UserRole;
  directPermission?: Permission;
}

export interface GetDocumentResponse {
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

export class GetDocumentUseCase {
  private readonly logger = createServiceLogger('GetDocumentUseCase');
  
  constructor(private readonly documentService: DocumentService) {}

  async execute(request: GetDocumentRequest): Promise<Result<GetDocumentResponse, GetDocumentError>> {
    const startTime = Date.now();
    
    try {
      const documentId = asDocumentId(request.documentId);

      this.logger.info({
        documentId: request.documentId,
        userId: request.userId,
        userRole: request.userRole
      }, "Starting document retrieval");

      const result = await this.documentService.getDocument(
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
        }, "Document retrieval failed");
        return err(new GetDocumentError(result.error.message));
      }

      const document = result.value;

      // Log successful retrieval
      logPerformance(this.logger, 'get_document', startTime, {
        documentId: request.documentId,
        userId: request.userId
      });

      this.logger.info({
        documentId: document.id,
        userId: request.userId,
        title: document.title
      }, "Document retrieved successfully");

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
      }, "Unexpected error during document retrieval");
      
      if (error instanceof Error) {
        return err(new GetDocumentError(error.message));
      }
      return err(new GetDocumentError("An unexpected error occurred while retrieving document"));
    }
  }
}

export class GetDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GetDocumentError";
  }
}
