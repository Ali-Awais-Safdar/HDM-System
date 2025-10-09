import { Effect, Option } from "effect"
import { DocumentVersionEntity } from "./document-version.entity"
import {
  DocumentValidationError,
  DocumentVersionNotFoundError,
} from "@domain/document/document.error"
import { ValidationError } from "@domain/utils/base.errors"
import { BaseRepository, type RepositoryEffect } from "@domain/utils/base.repository"
import { DocumentId, DocumentVersionId } from "@domain/refined/ids"

/**
 * Document version repository interface with Effect-based signatures and typed errors.
 */
export abstract class DocumentVersionRepository extends BaseRepository<DocumentVersionEntity> {

  protected readonly entityName = "DocumentVersion"

  // Standardized CRUD per BaseRepository
  abstract insert(version: DocumentVersionEntity): RepositoryEffect<DocumentVersionEntity, DocumentValidationError | ValidationError>
  abstract update(version: DocumentVersionEntity): RepositoryEffect<DocumentVersionEntity, DocumentValidationError | ValidationError>
  abstract fetchById(id: DocumentVersionId): RepositoryEffect<Option.Option<DocumentVersionEntity>, DocumentVersionNotFoundError>
  abstract list(): RepositoryEffect<readonly DocumentVersionEntity[], DocumentVersionNotFoundError>

  abstract findById(
    id: DocumentVersionId
  ): Effect.Effect<Option.Option<DocumentVersionEntity>, DocumentVersionNotFoundError | ValidationError>

  abstract findByDocumentIdAndVersion(
    documentId: DocumentId,
    version: number
  ): Effect.Effect<Option.Option<DocumentVersionEntity>, DocumentVersionNotFoundError | ValidationError>

  abstract findByDocumentId(
    documentId: DocumentId
  ): Effect.Effect<readonly DocumentVersionEntity[], DocumentVersionNotFoundError | ValidationError>

  abstract findLatestByDocumentId(
    documentId: DocumentId
  ): Effect.Effect<Option.Option<DocumentVersionEntity>, DocumentVersionNotFoundError | ValidationError>

  abstract getNextVersionNumber(
    documentId: DocumentId
  ): Effect.Effect<number, DocumentVersionNotFoundError>

  // Standardized exists/delete per BaseRepository
  abstract exists(id: DocumentVersionId): RepositoryEffect<boolean, DocumentVersionNotFoundError>

  abstract save(
    version: DocumentVersionEntity
  ): Effect.Effect<DocumentVersionEntity, DocumentValidationError | ValidationError>

  abstract delete(id: DocumentVersionId): RepositoryEffect<boolean, DocumentVersionNotFoundError>
}
