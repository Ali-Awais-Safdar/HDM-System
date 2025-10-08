import { Effect, Option } from "effect"
import { DocumentVersionEntity } from "./document-version.entity"
import {
  DocumentValidationError,
  DocumentVersionNotFoundError,
} from "@domain/document/document.errors"
import { ValidationError } from "@domain/utils/domain.errors"
import { DocumentId, DocumentVersionId } from "@domain/value-objects/id.vo"

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
