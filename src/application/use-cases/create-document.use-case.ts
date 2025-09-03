import { Result, ok, err } from "../../shared/result/result";
import { DocumentService } from "../../domain/services/document.service";
import { FileUpload } from "../../domain/value-objects/file-upload.vo";
import { UserId } from "../../shared/types/brand";

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
  constructor(private readonly documentService: DocumentService) {}

  async execute(request: CreateDocumentRequest): Promise<Result<CreateDocumentResponse, CreateDocumentError>> {
    try {
      // Validate and create file upload value object
      const fileUpload = FileUpload.create(
        request.file.originalName,
        request.file.mimeType,
        request.file.size,
        request.file.data
      );

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
        return err(new CreateDocumentError(result.error.message));
      }

      const document = result.value;

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
