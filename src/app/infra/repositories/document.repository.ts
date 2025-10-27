import { Effect as E, Option as O, pipe, Clock } from "effect"
import { injectable, inject } from "tsyringe"
import { DocumentEntity } from "@domain/document/document.entity"
import {
  DocumentRepository,
  type DocumentSearchFilters,
} from "@domain/document/document.repository"
import {
  DocumentNotFoundError,
  DocumentValidationError,
} from "@domain/document/document.error"
import { ValidationError } from "@domain/utils/base.errors"
import { type Paginated, PaginationOptions, defaultPaginationOptions, calculateTotalPages } from "@domain/utils/pagination"
import { DocumentId, UserId, WorkspaceId } from "@domain/refined/ids"
import { documents, type DocumentModel } from "@infra/db/models/document.model"
import { accessPolicies } from "@infra/db/models/access-policy.model"
import { DocumentMapper } from "@infra/db/mappers"
import { eq, and, or, sql, count, type SQL } from "drizzle-orm"
import type { DatabaseInterface } from "@infra/db/interfaces"
import { getErrorMessage, translateDbError, translateQueryError } from "@infra/db/errors"
import { DatabaseError } from "@domain/utils/base.errors"
import { fetchSingle, fetchMultiple } from "./helpers"
import { TOKENS } from "@infra/di/container"

/**
 * Drizzle-based Document Repository Implementation
 */
@injectable()
export class DocumentDrizzleRepository extends DocumentRepository {
  constructor(@inject(TOKENS.DATABASE_CONNECTION) private readonly db: DatabaseInterface) { 
    super() 
  }

  // ========== Repository Methods ==========

  findById(
    id: DocumentId
  ): E.Effect<O.Option<DocumentEntity>, DocumentNotFoundError | ValidationError | DatabaseError, never> {
    return pipe(
      fetchSingle(
        () => this.db.select().from(documents).where(eq(documents.id, id)).limit(1),
        DocumentMapper.fromDb,
        "Document",
        DocumentNotFoundError
      ),
      E.mapError((error): DocumentNotFoundError | ValidationError | DatabaseError =>
        error instanceof DocumentValidationError
          ? new ValidationError(error.message, error.field, error.value)
          : error
      )
    )
  }

  findByOwner(
    workspaceId: WorkspaceId,
    ownerId: UserId
  ): E.Effect<readonly DocumentEntity[], DocumentNotFoundError | ValidationError | DatabaseError, never> {
    return pipe(
      fetchMultiple(
        () => this.db.select().from(documents).where(
          and(
            eq(documents.workspaceId, workspaceId),
            eq(documents.ownerId, ownerId)
          )
        ),
        DocumentMapper.fromDb,
        "Document",
        DocumentNotFoundError
      ),
      E.mapError((error): DocumentNotFoundError | ValidationError | DatabaseError =>
        error instanceof DocumentValidationError
          ? new ValidationError(error.message, error.field, error.value)
          : error
      )
    )
  }

  // ========== Pure Helper Functions ==========

  private buildSearchConditions(filters: DocumentSearchFilters): SQL[] {
    const { workspaceId, query, ownerId, tags, publishStatus } = filters
    
    const conditions: (SQL | undefined)[] = [
      // Workspace filter - REQUIRED for tenant isolation
      eq(documents.workspaceId, workspaceId),
      
      // Owner filter
      ownerId ? eq(documents.ownerId, ownerId) : undefined,
      
      // Publish status filter
      publishStatus ? eq(documents.publishStatus, publishStatus) : undefined,
      
      // Declarative regex-based text search (searches title and description)
      query && query.trim().length > 0
        ? this.buildTextSearchCondition(query.trim())
        : undefined,
      
      // Tag filter - checks if any provided tags exist in document's tags array
      tags && tags.length > 0
        ? this.buildTagSearchCondition(tags)
        : undefined
    ]

    return conditions.filter((condition): condition is SQL => condition !== undefined)
  }

  /**
   * Builds SQL condition for document access based on actor permissions.
   * Returns documents where:
   * - Actor is the owner (full access)
   * - OR Actor has explicit read access via access policies
   * - OR Actor's roles have access via role-based policies
   */
  private buildAccessCondition(actorId: UserId): SQL {
    // Access condition: user is owner OR has matching access policy
    return or(
      // Owner has full access
      eq(documents.ownerId, actorId),
      // OR has explicit user-based policy with read access
      sql`EXISTS (
        SELECT 1 FROM ${accessPolicies} 
        WHERE ${accessPolicies.resourceId} = ${documents.id}
          AND (
            (${accessPolicies.subjectType} = 'user' AND ${accessPolicies.subjectId} = ${actorId})
            OR (${accessPolicies.subjectType} = 'role' AND ${accessPolicies.role} IS NOT NULL)
          )
          AND ${accessPolicies.actions}::jsonb @> '["read"]'::jsonb
      )`
    )!
  }

  private buildTextSearchCondition(query: string): SQL {

    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    const pattern = `.*${escapedQuery}.*`
    
    return or(
      sql`${documents.title} ~* ${pattern}`,
      sql`${documents.description} ~* ${pattern}`
    )!
  }

  private buildTagSearchCondition(tags: readonly string[]): SQL {
    return sql`${documents.tags}::jsonb ?| array[${sql.join(
      tags.map(tag => sql`${tag}`),
      sql`, `
    )}]`
  }

  search(
    filters: DocumentSearchFilters
  ): E.Effect<Paginated<DocumentEntity>, DocumentNotFoundError | ValidationError | DatabaseError, never> {
    const paginationOptions = filters.paginationOptions ?? defaultPaginationOptions()
    const offset = (paginationOptions.pageNum - 1) * paginationOptions.pageSize

    return pipe(
      E.tryPromise({
        try: async () => {
          const conditions = this.buildSearchConditions(filters)
          
          // Add access condition if actor context is provided
          const accessCondition = filters.actorId 
            ? this.buildAccessCondition(filters.actorId)
            : undefined
          
          // Combine all conditions
          const allConditions = [...conditions, accessCondition].filter(
            (c): c is SQL => c !== undefined
          )
          const whereCondition = allConditions.length ? and(...allConditions) : undefined

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
            total: Number(totalResult[0]?.count ?? 0)
          }
        },
        catch: (error) => translateQueryError(
          error,
          { operation: "search", entityType: "Document", field: "query", value: "search" },
          (message, field, value, details) => new DocumentNotFoundError(message, field, value, details)
        )
      }),
      E.flatMap(({ data, total }) =>
        data.length === 0
          ? E.succeed({
              data: [] as readonly DocumentEntity[],
              total,
              pageNum: paginationOptions.pageNum,
              pageSize: paginationOptions.pageSize,
              totalPages: calculateTotalPages(total, paginationOptions.pageSize)
            } as Paginated<DocumentEntity>)
          : pipe(
              E.forEach(data, (row) =>
                pipe(
                  DocumentMapper.fromDb(row),
                  E.provideService(Clock.Clock, Clock.make()),
                  E.mapError((error): DocumentNotFoundError | ValidationError =>
                    error instanceof DocumentValidationError
                      ? new ValidationError(error.message, error.field, error.value)
                      : error
                  )
                )
              ),
              E.map((items): Paginated<DocumentEntity> => ({
                data: items,
                total,
                pageNum: paginationOptions.pageNum,
                pageSize: paginationOptions.pageSize,
                totalPages: calculateTotalPages(total, paginationOptions.pageSize)
              }))
            )
      )
    )
  }

  exists(
    id: DocumentId
  ): E.Effect<boolean, DatabaseError, never> {
    return pipe(
      E.tryPromise({
        try: (): Promise<Pick<DocumentModel, "id">[]> =>
          this.db.select({ id: documents.id }).from(documents).where(eq(documents.id, id)).limit(1),
        catch: (error) => new DatabaseError(
          `Database error during exists check on Document`,
          { originalError: error }
        )
      }),
      E.map((result) => result.length > 0)
    )
  }

  private ensureExists(id: DocumentId): E.Effect<void, DocumentNotFoundError | DatabaseError, never> {
    return pipe(
      this.exists(id),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () => E.succeed(undefined),
          onFalse: () => E.fail(new DocumentNotFoundError(`Document not found: id=${id}`, "id", id))
        })
      )
    )
  }

  private mapDocumentSaveError(error: unknown, document: DocumentEntity): DocumentValidationError | ValidationError | DatabaseError {
    return error instanceof DatabaseError
      ? error
      : error instanceof ValidationError
      ? new DocumentValidationError(
          error.message,
          error.field,
          error.value
        )
      : new DocumentValidationError(
          `Failed to save document: ${getErrorMessage(error)}`,
          "save",
          document.id
        )
  }

  save(
    document: DocumentEntity
  ): E.Effect<DocumentEntity, DocumentValidationError | ValidationError | DatabaseError, never> {
    return pipe(
      this.findById(document.id),
      E.flatMap((existingDoc) =>
        O.match(existingDoc, {
          onNone: () => this.insert(document),
          onSome: () => this.update(document)
        })
      ),
      E.mapError((error) => this.mapDocumentSaveError(error, document))
    )
  }

  private insert(
    document: DocumentEntity
  ): E.Effect<DocumentEntity, ValidationError | DatabaseError | DocumentValidationError, never> {
    return pipe(
      DocumentMapper.toDb(document),
      E.flatMap((dbData) =>
        E.tryPromise({
          try: () => this.db.insert(documents).values(dbData),
          catch: (error) => translateDbError(
            error,
            { operation: "insert", entityType: "Document" },
            {
              createConflictError: (message: string) => new ValidationError(message, "documentId", document.id),
              createNotFoundError: (field: string, value: string) => new ValidationError(`Document not found: ${field}=${value}`, field, value),
              createValidationError: (message: string, field: string) => new ValidationError(message, field, document.id)
            }
          )
        })
      ),
      E.as(document)
    )
  }

  private update(
    document: DocumentEntity
  ): E.Effect<DocumentEntity, ValidationError | DocumentNotFoundError | DatabaseError | DocumentValidationError, never> {
    return pipe(
      this.ensureExists(document.id),
      E.flatMap(() => DocumentMapper.toDb(document)),
      E.flatMap((dbData) =>
        E.tryPromise({
          try: () => this.db.update(documents).set(dbData).where(eq(documents.id, document.id)),
          catch: (error) => translateDbError(
            error,
            { operation: "update", entityType: "Document" },
            {
              createConflictError: (message: string) => new ValidationError(message, "documentId", document.id),
              createNotFoundError: (field: string, value: string) => new ValidationError(`Document not found: ${field}=${value}`, field, value),
              createValidationError: (message: string, field: string) => new ValidationError(message, field, document.id)
            }
          )
        })
      ),
      E.as(document)
    )
  }

  delete(
    id: DocumentId
  ): E.Effect<boolean, DocumentNotFoundError | DatabaseError, never> {
    return pipe(
      this.exists(id),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () =>
            pipe(
              E.tryPromise({
                try: () => this.db.delete(documents).where(eq(documents.id, id)),
                catch: (error) => translateDbError(
                  error,
                  { operation: "delete", entityType: "Document" },
                  {
                    createConflictError: (message: string) => new DatabaseError(message),
                    createNotFoundError: (field: string, value: string) => new DocumentNotFoundError(`Document not found: ${field}=${value}`, field, value),
                    createValidationError: (message: string) => new DatabaseError(message)
                  }
                )
              }),
              E.as(true)
            ),
          onFalse: () => E.fail(new DocumentNotFoundError(`Document not found: id=${id}`, "id", id))
        })
      )
    )
  }

  list(options?: PaginationOptions): E.Effect<Paginated<DocumentEntity>, DocumentNotFoundError | ValidationError | DatabaseError, never> {
    const paginationOptions = options ?? defaultPaginationOptions()
    const offset = (paginationOptions.pageNum - 1) * paginationOptions.pageSize

    return pipe(
      E.tryPromise({
        try: async () => {
          const [data, totalResult] = await Promise.all([
            this.db
              .select()
              .from(documents)
              .limit(paginationOptions.pageSize)
              .offset(offset)
              .orderBy(documents.createdAt),
            this.db
              .select({ count: count() })
              .from(documents)
          ])

          return { 
            data: data as DocumentModel[], 
            total: Number(totalResult[0]?.count ?? 0)
          }
        },
        catch: (error) => translateQueryError(
          error,
          { operation: "list", entityType: "Document", field: "list", value: "all" },
          (message, field, value, details) => new DocumentNotFoundError(message, field, value, details)
        )
      }),
      E.flatMap(({ data, total }) =>
        data.length === 0
          ? E.succeed({
              data: [] as readonly DocumentEntity[],
              total,
              pageNum: paginationOptions.pageNum,
              pageSize: paginationOptions.pageSize,
              totalPages: calculateTotalPages(total, paginationOptions.pageSize)
            } as Paginated<DocumentEntity>)
          : pipe(
              E.forEach(data, (row) =>
                pipe(
                  DocumentMapper.fromDb(row),
                  E.mapError((error): DocumentNotFoundError | ValidationError =>
                    error instanceof DocumentValidationError
                      ? new ValidationError(error.message, error.field, error.value)
                      : error
                  ),
                  E.provideService(Clock.Clock, Clock.make())
                )
              ),
              E.map((entities): Paginated<DocumentEntity> => ({
                data: entities,
                total,
                pageNum: paginationOptions.pageNum,
                pageSize: paginationOptions.pageSize,
                totalPages: calculateTotalPages(total, paginationOptions.pageSize)
              }))
            )
      )
    )
  }
}
