import { Effect } from "effect"
import { DocumentEntity } from "../entities/document.entity";
import { DocumentAccessPolicy, DocumentAccessContext } from "../policies/document-access.policy";
import { Permission } from "../entities/permission.entity";
import { DocumentId, UserId } from "../value-objects/id.vo";
import { MimeType, FileSize } from "../value-objects/file-ref.vo";
import { Role } from "../schema/access-policy.schema";
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
  ): Promise<Effect.Effect<DocumentEntity, DocumentError>> {
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
      const documentId = ownerId; // placeholder: generate via VO factory if needed externally
      const storageKey = this.generateStorageKey(documentId, mimeType);
      
      // Create document entity
      const document = (await DocumentEntity.createNew({
        id: documentId,
        ownerId,
        title,
        currentVersionId: documentId as any
      }).pipe(Effect.mapError((e) => new DocumentError(e.message)))) as any;

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
            throw new DocumentError("Failed to store file");
          }
          
          fileStored = true;
          cleanupRequired = true;
          this.logger.debug({ documentId, storageKey }, "File stored successfully");

          // Then save to database within transaction
          this.logger.debug({ documentId }, "Saving document to database");
          const saved = await this.documentRepository.saveInTransaction(document, tx);
          if (!saved) {
            this.logger.error({ 
              documentId, 
              error: "Unknown error" 
            }, "Failed to save document to database");
            throw new DocumentError("Failed to save document to database");
          }

          // If we reach here, both operations succeeded
          cleanupRequired = false;
          this.logger.debug({ documentId }, "Document saved successfully");
          return saved;
          
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
      if (result) {
        logPerformance(this.logger, 'create_document', startTime, {
          documentId: (result as any).id,
          ownerId,
          fileSize: fileData.length,
          tagCount: tags.length
        });
        
        this.logger.info({ 
          documentId: (result as any).id, 
          title,
          fileSize: fileData.length 
        }, "Document created successfully");
      }

      return Effect.succeed(result as any);

    } catch (error) {
      this.logger.error({ 
        ownerId,
        title,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      }, "Unexpected error during document creation");
      
      return Effect.fail(new DocumentError(
        `Failed to create document: ${error instanceof Error ? error.message : 'Unknown error'}`
      ));
    }
  }

  async updateMetadata(
    documentId: DocumentId,
    userId: UserId,
    roles: readonly Role[],
    metadata: Record<string, unknown>,
    userPermissions: Permission[]
  ): Promise<Effect.Effect<DocumentEntity, DocumentError>> {
    // Get existing document
    const document = await this.documentRepository.findById(documentId);
    if (!document) {
      return Effect.fail(new DocumentError("Document not found"));
    }

    // Check permissions using new system
    const canWrite = this.checkDocumentAccess(
      documentId,
      document.ownerId,
      userId,
      roles,
      "write",
      userPermissions
    );

    if (!canWrite) return Effect.fail(new DocumentError("Insufficient permissions to update document"));

    // Update metadata
    const updatedDocument = document.updateMetadata(metadata);

    // Save updated document
    const saved = await this.documentRepository.save(updatedDocument as any);
    return Effect.succeed(saved as any);
  }

  async deleteDocument(
    documentId: DocumentId,
    userId: UserId,
    roles: readonly Role[],
    userPermissions: Permission[]
  ): Promise<Effect.Effect<void, DocumentError>> {
    // Get existing document
    const document = await this.documentRepository.findById(documentId);
    if (!document) return Effect.fail(new DocumentError("Document not found"));

    // Check permissions using new system
    const canDelete = this.checkDocumentAccess(
      documentId,
      document.ownerId,
      userId,
      roles,
      "admin", // Delete requires admin level access
      userPermissions
    );

    if (!canDelete) return Effect.fail(new DocumentError("Insufficient permissions to delete document"));

    // Delete from storage first
    await this.fileStorage.delete((document as any).storageKey);

    // Delete from repository
    await this.documentRepository.delete(documentId);
    return Effect.succeed(undefined);
  }

  async getDocument(
    documentId: DocumentId,
    userId: UserId,
    roles: readonly Role[],
    userPermissions: Permission[]
  ): Promise<Effect.Effect<DocumentEntity, DocumentError>> {
    // Get document
    const document = await this.documentRepository.findById(documentId);
    if (!document) return Effect.fail(new DocumentError("Document not found"));

    // Check permissions using new system
    const canRead = this.checkDocumentAccess(
      documentId,
      document.ownerId,
      userId,
      roles,
      "read",
      userPermissions
    );

    if (!canRead) return Effect.fail(new DocumentError("Insufficient permissions to access document"));
    return Effect.succeed(document as any);
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
    roles: readonly Role[],
    requiredLevel: "read" | "write" | "admin",
    userPermissions: Permission[]
  ): boolean {
    const context: DocumentAccessContext = {
      userId,
      roles,
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
