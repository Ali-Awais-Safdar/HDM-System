import { Result, ok, err } from "../../shared/result/result";
import { DocumentService } from "../../domain/services/document.service";
import { UserId, asDocumentId } from "../../shared/types/brand";
import { UserRole } from "../../domain/entities/user.entity";
import type { Permission } from "../../domain/policies/document.policy";

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
  constructor(private readonly documentService: DocumentService) {}

  async execute(request: DeleteDocumentRequest): Promise<Result<DeleteDocumentResponse, DeleteDocumentError>> {
    try {
      const documentId = asDocumentId(request.documentId);

      const result = await this.documentService.deleteDocument(
        documentId,
        request.userId,
        request.userRole,
        request.directPermission
      );

      if (!result.ok) {
        return err(new DeleteDocumentError(result.error.message));
      }

      return ok({
        success: true,
        message: "Document deleted successfully"
      });

    } catch (error) {
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
