import { Effect } from "effect"
import { DocumentEntity } from "./document.entity"
import {
  DocumentNotFoundError,
  DocumentValidationError,
} from "./document.error"
import { ValidationError, DatabaseError } from "@domain/utils/base.errors"
import { Paginated, PaginationOptions } from "@domain/utils/pagination"
import { BaseRepository } from "@domain/utils/base.repository"
import { UserId } from "@domain/refined/ids"

export interface DocumentSearchFilters {
  readonly query?: string
  readonly tags?: readonly string[]
  readonly ownerId?: UserId
  readonly paginationOptions?: PaginationOptions
}

export abstract class DocumentRepository extends BaseRepository<
  DocumentEntity,
  DocumentNotFoundError,
  DocumentValidationError | ValidationError
> {

  protected readonly entityName = "Document"

  // Domain-specific read operations
  abstract findByOwner(
    ownerId: UserId
  ): Effect.Effect<readonly DocumentEntity[], DocumentNotFoundError | ValidationError | DatabaseError>

  abstract search(
    filters: DocumentSearchFilters
  ): Effect.Effect<Paginated<DocumentEntity>, DocumentNotFoundError | ValidationError | DatabaseError>
}
