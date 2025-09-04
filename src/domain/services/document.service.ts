import { Document } from "../entities/document.entity";
import { DocumentAccessPolicy, DocumentAccessContext } from "../policies/document-access.policy";
import { Permission } from "../entities/permission.entity";
import { DocumentId, UserId, MimeType, FileSize, newDocumentId } from "../../shared/types/brand";
import { UserRole } from "../entities/user.entity";
import { Result, ok, err } from "../../shared/result/result";
import { createServiceLogger, logPerformance } from "../../shared/logging/logger";

/**
 * Domain service for document business logic.
 * Handles document creation, updates, and business rule enforcement with transaction support.
 */
export class DocumentService {
  private readonly logger = createServiceLogger('DocumentService');

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
    const startTime = Date.now();
    
    try {
      this.logger.info({
        ownerId,
        title,
        mimeType,
        fileSize: fileData.length,
        tagCount: tags.length
      }, "Starting document creation");

      // Generate document ID and storage key
      const documentId = newDocumentId();
      const storageKey = this.generateStorageKey(documentId, mimeType);
      
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

      // Execute file storage and database write in a transaction-like manner
      // Since file storage is external, we handle it with proper cleanup
      let fileStored = false;
      let cleanupRequired = false;

      const result = await this.documentRepository.executeInTransaction(async (tx) => {
        try {
          this.logger.debug({ documentId, storageKey }, "Storing file");
          
          // First, store the file
          const storeResult = await this.fileStorage.store(storageKey, fileData);
          if (!storeResult.ok) {
            this.logger.error({ 
              documentId, 
              storageKey, 
              error: storeResult.error.message 
            }, "Failed to store file");
            return err(new DocumentError("Failed to store file"));
          }
          
          fileStored = true;
          cleanupRequired = true;
          this.logger.debug({ documentId, storageKey }, "File stored successfully");

          // Then save to database within transaction
          this.logger.debug({ documentId }, "Saving document to database");
          const saveResult = await this.documentRepository.saveInTransaction(document, tx);
          if (!saveResult.ok) {
            this.logger.error({ 
              documentId, 
              error: saveResult.error.message 
            }, "Failed to save document to database");
            return err(new DocumentError("Failed to save document to database"));
          }

          // If we reach here, both operations succeeded
          cleanupRequired = false;
          this.logger.debug({ documentId }, "Document saved successfully");
          return ok(saveResult.value);
          
        } catch (error) {
          this.logger.error({ 
            documentId, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          }, "Error during document creation transaction");
          // Any error here will trigger transaction rollback
          throw error;
        } finally {
          // Cleanup file if transaction failed but file was stored
          if (cleanupRequired && fileStored) {
            this.logger.warn({ documentId, storageKey }, "Cleaning up file after transaction failure");
            try {
              await this.fileStorage.delete(storageKey);
              this.logger.info({ documentId, storageKey }, "File cleanup successful");
            } catch (cleanupError) {
              this.logger.error({ 
                documentId, 
                storageKey, 
                cleanupError: cleanupError instanceof Error ? cleanupError.message : 'Unknown error'
              }, "Failed to cleanup file after transaction failure");
            }
          }
        }
      });

      // Log performance and result
      if (result.ok) {
        logPerformance(this.logger, 'create_document', startTime, {
          documentId: result.value.id,
          ownerId,
          fileSize: fileData.length,
          tagCount: tags.length
        });
        
        this.logger.info({ 
          documentId: result.value.id, 
          title,
          fileSize: fileData.length 
        }, "Document created successfully");
      }

      return result;

    } catch (error) {
      this.logger.error({ 
        ownerId,
        title,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      }, "Unexpected error during document creation");
      
      return err(new DocumentError(
        `Failed to create document: ${error instanceof Error ? error.message : 'Unknown error'}`
      ));
    }
  }

  async updateMetadata(
    documentId: DocumentId,
    userId: UserId,
    userRole: UserRole,
    metadata: Record<string, unknown>,
    userPermissions: Permission[]
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

    // Check permissions using new system
    const canWrite = this.checkDocumentAccess(
      documentId,
      document.ownerId,
      userId,
      userRole,
      "write",
      userPermissions
    );

    if (!canWrite) {
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
    userPermissions: Permission[]
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

    // Check permissions using new system
    const canDelete = this.checkDocumentAccess(
      documentId,
      document.ownerId,
      userId,
      userRole,
      "admin", // Delete requires admin level access
      userPermissions
    );

    if (!canDelete) {
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
    userPermissions: Permission[]
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

    // Check permissions using new system
    const canRead = this.checkDocumentAccess(
      documentId,
      document.ownerId,
      userId,
      userRole,
      "read",
      userPermissions
    );

    if (!canRead) {
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

  /**
   * Helper method to check document access using the new permission system.
   */
  private checkDocumentAccess(
    documentId: DocumentId,
    documentOwnerId: UserId,
    userId: UserId,
    userRole: UserRole,
    requiredLevel: "read" | "write" | "admin",
    userPermissions: Permission[]
  ): boolean {
    const context: DocumentAccessContext = {
      userId,
      userRole,
      documentId,
      documentOwnerId,
      userPermissions,
    };

    const accessResult = DocumentAccessPolicy.canAccess(context, requiredLevel);
    return accessResult.granted;
  }
}

// Domain interfaces (ports)
export interface DocumentRepository {
  findById(id: DocumentId): Promise<Result<Document | null, Error>>;
  findByOwner(ownerId: UserId): Promise<Result<Document[], Error>>;
  search(filters: DocumentSearchFilters): Promise<Result<Document[], Error>>;
  save(document: Document): Promise<Result<Document, Error>>;
  delete(id: DocumentId): Promise<Result<void, Error>>;
  
  // Transaction support
  saveInTransaction(document: Document, tx: import("../../lib/db/connection").DatabaseTransaction): Promise<Result<Document, Error>>;
  deleteInTransaction(id: DocumentId, tx: import("../../lib/db/connection").DatabaseTransaction): Promise<Result<void, Error>>;
  executeInTransaction<T>(operation: (tx: import("../../lib/db/connection").DatabaseTransaction) => Promise<Result<T, Error>>): Promise<Result<T, Error>>;
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
