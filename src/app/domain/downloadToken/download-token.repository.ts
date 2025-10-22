import { Effect, Option } from "effect"
import { DownloadTokenEntity } from "./download-token.entity"
import { 
  DownloadTokenNotFoundError,
  DownloadTokenAlreadyUsedError
} from "./download-token.error"
import { BusinessRuleViolationError, ValidationError, DatabaseError } from "@domain/utils/base.errors"
import { BaseRepository } from "@domain/utils/base.repository"
import { DocumentId, UserId } from "@domain/refined/ids"

/**
 * Download token repository interface with Effect-based signatures and typed errors.
 */
export abstract class DownloadTokenRepository extends BaseRepository<DownloadTokenEntity, DownloadTokenNotFoundError, ValidationError | BusinessRuleViolationError> {

  protected readonly entityName = "DownloadToken"

  abstract findByToken(
    token: string
  ): Effect.Effect<Option.Option<DownloadTokenEntity>, DownloadTokenNotFoundError | ValidationError | DatabaseError>

  abstract findByUserId(
    userId: UserId
  ): Effect.Effect<readonly DownloadTokenEntity[], DownloadTokenNotFoundError | ValidationError | DatabaseError>

  abstract findByDocumentId(
    documentId: DocumentId
  ): Effect.Effect<readonly DownloadTokenEntity[], DownloadTokenNotFoundError | ValidationError | DatabaseError>

  abstract findValidTokens(
    documentId: DocumentId,
    userId: UserId
  ): Effect.Effect<readonly DownloadTokenEntity[], DownloadTokenNotFoundError | ValidationError | DatabaseError>

  abstract markAsUsed(
    token: string
  ): Effect.Effect<DownloadTokenEntity, DownloadTokenNotFoundError | DownloadTokenAlreadyUsedError | BusinessRuleViolationError | ValidationError | DatabaseError>

  abstract deleteExpiredTokens(): Effect.Effect<number, DatabaseError>

  abstract deleteByDocumentId(
    documentId: DocumentId
  ): Effect.Effect<number, DownloadTokenNotFoundError | DatabaseError>
}
