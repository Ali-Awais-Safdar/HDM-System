import { eq, and, ilike, inArray, sql } from "drizzle-orm";
import { Result, ok, err } from "../../../shared/result/result";
import { Document } from "../../../domain/entities/document.entity";
import { DocumentRepository, DocumentSearchFilters } from "../../../domain/services/document.service";
import { DocumentId, UserId, asDocumentId, asUserId, asMimeType, asFileSize } from "../../../shared/types/brand";
import { documents, tags, documentTags } from "../../../lib/db/schema";

/**
 * Drizzle ORM implementation of the Document Repository.
 * Handles database operations for documents with advanced search capabilities.
 */
export class DrizzleDocumentRepository implements DocumentRepository {
  constructor(private readonly db: any) {} // TODO: Type this properly with Drizzle DB type

  async findById(id: DocumentId): Promise<Result<Document | null, Error>> {
    try {
      const result = await this.db
        .select()
        .from(documents)
        .where(eq(documents.id, id))
        .limit(1);

      if (result.length === 0) {
        return ok(null);
      }

      const documentRow = result[0];
      const document = this.mapToDocument(documentRow);
      return ok(document);
    } catch {
      return err(new Error("Failed to find document by ID"));
    }
  }

  async findByOwner(ownerId: UserId): Promise<Result<Document[], Error>> {
    try {
      const result = await this.db
        .select()
        .from(documents)
        .where(eq(documents.ownerId, ownerId))
        .orderBy(documents.createdAt);

      const documentList = result.map((row: any) => this.mapToDocument(row));
      return ok(documentList);
    } catch {
      return err(new Error("Failed to find documents by owner"));
    }
  }

  async search(filters: DocumentSearchFilters): Promise<Result<Document[], Error>> {
    try {
      let query = this.db.select().from(documents);

      // Build where conditions
      const conditions = [];

      // Owner filter
      if (filters.ownerId) {
        conditions.push(eq(documents.ownerId, filters.ownerId));
      }

      // Text search in title
      if (filters.query) {
        conditions.push(ilike(documents.title, `%${filters.query}%`));
      }

      // Metadata filter using JSONB containment
      if (filters.metadata && Object.keys(filters.metadata).length > 0) {
        conditions.push(
          sql`${documents.metadata} @> ${JSON.stringify(filters.metadata)}::jsonb`
        );
      }

      // Tags filter - documents that have all specified tags
      if (filters.tags && filters.tags.length > 0) {
        // This is a complex query that finds documents having all specified tags
        // We'll use a subquery approach for this
        const tagSubquery = this.db
          .select({ documentId: documentTags.documentId })
          .from(documentTags)
          .innerJoin(tags, eq(documentTags.tagId, tags.id))
          .where(inArray(tags.name, filters.tags))
          .groupBy(documentTags.documentId)
          .having(sql`count(*) = ${filters.tags.length}`);

        conditions.push(
          inArray(documents.id, tagSubquery)
        );
      }

      // Apply all conditions
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      // Apply pagination
      if (filters.offset) {
        query = query.offset(filters.offset);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      } else {
        query = query.limit(50); // Default limit
      }

      // Order by creation date (newest first)
      query = query.orderBy(sql`${documents.createdAt} DESC`);

      const result = await query;
      const documentList = result.map((row: any) => this.mapToDocument(row));
      return ok(documentList);
    } catch {
      return err(new Error("Failed to search documents"));
    }
  }

  async save(document: Document): Promise<Result<Document, Error>> {
    try {
      // Check if document exists
      const existingResult = await this.findById(document.id);
      if (!existingResult.ok) {
        return err(existingResult.error);
      }

      const documentRow = {
        id: document.id,
        ownerId: document.ownerId,
        title: document.title,
        mimeType: document.mimeType,
        size: document.size,
        storageKey: document.storageKey,
        metadata: document.metadata,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt
      };

      if (existingResult.value === null) {
        // Insert new document
        await this.db.insert(documents).values(documentRow);
      } else {
        // Update existing document
        await this.db
          .update(documents)
          .set({
            title: documentRow.title,
            mimeType: documentRow.mimeType,
            size: documentRow.size,
            storageKey: documentRow.storageKey,
            metadata: documentRow.metadata,
            updatedAt: documentRow.updatedAt
          })
          .where(eq(documents.id, document.id));
      }

      // Handle tags - this is a simplified approach
      // In a more complex system, you might want to handle tag creation/linking separately
      await this.updateDocumentTags(document.id, document.tags);

      return ok(document);
    } catch {
      return err(new Error("Failed to save document"));
    }
  }

  async delete(id: DocumentId): Promise<Result<void, Error>> {
    try {
      // Delete document tags first (foreign key constraint)
      await this.db.delete(documentTags).where(eq(documentTags.documentId, id));
      
      // Delete the document
      await this.db.delete(documents).where(eq(documents.id, id));
      
      return ok(undefined);
    } catch {
      return err(new Error("Failed to delete document"));
    }
  }

  private async updateDocumentTags(documentId: DocumentId, tagNames: string[]): Promise<void> {
    // This is a simplified implementation
    // In a production system, you'd want more sophisticated tag management
    
    // Remove existing document-tag associations
    await this.db.delete(documentTags).where(eq(documentTags.documentId, documentId));

    if (tagNames.length === 0) {
      return;
    }

    // Create tags if they don't exist and get their IDs
    const tagIds: string[] = [];
    for (const tagName of tagNames) {
      // Try to find existing tag
      const existingTags = await this.db
        .select()
        .from(tags)
        .where(eq(tags.name, tagName))
        .limit(1);

      let tagId: string;
      if (existingTags.length > 0) {
        tagId = existingTags[0].id;
      } else {
        // Create new tag
        const newTagId = crypto.randomUUID(); // Simple UUID generation
        await this.db.insert(tags).values({
          id: newTagId,
          name: tagName
        });
        tagId = newTagId;
      }
      tagIds.push(tagId);
    }

    // Create document-tag associations
    const documentTagRows = tagIds.map(tagId => ({
      documentId,
      tagId
    }));

    if (documentTagRows.length > 0) {
      await this.db.insert(documentTags).values(documentTagRows);
    }
  }

  private mapToDocument(row: any): Document {
    return Document.create({
      id: asDocumentId(row.id),
      ownerId: asUserId(row.ownerId),
      title: row.title,
      mimeType: asMimeType(row.mimeType),
      size: asFileSize(row.size),
      storageKey: row.storageKey,
      metadata: row.metadata || {},
      tags: [] // Tags would need to be loaded separately in a complete implementation
    });
  }
}
