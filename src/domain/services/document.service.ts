import { Document } from "../entities/document.entity";
import { DocumentPolicy, DocumentPermissionCheck } from "../policies/document.policy";
import { DocumentId, UserId, MimeType, FileSize, newDocumentId } from "../../shared/types/brand";
import { UserRole } from "../entities/user.entity";
import { Result, ok, err } from "../../shared/result/result";

/**
 * Domain service for document business logic.
 * Handles document creation, updates, and business rule enforcement.
 */
export class DocumentService {
  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly fileStorage: FileStorage
  ) {}

  async createDocument(
    ownerId: UserId,
    title: string,
    mimeType: MimeType,
    fileData: Buffer,
    metadata: Record<string, unknown> = {},
    tags: string[] = []
  ): Promise<Result<Document, DocumentError>> {
    try {
      // Generate document ID and storage key
      const documentId = newDocumentId();
      const storageKey = this.generateStorageKey(documentId, mimeType);
      
      // Store file
      const storeResult = await this.fileStorage.store(storageKey, fileData);
      if (!storeResult.ok) {
        return err(new DocumentError("Failed to store file"));
      }

      // Create document entity
      const document = Document.create({
        id: documentId,
        ownerId,
        title,
        mimeType,
        size: fileData.length as FileSize,
        storageKey,
        metadata,
        tags
      });

      // Save to repository
      const saveResult = await this.documentRepository.save(document);
      if (!saveResult.ok) {
        // Cleanup stored file on database failure
        await this.fileStorage.delete(storageKey);
        return err(new DocumentError("Failed to save document"));
      }

      return ok(saveResult.value);
    } catch {
      return err(new DocumentError("Failed to create document"));
    }
  }

  async updateMetadata(
    documentId: DocumentId,
    userId: UserId,
    userRole: UserRole,
    metadata: Record<string, unknown>,
    directPermission?: import("../policies/document.policy").Permission
  ): Promise<Result<Document, DocumentError>> {
    // Get existing document
    const documentResult = await this.documentRepository.findById(documentId);
    if (!documentResult.ok) {
      return err(new DocumentError("Failed to retrieve document"));
    }

    if (!documentResult.value) {
      return err(new DocumentError("Document not found"));
    }

    const document = documentResult.value;

    // Check permissions
    const permissionCheck: DocumentPermissionCheck = {
      userId,
      userRole,
      documentId,
      ownerId: document.ownerId,
      directPermission
    };

    if (!DocumentPolicy.canWrite(permissionCheck)) {
      return err(new DocumentError("Insufficient permissions to update document"));
    }

    // Update metadata
    const updatedDocument = document.updateMetadata(metadata);

    // Save updated document
    const saveResult = await this.documentRepository.save(updatedDocument);
    if (!saveResult.ok) {
      return err(new DocumentError("Failed to update document"));
    }

    return ok(saveResult.value);
  }

  async deleteDocument(
    documentId: DocumentId,
    userId: UserId,
    userRole: UserRole,
    directPermission?: import("../policies/document.policy").Permission
  ): Promise<Result<void, DocumentError>> {
    // Get existing document
    const documentResult = await this.documentRepository.findById(documentId);
    if (!documentResult.ok) {
      return err(new DocumentError("Failed to retrieve document"));
    }

    if (!documentResult.value) {
      return err(new DocumentError("Document not found"));
    }

    const document = documentResult.value;

    // Check permissions
    const permissionCheck: DocumentPermissionCheck = {
      userId,
      userRole,
      documentId,
      ownerId: document.ownerId,
      directPermission
    };

    if (!DocumentPolicy.canDelete(permissionCheck)) {
      return err(new DocumentError("Insufficient permissions to delete document"));
    }

    // Delete from storage first
    const deleteStorageResult = await this.fileStorage.delete(document.storageKey);
    if (!deleteStorageResult.ok) {
      return err(new DocumentError("Failed to delete file from storage"));
    }

    // Delete from repository
    const deleteResult = await this.documentRepository.delete(documentId);
    if (!deleteResult.ok) {
      return err(new DocumentError("Failed to delete document"));
    }

    return ok(undefined);
  }

  async getDocument(
    documentId: DocumentId,
    userId: UserId,
    userRole: UserRole,
    directPermission?: import("../policies/document.policy").Permission
  ): Promise<Result<Document, DocumentError>> {
    // Get document
    const documentResult = await this.documentRepository.findById(documentId);
    if (!documentResult.ok) {
      return err(new DocumentError("Failed to retrieve document"));
    }

    if (!documentResult.value) {
      return err(new DocumentError("Document not found"));
    }

    const document = documentResult.value;

    // Check permissions
    const permissionCheck: DocumentPermissionCheck = {
      userId,
      userRole,
      documentId,
      ownerId: document.ownerId,
      directPermission
    };

    if (!DocumentPolicy.canRead(permissionCheck)) {
      return err(new DocumentError("Insufficient permissions to access document"));
    }

    return ok(document);
  }

  private generateStorageKey(documentId: DocumentId, mimeType: MimeType): string {
    const extension = this.getFileExtension(mimeType);
    return `documents/${documentId}${extension}`;
  }

  private getFileExtension(mimeType: MimeType): string {
    const mimeTypeMap: Record<string, string> = {
      'application/pdf': '.pdf',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'text/plain': '.txt',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    };

    return mimeTypeMap[mimeType] || '';
  }
}

// Domain interfaces (ports)
export interface DocumentRepository {
  findById(id: DocumentId): Promise<Result<Document | null, Error>>;
  findByOwner(ownerId: UserId): Promise<Result<Document[], Error>>;
  search(filters: DocumentSearchFilters): Promise<Result<Document[], Error>>;
  save(document: Document): Promise<Result<Document, Error>>;
  delete(id: DocumentId): Promise<Result<void, Error>>;
}

export interface DocumentSearchFilters {
  query?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  ownerId?: UserId;
  limit?: number;
  offset?: number;
}

export interface FileStorage {
  store(key: string, data: Buffer): Promise<Result<string, Error>>;
  retrieve(key: string): Promise<Result<Buffer, Error>>;
  delete(key: string): Promise<Result<void, Error>>;
  exists(key: string): Promise<Result<boolean, Error>>;
}

// Domain errors
export class DocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentError";
  }
}
