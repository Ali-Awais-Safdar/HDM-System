import { Result, err, ok } from "../../shared/result/result";
import { createServiceLogger, logPerformance } from "../../shared/logging/logger";
import { UserId } from "../../shared/types/brand";
import { DocumentService } from "@domain/services/document.service";
import { FileUpload } from "@domain/value-objects/file-upload.vo";
import { dateToNullable } from "@domain/utils/option.utils";

export interface CreateDocumentRequest {
  title: string;
  file: {
    originalName: string;
    mimeType: string;
    size: number;
    data: Buffer;
  };
  metadata?: Record<string, unknown>;
  tags?: string[];
  ownerId: UserId;
}

export interface CreateDocumentResponse {
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

export class CreateDocumentUseCase {
  private readonly logger = createServiceLogger('CreateDocumentUseCase');
  
  constructor(private readonly documentService: DocumentService) {}

  async execute(request: CreateDocumentRequest): Promise<Result<CreateDocumentResponse, CreateDocumentError>> {
    const startTime = Date.now();
    
    try {
      this.logger.info({
        ownerId: request.ownerId,
        title: request.title,
        fileSize: request.file.size,
        mimeType: request.file.mimeType,
        tagCount: request.tags?.length || 0
      }, "Starting document creation");

      // Validate and create file upload value object
      const fileUploadResult = FileUpload.create(
        request.file.originalName,
        request.file.mimeType,
        request.file.size,
        request.file.data
      );

      if (!fileUploadResult.ok) {
        this.logger.warn({
          ownerId: request.ownerId,
          title: request.title,
          error: fileUploadResult.error.message
        }, "File upload validation failed");
        return err(new CreateDocumentError(fileUploadResult.error.message));
      }

      const fileUpload = fileUploadResult.value;

      // Create document through domain service
      const result = await this.documentService.createDocument(
        request.ownerId,
        request.title,
        fileUpload.mimeType,
        fileUpload.data,
        request.metadata || {},
        request.tags || []
      );

      if (!result.ok) {
        this.logger.warn({
          ownerId: request.ownerId,
          title: request.title,
          error: result.error.message
        }, "Document creation failed");
        return err(new CreateDocumentError(result.error.message));
      }

      const document = result.value;

      // Log successful creation
      logPerformance(this.logger, 'create_document', startTime, {
        documentId: document.id,
        ownerId: request.ownerId,
        fileSize: request.file.size,
        tagCount: request.tags?.length || 0
      });

      this.logger.info({
        documentId: document.id,
        ownerId: request.ownerId,
        title: document.title,
        fileSize: document.size
      }, "Document created successfully");

      return ok({
        id: document.id,
        title: document.title,
        mimeType: document.mimeType,
        size: document.size,
        metadata: document.metadata,
        tags: document.tags,
        ownerId: document.ownerId,
        createdAt: document.createdAt,
        updatedAt: dateToNullable(document.updatedAt)
      });

    } catch (error) {
      this.logger.error({
        ownerId: request.ownerId,
        title: request.title,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      }, "Unexpected error during document creation");
      
      if (error instanceof Error) {
        return err(new CreateDocumentError(error.message));
      }
      return err(new CreateDocumentError("An unexpected error occurred while creating document"));
    }
  }
}

export class CreateDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreateDocumentError";
  }
}
