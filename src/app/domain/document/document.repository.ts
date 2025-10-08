import { Effect, Option } from "effect"
import { DocumentEntity } from "./document.entity"
import {
  DocumentNotFoundError,
  DocumentValidationError,
} from "./document.errors"
import { ValidationError } from "@domain/utils/domain.errors"
import { Paginated, PaginationOptions } from "@domain/utils/pagination"
import { DocumentId, UserId } from "@domain/value-objects/id.vo"

export interface DocumentSearchFilters {
  readonly query?: string
  readonly tags?: readonly string[]
  readonly ownerId?: UserId
  readonly paginationOptions?: PaginationOptions
}

/**
 * Document repository interface with Effect-based signatures and typed errors.
 */
export abstract class DocumentRepository {

  abstract findById(
    id: DocumentId
  ): Effect.Effect<Option.Option<DocumentEntity>, DocumentNotFoundError | ValidationError>

  abstract findByOwner(
    ownerId: UserId
  ): Effect.Effect<readonly DocumentEntity[], DocumentNotFoundError | ValidationError>

  abstract search(
    filters: DocumentSearchFilters
  ): Effect.Effect<Paginated<DocumentEntity>, DocumentNotFoundError | ValidationError>

  abstract exists(
    id: DocumentId
  ): Effect.Effect<boolean, DocumentNotFoundError>

  abstract save(
    document: DocumentEntity
  ): Effect.Effect<DocumentEntity, DocumentValidationError | ValidationError>

  abstract delete(
    id: DocumentId
  ): Effect.Effect<boolean, DocumentNotFoundError>
}
