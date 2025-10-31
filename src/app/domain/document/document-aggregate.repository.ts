import { Effect, Option } from "effect"
import { DocumentAggregate } from "@domain/document/document.aggregate"
import { DocumentEntity } from "@domain/document/document.entity"
import { DocumentNotFoundError, DocumentValidationError } from "@domain/document/document.error"
import { DocumentVersionNotFoundError, DocumentVersionValidationError } from "@domain/documentVersion/document-version.error"
import { BusinessRuleViolationError, DatabaseError, ValidationError } from "@domain/utils/base.errors"
import { Paginated, PaginationOptions } from "@domain/utils/pagination"
import { DocumentId, DocumentVersionId, UserId, WorkspaceId } from "@domain/refined/ids"

export interface DeleteOptions {
  readonly force?: boolean
}

/**
 * Search filters for document queries.
 * WorkspaceId is required for multi-tenant filtering.
 * ActorId enables repository-level permission filtering.
 */
export interface DocumentSearchFilters {
  readonly workspaceId: WorkspaceId  // Required for multi-tenant filtering
  readonly query?: string
  readonly tags?: readonly string[]
  readonly ownerId?: UserId
  readonly publishStatus?: "draft" | "published" | "unpublished"
  readonly paginationOptions?: PaginationOptions
  readonly actorId?: UserId // Actor context for permission-based filtering
}

export abstract class DocumentAggregateRepository {
  // ===== Aggregate Operations (Write Path) =====

  abstract loadById(
    documentId: DocumentId
  ): Effect.Effect<
    Option.Option<DocumentAggregate>,
    DocumentNotFoundError | ValidationError | DatabaseError,
    never
  >

  /**
   * Save the aggregate transactionally.
   * Implementations MUST:
   * - Upsert document and versions in a single transaction
   * - Enforce aggregate invariants at the boundary
   */
  abstract save(
    aggregate: DocumentAggregate
  ): Effect.Effect<
    DocumentAggregate,
    | DocumentValidationError
    | DocumentVersionValidationError
    | ValidationError
    | BusinessRuleViolationError
    | DatabaseError,
    never
  >

  /**
   * Delete the aggregate by id with cascading.
   * If `force` is false and dependencies exist, MUST fail with BusinessRuleViolationError.
   * Returns true if deletion succeeded, false otherwise.
   */
  abstract delete(
    documentId: DocumentId,
    options?: DeleteOptions
  ): Effect.Effect<
    boolean,
    DocumentNotFoundError | BusinessRuleViolationError | DatabaseError,
    never
  >

  // ===== Document Query Operations (Read Path - Projections) =====

  abstract findDocumentById(
    documentId: DocumentId
  ): Effect.Effect<
    Option.Option<DocumentEntity>,
    DocumentNotFoundError | ValidationError | DatabaseError,
    never
  >

  abstract searchDocuments(
    filters: DocumentSearchFilters
  ): Effect.Effect<
    Paginated<DocumentEntity>,
    DocumentNotFoundError | ValidationError | DatabaseError,
    never
  >

  abstract findDocumentsByOwner(
    workspaceId: WorkspaceId,
    ownerId: UserId
  ): Effect.Effect<
    readonly DocumentEntity[],
    DocumentNotFoundError | ValidationError | DatabaseError,
    never
  >

  abstract findDocumentIdByVersionId(
    versionId: DocumentVersionId
  ): Effect.Effect<
    Option.Option<DocumentId>,
    DocumentVersionNotFoundError | ValidationError | DatabaseError,
    never
  >
}


