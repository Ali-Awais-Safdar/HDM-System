import { Effect, Option } from "effect"
import { DocumentVersionEntity } from "./document-version.entity"
import { 
  DocumentVersionNotFoundError,
  DocumentVersionValidationError
} from "./document-version.error"
import { ValidationError } from "@domain/utils/base.errors"
import { BaseRepository } from "@domain/utils/base.repository"
import { DocumentId } from "@domain/refined/ids"

/**
 * Document version repository interface with Effect-based signatures and typed errors.
 */
export abstract class DocumentVersionRepository extends BaseRepository<
  DocumentVersionEntity,
  DocumentVersionNotFoundError,
  DocumentVersionValidationError | ValidationError
> {

  protected readonly entityName = "DocumentVersion"

  // Domain-specific read operations

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
}
