import { Effect as E, Option as O, pipe } from "effect"
import { DocumentEntity } from "../../../domain/entities/document.entity"
import { DocumentRepository, type DocumentSearchFilters } from "../../../domain/ports/document.repository"
import { DocumentId, UserId } from "../../../domain/value-objects/id.vo"
import { 
  DocumentNotFoundError,
  DocumentValidationError
} from "../../../domain/errors/document.errors"
import { ValidationError } from "../../../domain/errors/domain.errors"
import { toNullable } from "../../../domain/utils/option.utils"
import { type Paginated } from "../../../domain/types/pagination"
import { documents, type DocumentModel } from "../../../lib/db/models"
import { eq, and, or, sql, count, ilike } from "drizzle-orm"
import type { DatabaseInterface } from "../../../lib/db/interfaces"

/**
 * Drizzle-based Document Repository Implementation
 */
export class DocumentDrizzleRepository extends DocumentRepository {
  constructor(private readonly db: DatabaseInterface) { 
    super() 
  }

  // ========== Serialization Helpers ==========

  private toDbSerialized(document: DocumentEntity): E.Effect<DocumentModel, ValidationError, never> {
    return E.sync(() => ({
      id: document.id,
      ownerId: document.ownerId,
      title: document.title,
      description: toNullable(document.description),
      tags: toNullable(document.tags) as string[] | null,
      currentVersionId: document.currentVersionId,
      createdAt: document.createdAt,
      updatedAt: toNullable(document.updatedAt)
    }))
  }

  private fromDbRow(row: DocumentModel): E.Effect<DocumentEntity, ValidationError, never> {
    return DocumentEntity.fromPersistence({
      id: row.id,
      ownerId: row.ownerId,
      title: row.title,
      description: row.description
        ? { _tag: "Some" as const, value: row.description }
        : { _tag: "None" as const },
      tags: row.tags && row.tags.length > 0
        ? { _tag: "Some" as const, value: row.tags }
        : { _tag: "None" as const },
      currentVersionId: row.currentVersionId,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      updatedAt: row.updatedAt 
        ? { _tag: "Some" as const, value: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt }
        : { _tag: "None" as const }
    })
  }

  // ========== Query Helpers ==========

  private executeQuery<T>(query: () => Promise<T>): E.Effect<T, DocumentNotFoundError> {
    return E.tryPromise({
      try: query,
      catch: (error) => new DocumentNotFoundError(
        "unknown",
        { originalError: error instanceof Error ? error.message : String(error) }
      )
    })
  }

  private fetchSingle(
    query: () => Promise<DocumentModel[]>
  ): E.Effect<O.Option<DocumentEntity>, DocumentNotFoundError | ValidationError, never> {
    return pipe(
      this.executeQuery(query),
      E.map(O.fromIterable),
      E.flatMap((option) =>
        O.match(option, {
          onNone: () => E.succeed(O.none()),
          onSome: (row) => pipe(
            this.fromDbRow(row),
            E.map(O.some)
          )
        })
      )
    )
  }

  private fetchMultiple(
    query: () => Promise<DocumentModel[]>
  ): E.Effect<readonly DocumentEntity[], DocumentNotFoundError | ValidationError, never> {
    return pipe(
      this.executeQuery(query),
      E.flatMap((results) => 
        E.all(results.map((row) => this.fromDbRow(row)))
      )
    )
  }

  // ========== Repository Methods ==========

  findById(
    id: DocumentId
  ): E.Effect<O.Option<DocumentEntity>, DocumentNotFoundError | ValidationError, never> {
    return this.fetchSingle(() =>
      this.db.select().from(documents).where(eq(documents.id, id)).limit(1)
    )
  }

  findByOwner(
    ownerId: UserId
  ): E.Effect<readonly DocumentEntity[], DocumentNotFoundError | ValidationError, never> {
    return this.fetchMultiple(() =>
      this.db.select().from(documents).where(eq(documents.ownerId, ownerId))
    )
  }

  search(
    filters: DocumentSearchFilters
  ): E.Effect<Paginated<DocumentEntity>, DocumentNotFoundError | ValidationError, never> {
    return pipe(
      E.tryPromise({
        try: async () => {
          const { query, ownerId, tags, paginationOptions = { pageNum: 1, pageSize: 10 } } = filters
          const offset = (paginationOptions.pageNum - 1) * paginationOptions.pageSize

          // Build where conditions
          const conditions = []
          
          // Owner filter
          if (ownerId) {
            conditions.push(eq(documents.ownerId, ownerId))
          }
          
          // Text search filter (searches title and description)
          if (query && query.trim().length > 0) {
            const searchTerm = `%${query.trim()}%`
            conditions.push(
              or(
                ilike(documents.title, searchTerm),
                ilike(documents.description, searchTerm)
              )
            )
          }
          
          // Checks if any of the provided tags exist in the document's tags array
          if (tags && tags.length > 0) {
            conditions.push(
              sql`${documents.tags}::jsonb ?| array[${sql.join(
                tags.map(tag => sql`${tag}`),
                sql`, `
              )}]`
            )
          }

          const whereCondition = conditions.length ? and(...conditions) : undefined

          // Execute query with pagination
          const [data, totalResult] = await Promise.all([
            this.db
              .select()
              .from(documents)
              .where(whereCondition)
              .limit(paginationOptions.pageSize)
              .offset(offset)
              .orderBy(documents.createdAt),
            this.db
              .select({ count: count() })
              .from(documents)
              .where(whereCondition)
          ])

          return { 
            data: data as DocumentModel[], 
            total: totalResult[0]?.count || 0, 
            paginationOptions 
          }
        },
        catch: (error) => new DocumentNotFoundError(
          "unknown",
          { originalError: error instanceof Error ? error.message : String(error) }
        )
      }),
      E.flatMap(({ data, total, paginationOptions }) =>
        E.all(data.map((row) => this.fromDbRow(row))).pipe(
          E.map((items) => ({
            data: items,
            total,
            pageNum: paginationOptions.pageNum,
            pageSize: paginationOptions.pageSize,
            totalPages: Math.ceil(total / paginationOptions.pageSize)
          }))
        )
      )
    )
  }

  exists(
    id: DocumentId
  ): E.Effect<boolean, DocumentNotFoundError, never> {
    return pipe(
      E.tryPromise({
        try: (): Promise<Pick<DocumentModel, "id">[]> =>
          this.db.select({ id: documents.id }).from(documents).where(eq(documents.id, id)).limit(1),
        catch: () => new DocumentNotFoundError(id)
      }),
      E.map((result) => result.length > 0)
    )
  }

  private ensureExists(id: DocumentId): E.Effect<void, DocumentNotFoundError, never> {
    return pipe(
      this.exists(id),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () => E.succeed(undefined),
          onFalse: () => E.fail(new DocumentNotFoundError(id))
        })
      )
    )
  }

  save(
    document: DocumentEntity
  ): E.Effect<DocumentEntity, DocumentValidationError | ValidationError, never> {
    return pipe(
      // Check if document already exists
      this.findById(document.id),
      E.flatMap((existingDoc) =>
        O.match(existingDoc, {
          onNone: () => this.insert(document),
          onSome: () => this.update(document)
        })
      ),
      E.mapError((error) => {
        if (error instanceof ValidationError) {
          return new DocumentValidationError(
            error.message,
            error.field,
            error.value
          )
        }
        return new DocumentValidationError(
          `Failed to save document: ${error}`,
          undefined,
          { documentId: document.id }
        )
      })
    )
  }

  private insert(
    document: DocumentEntity
  ): E.Effect<DocumentEntity, ValidationError, never> {
    return pipe(
      this.toDbSerialized(document),
      E.flatMap((dbData) =>
        E.tryPromise({
          try: () => this.db.insert(documents).values(dbData),
          catch: (error) => new ValidationError(
            `Failed to insert document: ${error instanceof Error ? error.message : String(error)}`,
            undefined,
            { documentId: document.id }
          )
        })
      ),
      E.as(document)
    )
  }

  private update(
    document: DocumentEntity
  ): E.Effect<DocumentEntity, ValidationError | DocumentNotFoundError, never> {
    return pipe(
      this.ensureExists(document.id),
      E.flatMap(() => this.toDbSerialized(document)),
      E.flatMap((dbData) =>
        E.tryPromise({
          try: () => this.db.update(documents).set(dbData).where(eq(documents.id, document.id)),
          catch: (error) => new ValidationError(
            `Failed to update document: ${error instanceof Error ? error.message : String(error)}`,
            undefined,
            { documentId: document.id }
          )
        })
      ),
      E.as(document)
    )
  }

  delete(
    id: DocumentId
  ): E.Effect<boolean, DocumentNotFoundError, never> {
    return pipe(
      this.exists(id),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () =>
            pipe(
              E.tryPromise({
                try: () => this.db.delete(documents).where(eq(documents.id, id)),
                catch: () => new DocumentNotFoundError(id)
              }),
              E.as(true)
            ),
          onFalse: () => E.succeed(false)
        })
      )
    )
  }
}

