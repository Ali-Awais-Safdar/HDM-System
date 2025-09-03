import { Result, ok, err } from "../../shared/result/result";
import { DocumentService } from "../../domain/services/document.service";
import { UserId, asDocumentId } from "../../shared/types/brand";
import { UserRole } from "../../domain/entities/user.entity";
import type { Permission } from "../../domain/policies/document.policy";

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
  constructor(private readonly documentService: DocumentService) {}

  async execute(request: GetDocumentRequest): Promise<Result<GetDocumentResponse, GetDocumentError>> {
    try {
      const documentId = asDocumentId(request.documentId);

      const result = await this.documentService.getDocument(
        documentId,
        request.userId,
        request.userRole,
        request.directPermission
      );

      if (!result.ok) {
        return err(new GetDocumentError(result.error.message));
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
