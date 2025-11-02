import { Effect as E, Option as O, pipe, Clock } from "effect"
import { injectable, inject } from "tsyringe"

import { DocumentAggregate } from "@domain/document/document.aggregate"
import { DocumentEntity } from "@domain/document/document.entity"
import { DocumentAggregateRepository, type DocumentSearchFilters } from "@domain/document/document-aggregate.repository"
import { DocumentNotFoundError, DocumentValidationError } from "@domain/document/document.error"
import { DocumentVersionNotFoundError, DocumentVersionValidationError } from "@domain/documentVersion/document-version.error"
import { BusinessRuleViolationError, ValidationError } from "@domain/utils/base.errors"
import { type Paginated, defaultPaginationOptions, calculateTotalPages } from "@domain/utils/pagination"
import { DocumentId, DocumentVersionId, UserId, WorkspaceId } from "@domain/refined/ids"

import { documents, type DocumentModel } from "@infra/db/models/document.model"
import { documentVersions } from "@infra/db/models/document-version.model"
import { accessPolicies } from "@infra/db/models/access-policy.model"
import { DocumentMapper, DocumentVersionMapper } from "@infra/db/mappers"
import type { DatabaseInterface } from "@infra/db/interfaces"
import { translateDbError } from "@infra/db/errors"
import { withTransaction } from "@infra/db/unit-of-work"
import { TOKENS } from "@infra/di/container"
import { eq, and, or, sql, count, type SQL, inArray } from "drizzle-orm"
import { fetchSingle, fetchMultiple, mapInfraErrorToDomainWithFailFast } from "./helpers"
import { isInfraError } from "app/shared/error-matching"

@injectable()
export class DocumentAggregateDrizzleRepository extends DocumentAggregateRepository {
  constructor(@inject(TOKENS.DATABASE_CONNECTION) private readonly db: DatabaseInterface) {
    super()
  }

  loadById(
    documentId: DocumentId
  ): E.Effect<O.Option<DocumentAggregate>, DocumentNotFoundError | ValidationError, Clock.Clock> {
    return pipe(
      E.tryPromise({
        try: async () => {
          const docRows = await this.db.select().from(documents).where(eq(documents.id, documentId)).limit(1)
          if (docRows.length === 0) return { found: false as const }

          const versionRows = await this.db
            .select()
            .from(documentVersions)
            .where(eq(documentVersions.documentId, documentId))
            .orderBy(documentVersions.version)

          return { found: true as const, docRow: docRows[0]!, versionRows }
        },
        catch: (error) => error
      }),
      E.catchAll((error) =>
        pipe(
          translateDbError(error, { operation: "loadById", entityType: "Document", entityId: documentId }),
          E.catchAll(mapInfraErrorToDomainWithFailFast("Document", (msg, field, value) => new DocumentNotFoundError(msg, field, value)))
        )
      ),
      E.flatMap((result) =>
        result.found === false
          ? E.succeed(O.none<DocumentAggregate>())
          : DocumentMapper.toAggregate(result.docRow, result.versionRows).pipe(
              E.map((agg) => O.some(agg)),
              E.mapError((error) =>
                error instanceof DocumentValidationError
                  ? new ValidationError(error.message, error.field, error.value)
                  : error instanceof DocumentVersionValidationError
                  ? new ValidationError(error.message, error.field, error.value)
                  : error instanceof BusinessRuleViolationError
                  ? new ValidationError(error.message)
                  : error
              )
            )
      )
    )
  }

  save(
    aggregate: DocumentAggregate
  ): E.Effect<
    DocumentAggregate,
    | DocumentValidationError
    | DocumentVersionValidationError
    | ValidationError
    | BusinessRuleViolationError,
    never
  > {
    // Map aggregate to DB rows outside transaction to preserve typed errors
    return pipe(
      // Map document to DB row (Effect that may fail with DocumentValidationError)
      DocumentMapper.toDb(aggregate.document),
      E.flatMap((docRow) =>
        // Map all versions to DB rows (Effect that may fail with DocumentVersionValidationError)
        pipe(
          E.forEach(aggregate.getVersions(), (version) => DocumentVersionMapper.toDb(version)),
          E.map((versionRows) => ({ docRow, versionRows }))
        )
      ),
      // Once mapping succeeds, execute transaction
      E.flatMap(({ docRow, versionRows }) =>
        pipe(
          withTransaction<
            DocumentAggregate,
            DocumentValidationError | DocumentVersionValidationError | BusinessRuleViolationError | ValidationError
          >(this.db, async (tx) => {
            const txDb = tx as unknown as DatabaseInterface

            // Upsert document
            const existingDoc = await txDb
              .select({ id: documents.id })
              .from(documents)
              .where(eq(documents.id, docRow.id))
              .limit(1)

            if (existingDoc.length === 0) {
              await txDb.insert(documents).values(docRow)
            } else {
              await txDb.update(documents).set(docRow).where(eq(documents.id, docRow.id))
            }

            // Aggregate lifecycle persistence: diff version IDs to maintain consistency
            // Query existing version IDs for this document
            const existingVersionIds = await txDb
              .select({ id: documentVersions.id })
              .from(documentVersions)
              .where(eq(documentVersions.documentId, docRow.id))

            // Extract version IDs from aggregate
            const aggregateVersionIds = new Set(versionRows.map((vRow) => vRow.id as DocumentVersionId))
            const existingVersionIdSet = new Set(existingVersionIds.map((row) => row.id as DocumentVersionId))

            // Identify orphaned versions (exist in DB but not in aggregate)
            const orphanedVersionIds = Array.from(existingVersionIdSet).filter(
              (id) => !aggregateVersionIds.has(id)
            )

            // Delete orphaned versions inside transaction (before upserts)
            if (orphanedVersionIds.length > 0) {
              await txDb
                .delete(documentVersions)
                .where(
                  and(
                    eq(documentVersions.documentId, docRow.id),
                    inArray(documentVersions.id, orphanedVersionIds)
                  )
                )
            }

            // Upsert versions (idempotent: insert if missing, update if exists)
            for (const vRow of versionRows) {
              const exists = existingVersionIdSet.has(vRow.id as DocumentVersionId)
              if (!exists) {
                await txDb.insert(documentVersions).values(vRow)
              } else {
                await txDb.update(documentVersions).set(vRow).where(eq(documentVersions.id, vRow.id))
              }
            }

            return aggregate
          }),
          E.catchAll((error) => {
            // Handle infrastructure errors from withTransaction (unexpected errors will fail fast as defects)
            if (isInfraError(error)) {
              return mapInfraErrorToDomainWithFailFast("Document", (msg, field, value) => new DocumentNotFoundError(msg, field, value))(error)
            }
            // Handle unknown database errors
            return pipe(
              translateDbError(error as unknown, { operation: "save", entityType: "Document", entityId: aggregate.document.id }),
              E.catchAll(mapInfraErrorToDomainWithFailFast("Document", (msg, field, value) => new DocumentNotFoundError(msg, field, value)))
            )
          }),
          E.mapError((error): DocumentValidationError | DocumentVersionValidationError | ValidationError | BusinessRuleViolationError => {
            if (error instanceof DocumentValidationError || error instanceof DocumentVersionValidationError || error instanceof BusinessRuleViolationError || error instanceof ValidationError) {
              return error
            }
            // Convert other errors to ValidationError
            return new ValidationError(`Failed to save document aggregate: ${error instanceof Error ? error.message : String(error)}`)
          })
        )
      )
    )
  }

  delete(
    documentId: DocumentId,
    options?: { readonly force?: boolean }
  ): E.Effect<boolean, DocumentNotFoundError | BusinessRuleViolationError, Clock.Clock> {
    return this.loadById(documentId).pipe(
      E.mapError((error): DocumentNotFoundError | BusinessRuleViolationError => {
        // Convert ValidationError from loadById to BusinessRuleViolationError
        if (error instanceof ValidationError) {
          return new BusinessRuleViolationError("load_document_for_deletion", `Failed to load document for deletion: ${error.message}`)
        }
        // Pass through DocumentNotFoundError
        return error
      }),
      E.flatMap((opt): E.Effect<boolean, DocumentNotFoundError | BusinessRuleViolationError, Clock.Clock> =>
        O.match(opt, {
          onNone: (): E.Effect<boolean, DocumentNotFoundError, Clock.Clock> =>
            E.fail(new DocumentNotFoundError(`Document not found: id=${documentId}`, "id", documentId)),
          onSome: (agg): E.Effect<boolean, BusinessRuleViolationError, Clock.Clock> =>
            pipe(
              agg.canDelete(Boolean(options?.force)),
              E.flatMap((): E.Effect<boolean, BusinessRuleViolationError, Clock.Clock> =>
                pipe(
                  withTransaction(this.db, async (tx) => {
                    const txDb = tx as unknown as DatabaseInterface
                    // Deleting the document will cascade to versions via FK
                    await txDb.delete(documents).where(eq(documents.id, documentId))
                    return true
                  }),
                  E.catchAll((error) => {
                    // Handle infrastructure errors from withTransaction (unexpected errors will fail fast as defects)
                    if (isInfraError(error)) {
                      return mapInfraErrorToDomainWithFailFast("Document", (msg, field, value) => new DocumentNotFoundError(msg, field, value))(error)
                    }
                    // Handle unknown database errors
                    return pipe(
                      translateDbError(error as unknown, { operation: "delete", entityType: "Document", entityId: documentId }),
                      E.catchAll(mapInfraErrorToDomainWithFailFast("Document", (msg, field, value) => new DocumentNotFoundError(msg, field, value)))
                    )
                  }),
                  E.mapError((error): BusinessRuleViolationError => {
                    // Convert any error to BusinessRuleViolationError for delete operation
                    if (error instanceof BusinessRuleViolationError) {
                      return error
                    }
                    return new BusinessRuleViolationError("delete_document", `Failed to delete document: ${error instanceof Error ? error.message : String(error)}`)
                  })
                )
              )
            )
        })
      )
    )
  }

  // ===== Document Query Operations (Read Path - Projections) =====

  /**
   * Wrapper for DocumentMapper.fromDb that converts DocumentValidationError to ValidationError
   */
  private mapDocumentFromDb(row: DocumentModel): E.Effect<DocumentEntity, ValidationError, Clock.Clock> {
    return pipe(
      DocumentMapper.fromDb(row),
      E.mapError((error) => new ValidationError(error.message, error.field, error.value))
    )
  }

  findDocumentById(
    documentId: DocumentId
  ): E.Effect<O.Option<DocumentEntity>, DocumentNotFoundError | ValidationError, Clock.Clock> {
    return pipe(
      fetchSingle(
        () => this.db.select().from(documents).where(eq(documents.id, documentId)).limit(1),
        this.mapDocumentFromDb.bind(this),
        {
          entityType: "Document",
          operation: "findDocumentById",
          entityId: documentId
        }
      ),
      E.catchAll((error) => {
        // Map infrastructure errors to domain errors
        if (isInfraError(error)) {
          return mapInfraErrorToDomainWithFailFast("Document", (msg, field, value) => new DocumentNotFoundError(msg, field, value))(error)
        }
        // Pass through ValidationError
        return E.fail(error as ValidationError)
      })
    )
  }

  searchDocuments(
    filters: DocumentSearchFilters
  ): E.Effect<Paginated<DocumentEntity>, DocumentNotFoundError | ValidationError, Clock.Clock> {
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
        catch: (error) => error
      }),
      E.catchAll((error) =>
        pipe(
          translateDbError(error, { operation: "search", entityType: "Document" }),
          E.catchAll(mapInfraErrorToDomainWithFailFast("Document", (msg, field, value) => new DocumentNotFoundError(msg, field, value)))
        )
      ),
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
              E.forEach(data, (row) => this.mapDocumentFromDb(row)),
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

  findDocumentsByOwner(
    workspaceId: WorkspaceId,
    ownerId: UserId
  ): E.Effect<readonly DocumentEntity[], DocumentNotFoundError | ValidationError, Clock.Clock> {
    return pipe(
      fetchMultiple(
        () => this.db.select().from(documents).where(
          and(
            eq(documents.workspaceId, workspaceId),
            eq(documents.ownerId, ownerId)
          )
        ),
        this.mapDocumentFromDb.bind(this),
        {
          entityType: "Document",
          operation: "findDocumentsByOwner"
        }
      ),
      E.catchAll((error) => {
        // Map infrastructure errors to domain errors
        if (isInfraError(error)) {
          return mapInfraErrorToDomainWithFailFast("Document", (msg, field, value) => new DocumentNotFoundError(msg, field, value))(error)
        }
        // Pass through ValidationError
        return E.fail(error as ValidationError)
      })
    )
  }

  // ===== Document Version Lookup Operations (Read Path - Lightweight) =====

  findDocumentIdByVersionId(
    versionId: DocumentVersionId
  ): E.Effect<O.Option<DocumentId>, DocumentVersionNotFoundError | ValidationError, never> {
    return pipe(
      E.tryPromise({
        try: async () => {
          const rows = await this.db
            .select({ documentId: documentVersions.documentId })
            .from(documentVersions)
            .where(eq(documentVersions.id, versionId))
            .limit(1)
          
          return rows.length === 0 ? O.none<DocumentId>() : O.some(rows[0]!.documentId as DocumentId)
        },
        catch: (error) => error
      }),
      E.catchAll((error) =>
        pipe(
          translateDbError(error, { operation: "findDocumentIdByVersionId", entityType: "DocumentVersion", entityId: versionId }),
          E.catchAll(mapInfraErrorToDomainWithFailFast("DocumentVersion", (msg, field, value) => new DocumentVersionNotFoundError(msg, field, value)))
        )
      ),
      E.mapError((error): DocumentVersionNotFoundError | ValidationError => {
        if (error instanceof DocumentVersionNotFoundError) {
          return error
        }
        // Convert other errors to ValidationError
        return new ValidationError(`Failed to find document ID by version ID: ${error instanceof Error ? error.message : String(error)}`)
      })
    )
  }

  // ===== Private Helper Methods =====

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
}


