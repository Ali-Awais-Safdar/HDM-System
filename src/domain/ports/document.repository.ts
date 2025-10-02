import { Effect, Option } from "effect"
import { DocumentEntity } from "../entities/document.entity"
import { DocumentId, UserId } from "../value-objects/id.vo"
import { 
  DocumentNotFoundError,
  DocumentValidationError
} from "../errors/document.errors"
import { ValidationError } from "../errors/domain.errors"
import { Paginated, PaginationOptions } from "../types/pagination"

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
