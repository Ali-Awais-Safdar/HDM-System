import { Result, ok, err } from "../../shared/result/result";
import { DocumentService } from "../../domain/services/document.service";
import { UserId, asDocumentId } from "../../shared/types/brand";
import { UserRole } from "../../domain/entities/user.entity";
import type { Permission } from "../../domain/policies/document.policy";

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
  constructor(private readonly documentService: DocumentService) {}

  async execute(request: UpdateDocumentMetadataRequest): Promise<Result<UpdateDocumentMetadataResponse, UpdateDocumentMetadataError>> {
    try {
      const documentId = asDocumentId(request.documentId);

      const result = await this.documentService.updateMetadata(
        documentId,
        request.userId,
        request.userRole,
        request.metadata,
        request.directPermission
      );

      if (!result.ok) {
        return err(new UpdateDocumentMetadataError(result.error.message));
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
