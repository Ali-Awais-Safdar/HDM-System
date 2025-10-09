import { Effect, Option } from "effect"
import { DocumentEntity } from "./document.entity"
import {
  DocumentNotFoundError,
  DocumentValidationError,
} from "./document.error"
import { ValidationError } from "@domain/utils/base.errors"
import { Paginated, PaginationOptions } from "@domain/utils/pagination"
import { BaseRepository, type RepositoryEffect } from "@domain/utils/base.repository"
import { DocumentId, UserId } from "@domain/refined/ids"

export interface DocumentSearchFilters {
  readonly query?: string
  readonly tags?: readonly string[]
  readonly ownerId?: UserId
  readonly paginationOptions?: PaginationOptions
}

/**
 * Document repository interface with Effect-based signatures and typed errors.
 */
export abstract class DocumentRepository extends BaseRepository<DocumentEntity> {

  protected readonly entityName = "Document"

  // Standardized CRUD per BaseRepository
  abstract insert(document: DocumentEntity): RepositoryEffect<DocumentEntity, DocumentValidationError>
  abstract update(document: DocumentEntity): RepositoryEffect<DocumentEntity, DocumentValidationError>
  abstract fetchById(id: DocumentId): RepositoryEffect<Option.Option<DocumentEntity>, DocumentNotFoundError>
  abstract list(): RepositoryEffect<readonly DocumentEntity[], DocumentNotFoundError>

  abstract findById(
    id: DocumentId
  ): Effect.Effect<Option.Option<DocumentEntity>, DocumentNotFoundError | ValidationError>

  abstract findByOwner(
    ownerId: UserId
  ): Effect.Effect<readonly DocumentEntity[], DocumentNotFoundError | ValidationError>

  abstract search(
    filters: DocumentSearchFilters
  ): Effect.Effect<Paginated<DocumentEntity>, DocumentNotFoundError | ValidationError>

  // Standardized exists/delete per BaseRepository
  abstract exists(id: DocumentId): RepositoryEffect<boolean, DocumentNotFoundError>

  abstract save(
    document: DocumentEntity
  ): Effect.Effect<DocumentEntity, DocumentValidationError | ValidationError>

  abstract delete(id: DocumentId): RepositoryEffect<boolean, DocumentNotFoundError>
}
