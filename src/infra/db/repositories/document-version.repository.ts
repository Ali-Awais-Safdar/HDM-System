import { Effect as E, Option as O, pipe } from "effect"
import { DocumentVersionEntity } from "../../../domain/entities/document-version.entity"
import { DocumentVersionRepository } from "../../../domain/ports/document-version.repository"
import { DocumentVersionId, DocumentId } from "../../../domain/value-objects/id.vo"
import { 
  DocumentVersionNotFoundError,
  DocumentValidationError
} from "../../../domain/errors/document.errors"
import { ValidationError } from "../../../domain/errors/domain.errors"
import { documentVersions, type DocumentVersionModel } from "../../../lib/db/models"
import { eq, and, desc, max } from "drizzle-orm"
import type { DatabaseInterface } from "../../../lib/db/interfaces"

/**
 * Drizzle-based Document Version Repository Implementation
 */
export class DocumentVersionDrizzleRepository extends DocumentVersionRepository {
  constructor(private readonly db: DatabaseInterface) { 
    super() 
  }

  // ========== Serialization Helpers ==========

  private toDbSerialized(version: DocumentVersionEntity): E.Effect<Omit<DocumentVersionModel, 'updatedAt'>, ValidationError, never> {
    return E.sync(() => ({
      id: version.id,
      documentId: version.documentId,
      version: version.version,
      checksum: version.checksum,
      fileKey: version.fileKey,
      mimeType: version.mimeType,
      size: version.size,
      createdAt: version.createdAt,
      createdBy: O.getOrNull(version.createdBy)
    }))
  }

  private fromDbRow(row: DocumentVersionModel): E.Effect<DocumentVersionEntity, ValidationError, never> {
    return DocumentVersionEntity.fromPersistence({
      id: row.id,
      documentId: row.documentId,
      version: row.version,
      checksum: row.checksum,
      fileKey: row.fileKey,
      mimeType: row.mimeType,
      size: row.size,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      createdBy: row.createdBy ?? null
    })
  }

  // ========== Query Helpers ==========

  private executeQuery<T>(query: () => Promise<T>): E.Effect<T, DocumentVersionNotFoundError> {
    return E.tryPromise({
      try: query,
      catch: (error) => new DocumentVersionNotFoundError(
        "unknown",
        { originalError: error instanceof Error ? error.message : String(error) }
      )
    })
  }

  private fetchSingle(
    query: () => Promise<DocumentVersionModel[]>
  ): E.Effect<O.Option<DocumentVersionEntity>, DocumentVersionNotFoundError | ValidationError, never> {
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
    query: () => Promise<DocumentVersionModel[]>
  ): E.Effect<readonly DocumentVersionEntity[], DocumentVersionNotFoundError | ValidationError, never> {
    return pipe(
      this.executeQuery(query),
      E.flatMap((results) => 
        E.all(results.map((row) => this.fromDbRow(row)))
      )
    )
  }

  // ========== Repository Methods ==========

  findById(
    id: DocumentVersionId
  ): E.Effect<O.Option<DocumentVersionEntity>, DocumentVersionNotFoundError | ValidationError, never> {
    return this.fetchSingle(() =>
      this.db.select().from(documentVersions).where(eq(documentVersions.id, id)).limit(1)
    )
  }

  findByDocumentIdAndVersion(
    documentId: DocumentId,
    version: number
  ): E.Effect<O.Option<DocumentVersionEntity>, DocumentVersionNotFoundError | ValidationError, never> {
    return this.fetchSingle(() =>
      this.db
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.documentId, documentId),
            eq(documentVersions.version, version)
          )
        )
        .limit(1)
    )
  }

  findByDocumentId(
    documentId: DocumentId
  ): E.Effect<readonly DocumentVersionEntity[], DocumentVersionNotFoundError | ValidationError, never> {
    return this.fetchMultiple(() =>
      this.db
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.documentId, documentId))
        .orderBy(desc(documentVersions.version))
    )
  }

  findLatestByDocumentId(
    documentId: DocumentId
  ): E.Effect<O.Option<DocumentVersionEntity>, DocumentVersionNotFoundError | ValidationError, never> {
    return this.fetchSingle(() =>
      this.db
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.documentId, documentId))
        .orderBy(desc(documentVersions.version))
        .limit(1)
    )
  }

  getNextVersionNumber(
    documentId: DocumentId
  ): E.Effect<number, DocumentVersionNotFoundError, never> {
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
        catch: (error) => new DocumentVersionNotFoundError(
          "unknown",
          { 
            documentId,
            originalError: error instanceof Error ? error.message : String(error) 
          }
        )
      })
    )
  }

  exists(
    id: DocumentVersionId
  ): E.Effect<boolean, DocumentVersionNotFoundError, never> {
    return pipe(
      E.tryPromise({
        try: (): Promise<Pick<DocumentVersionModel, "id">[]> =>
          this.db
            .select({ id: documentVersions.id })
            .from(documentVersions)
            .where(eq(documentVersions.id, id))
            .limit(1),
        catch: () => new DocumentVersionNotFoundError(id)
      }),
      E.map((result) => result.length > 0)
    )
  }

  private ensureExists(id: DocumentVersionId): E.Effect<void, DocumentVersionNotFoundError, never> {
    return pipe(
      this.exists(id),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () => E.succeed(undefined),
          onFalse: () => E.fail(new DocumentVersionNotFoundError(id))
        })
      )
    )
  }

  save(
    version: DocumentVersionEntity
  ): E.Effect<DocumentVersionEntity, DocumentValidationError | ValidationError, never> {
    return pipe(
      // Check if version already exists
      this.findById(version.id),
      E.flatMap((existingVersion) =>
        O.match(existingVersion, {
          onNone: () => this.insert(version),
          onSome: () => this.update(version)
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
          `Failed to save document version: ${error}`,
          undefined,
          { versionId: version.id }
        )
      })
    )
  }

  private insert(
    version: DocumentVersionEntity
  ): E.Effect<DocumentVersionEntity, ValidationError, never> {
    return pipe(
      this.toDbSerialized(version),
      E.flatMap((dbData) =>
        E.tryPromise({
          try: () => this.db.insert(documentVersions).values(dbData),
          catch: (error) => {
            const errorMsg = error instanceof Error ? error.message : String(error)
            // Check for unique constraint violation (document_id + version)
            if (errorMsg.includes('unique') || errorMsg.includes('duplicate')) {
              return new ValidationError(
                `Document version ${version.version} already exists for document ${version.documentId}`,
                'version',
                version.version
              )
            }
            return new ValidationError(
              `Failed to insert document version: ${errorMsg}`,
              undefined,
              { versionId: version.id }
            )
          }
        })
      ),
      E.as(version)
    )
  }

  private update(
    version: DocumentVersionEntity
  ): E.Effect<DocumentVersionEntity, ValidationError | DocumentVersionNotFoundError, never> {
    return pipe(
      this.ensureExists(version.id),
      E.flatMap(() => this.toDbSerialized(version)),
      E.flatMap((dbData) =>
        E.tryPromise({
          try: () => this.db
            .update(documentVersions)
            .set(dbData)
            .where(eq(documentVersions.id, version.id)),
          catch: (error) => new ValidationError(
            `Failed to update document version: ${error instanceof Error ? error.message : String(error)}`,
            undefined,
            { versionId: version.id }
          )
        })
      ),
      E.as(version)
    )
  }

  delete(
    id: DocumentVersionId
  ): E.Effect<boolean, DocumentVersionNotFoundError, never> {
    return pipe(
      this.ensureExists(id),
      E.flatMap(() =>
        E.tryPromise({
          try: () => this.db.delete(documentVersions).where(eq(documentVersions.id, id)),
          catch: () => new DocumentVersionNotFoundError(id)
        })
      ),
      E.as(true)
    )
  }
}

