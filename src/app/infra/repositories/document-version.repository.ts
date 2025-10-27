import { Effect as E, Option as O, pipe, Clock } from "effect"
import { injectable, inject } from "tsyringe"
import { DocumentVersionEntity } from "@domain/documentVersion/document-version.entity"
import { DocumentVersionRepository } from "@domain/documentVersion/document-version.repository"
import {
  DocumentVersionNotFoundError,
  DocumentVersionValidationError,
} from "@domain/documentVersion/document-version.error"
import { ValidationError } from "@domain/utils/base.errors"
import { type Paginated, PaginationOptions, defaultPaginationOptions, calculateTotalPages } from "@domain/utils/pagination"
import { DocumentId, DocumentVersionId } from "@domain/refined/ids"
import { documentVersions, type DocumentVersionModel } from "@infra/db/models/document-version.model"
import { DocumentVersionMapper } from "@infra/db/mappers"
import { eq, and, desc, max, count } from "drizzle-orm"
import type { DatabaseInterface } from "@infra/db/interfaces"
import { isUniqueConstraintError, getErrorMessage, translateDbError, translateQueryError } from "@infra/db/errors"
import { DatabaseError } from "@domain/utils/base.errors"
import { fetchSingle, fetchMultiple } from "./helpers"
import { TOKENS } from "@infra/di/container"

/**
 * Drizzle-based Document Version Repository Implementation
 */
@injectable()
export class DocumentVersionDrizzleRepository extends DocumentVersionRepository {
  constructor(@inject(TOKENS.DATABASE_CONNECTION) private readonly db: DatabaseInterface) { 
    super() 
  }

  // ========== Repository Methods ==========

  findById(
    id: DocumentVersionId
  ): E.Effect<O.Option<DocumentVersionEntity>, DocumentVersionNotFoundError | ValidationError | DatabaseError, never> {
    return pipe(
      fetchSingle(
        () => this.db.select().from(documentVersions).where(eq(documentVersions.id, id)).limit(1),
        DocumentVersionMapper.fromDb,
        "DocumentVersion",
        DocumentVersionNotFoundError
      ),
      E.mapError((error): DocumentVersionNotFoundError | ValidationError | DatabaseError =>
        error instanceof DocumentVersionValidationError
          ? new ValidationError(error.message, error.field, error.value)
          : error
      )
    )
  }

  findByDocumentIdAndVersion(
    documentId: DocumentId,
    version: number
  ): E.Effect<O.Option<DocumentVersionEntity>, DocumentVersionNotFoundError | ValidationError | DatabaseError, never> {
    return pipe(
      fetchSingle(
        () => this.db
          .select()
          .from(documentVersions)
          .where(
            and(
              eq(documentVersions.documentId, documentId),
              eq(documentVersions.version, version)
            )
          )
          .limit(1),
        DocumentVersionMapper.fromDb,
        "DocumentVersion",
        DocumentVersionNotFoundError
      ),
      E.mapError((error): DocumentVersionNotFoundError | ValidationError | DatabaseError =>
        error instanceof DocumentVersionValidationError
          ? new ValidationError(error.message, error.field, error.value)
          : error
      )
    )
  }

  findByDocumentId(
    documentId: DocumentId
  ): E.Effect<readonly DocumentVersionEntity[], DocumentVersionNotFoundError | ValidationError | DatabaseError, never> {
    return pipe(
      fetchMultiple(
        () => this.db
          .select()
          .from(documentVersions)
          .where(eq(documentVersions.documentId, documentId))
          .orderBy(desc(documentVersions.version)),
        DocumentVersionMapper.fromDb,
        "DocumentVersion",
        DocumentVersionNotFoundError
      ),
      E.mapError((error): DocumentVersionNotFoundError | ValidationError | DatabaseError =>
        error instanceof DocumentVersionValidationError
          ? new ValidationError(error.message, error.field, error.value)
          : error
      )
    )
  }

  findLatestByDocumentId(
    documentId: DocumentId
  ): E.Effect<O.Option<DocumentVersionEntity>, DocumentVersionNotFoundError | ValidationError | DatabaseError, never> {
    return pipe(
      fetchSingle(
        () => this.db
          .select()
          .from(documentVersions)
          .where(eq(documentVersions.documentId, documentId))
          .orderBy(desc(documentVersions.version))
          .limit(1),
        DocumentVersionMapper.fromDb,
        "DocumentVersion",
        DocumentVersionNotFoundError
      ),
      E.mapError((error): DocumentVersionNotFoundError | ValidationError | DatabaseError =>
        error instanceof DocumentVersionValidationError
          ? new ValidationError(error.message, error.field, error.value)
          : error
      )
    )
  }

  getNextVersionNumber(
    documentId: DocumentId
  ): E.Effect<number, DocumentVersionNotFoundError | DatabaseError, never> {
    return pipe(
      E.tryPromise({
        try: async () => {
          const result = await this.db
            .select({ maxVersion: max(documentVersions.version) })
            .from(documentVersions)
            .where(eq(documentVersions.documentId, documentId))
          
          const maxVersion = result[0]?.maxVersion
          return maxVersion != null ? maxVersion + 1 : 1
        },
        catch: (error) => translateQueryError(
          error,
          { operation: "findByDocumentId", entityType: "DocumentVersion", field: "documentId", value: documentId },
          (message, field, value, details) => new DocumentVersionNotFoundError(message, field, value, details)
        )
      })
    )
  }

  findByDocumentIdAndChecksum(
    documentId: DocumentId,
    checksum: string
  ): E.Effect<O.Option<DocumentVersionEntity>, DocumentVersionNotFoundError | ValidationError | DatabaseError, never> {
    return pipe(
      fetchSingle(
        () => this.db
          .select()
          .from(documentVersions)
          .where(
            and(
              eq(documentVersions.documentId, documentId),
              eq(documentVersions.checksum, checksum)
            )
          )
          .limit(1),
        DocumentVersionMapper.fromDb,
        "DocumentVersion",
        DocumentVersionNotFoundError
      ),
      E.mapError((error): DocumentVersionNotFoundError | ValidationError | DatabaseError =>
        error instanceof DocumentVersionValidationError
          ? new ValidationError(error.message, error.field, error.value)
          : error
      )
    )
  }

  exists(
    id: DocumentVersionId
  ): E.Effect<boolean, DatabaseError, never> {
    return pipe(
      E.tryPromise({
        try: (): Promise<Pick<DocumentVersionModel, "id">[]> =>
          this.db
            .select({ id: documentVersions.id })
            .from(documentVersions)
            .where(eq(documentVersions.id, id))
            .limit(1),
        catch: (error) => new DatabaseError(
          `Database error during exists check on DocumentVersion`,
          { originalError: error }
        )
      }),
      E.map((result) => result.length > 0)
    )
  }

  private ensureExists(id: DocumentVersionId): E.Effect<void, DocumentVersionNotFoundError | DatabaseError, never> {
    return pipe(
      this.exists(id),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () => E.succeed(undefined),
          onFalse: () => E.fail(new DocumentVersionNotFoundError(`Document version not found: id=${id}`, "id", id))
        })
      )
    )
  }

  // ========== Pure Helper Functions ==========

  private mapVersionSaveError(error: unknown, version: DocumentVersionEntity): DocumentVersionValidationError | ValidationError | DatabaseError {
    return error instanceof DatabaseError
      ? error
      : error instanceof ValidationError
      ? new DocumentVersionValidationError(
          error.message,
          error.field,
          error.value
        )
      : new DocumentVersionValidationError(
          `Failed to save document version: ${getErrorMessage(error)}`,
          "save",
          version.id
        )
  }

  save(
    version: DocumentVersionEntity
  ): E.Effect<DocumentVersionEntity, DocumentVersionValidationError | ValidationError | DatabaseError, never> {
    return pipe(
      this.findById(version.id),
      E.flatMap((existingVersion) =>
        O.match(existingVersion, {
          onNone: () => this.insert(version),
          onSome: () => this.update(version)
        })
      ),
      E.mapError((error) => this.mapVersionSaveError(error, version))
    )
  }

  private insert(
    version: DocumentVersionEntity
  ): E.Effect<DocumentVersionEntity, ValidationError | DocumentVersionValidationError | DatabaseError, never> {
    return pipe(
      DocumentVersionMapper.toDb(version),
      E.flatMap((dbData) =>
        E.tryPromise({
          try: () => this.db.insert(documentVersions).values(dbData),
          catch: (error) =>
            isUniqueConstraintError(error)
              ? new ValidationError(
                  `Document version ${version.version} already exists for document ${version.documentId}`,
                  'version',
                  version.version
                )
              : translateDbError(
                  error,
                  { operation: "insert", entityType: "DocumentVersion" },
                  {
                    createConflictError: (message: string) => new ValidationError(message, "versionId", version.id),
                    createNotFoundError: (field: string, value: string) => new ValidationError(`Document version not found: ${field}=${value}`, field, value),
                    createValidationError: (message: string, field: string) => new ValidationError(message, field, version.id)
                  }
                )
        })
      ),
      E.as(version)
    )
  }

  private update(
    version: DocumentVersionEntity
  ): E.Effect<DocumentVersionEntity, ValidationError | DocumentVersionNotFoundError | DatabaseError | DocumentVersionValidationError, never> {
    return pipe(
      this.ensureExists(version.id),
      E.flatMap(() => DocumentVersionMapper.toDb(version)),
      E.flatMap((dbData) =>
        E.tryPromise({
          try: () => this.db
            .update(documentVersions)
            .set(dbData)
            .where(eq(documentVersions.id, version.id)),
          catch: (error) => translateDbError(
            error,
            { operation: "update", entityType: "DocumentVersion" },
            {
              createConflictError: (message: string) => new ValidationError(message, "versionId", version.id),
              createNotFoundError: (field: string, value: string) => new ValidationError(`Document version not found: ${field}=${value}`, field, value),
              createValidationError: (message: string, field: string) => new ValidationError(message, field, version.id)
            }
          )
        })
      ),
      E.as(version)
    )
  }

  delete(
    id: DocumentVersionId
  ): E.Effect<boolean, DocumentVersionNotFoundError | DatabaseError, never> {
    return pipe(
      this.exists(id),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () =>
            pipe(
              E.tryPromise({
                try: () => this.db.delete(documentVersions).where(eq(documentVersions.id, id)),
                catch: (error) => translateDbError(
                  error,
                  { operation: "delete", entityType: "DocumentVersion" },
                  {
                    createConflictError: (message: string) => new DatabaseError(message),
                    createNotFoundError: (field: string, value: string) => new DocumentVersionNotFoundError(`Document version not found: ${field}=${value}`, field, value),
                    createValidationError: (message: string) => new DatabaseError(message)
                  }
                )
              }),
              E.as(true)
            ),
          onFalse: () => E.fail(new DocumentVersionNotFoundError(`Document version not found: id=${id}`, "id", id))
        })
      )
    )
  }

  list(options?: PaginationOptions): E.Effect<Paginated<DocumentVersionEntity>, DocumentVersionNotFoundError | ValidationError | DatabaseError, never> {
    const paginationOptions = options ?? defaultPaginationOptions()
    const offset = (paginationOptions.pageNum - 1) * paginationOptions.pageSize

    return pipe(
      E.tryPromise({
        try: async () => {
          const [data, totalResult] = await Promise.all([
            this.db
              .select()
              .from(documentVersions)
              .limit(paginationOptions.pageSize)
              .offset(offset)
              .orderBy(desc(documentVersions.createdAt)),
            this.db
              .select({ count: count() })
              .from(documentVersions)
          ])

          return { 
            data: data as DocumentVersionModel[], 
            total: Number(totalResult[0]?.count ?? 0)
          }
        },
        catch: (error) => translateQueryError(
          error,
          { operation: "list", entityType: "DocumentVersion", field: "list", value: "all" },
          (message, field, value, details) => new DocumentVersionNotFoundError(message, field, value, details)
        )
      }),
      E.flatMap(({ data, total }) =>
        data.length === 0
          ? E.succeed({
              data: [] as readonly DocumentVersionEntity[],
              total,
              pageNum: paginationOptions.pageNum,
              pageSize: paginationOptions.pageSize,
              totalPages: calculateTotalPages(total, paginationOptions.pageSize)
            } as Paginated<DocumentVersionEntity>)
          : pipe(
              E.forEach(data, (row) =>
                pipe(
                  DocumentVersionMapper.fromDb(row),
                  E.mapError((error): DocumentVersionNotFoundError | ValidationError =>
                    error instanceof DocumentVersionValidationError
                      ? new ValidationError(error.message, error.field, error.value)
                      : error
                  ),
                  E.provideService(Clock.Clock, Clock.make())
                )
              ),
              E.map((entities): Paginated<DocumentVersionEntity> => ({
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
