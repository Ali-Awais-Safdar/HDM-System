import { Effect, Option } from "effect"
import { DocumentVersionEntity } from "../entities/document-version.entity"
import { DocumentVersionId, DocumentId } from "../value-objects/id.vo"
import { 
  DocumentVersionNotFoundError,
  DocumentValidationError
} from "../errors/document.errors"
import { ValidationError } from "../errors/domain.errors"

/**
 * Document version repository interface with Effect-based signatures and typed errors.
 */
export abstract class DocumentVersionRepository {

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

  abstract exists(
    id: DocumentVersionId
  ): Effect.Effect<boolean, DocumentVersionNotFoundError>

  abstract save(
    version: DocumentVersionEntity
  ): Effect.Effect<DocumentVersionEntity, DocumentValidationError | ValidationError>

  abstract delete(
    id: DocumentVersionId
  ): Effect.Effect<boolean, DocumentVersionNotFoundError>
}

