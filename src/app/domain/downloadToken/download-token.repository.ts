import { Effect, Option } from "effect"
import { DownloadTokenEntity } from "./download-token.entity"
import { 
  DownloadTokenNotFoundError,
  DownloadTokenAlreadyUsedError
} from "./download-token.error"
import { BusinessRuleViolationError, ValidationError } from "@domain/utils/base.errors"
import { BaseRepository, type RepositoryEffect } from "@domain/utils/base.repository"
import { DownloadTokenId, DocumentId, UserId } from "@domain/refined/ids"

/**
 * Download token repository interface with Effect-based signatures and typed errors.
 */
export abstract class DownloadTokenRepository extends BaseRepository<DownloadTokenEntity> {

  protected readonly entityName = "DownloadToken"

  // Standardized CRUD per BaseRepository
  abstract insert(token: DownloadTokenEntity): RepositoryEffect<DownloadTokenEntity, ValidationError | BusinessRuleViolationError>
  abstract update(token: DownloadTokenEntity): RepositoryEffect<DownloadTokenEntity, ValidationError | BusinessRuleViolationError>
  abstract fetchById(id: DownloadTokenId): RepositoryEffect<Option.Option<DownloadTokenEntity>, DownloadTokenNotFoundError>
  abstract list(): RepositoryEffect<readonly DownloadTokenEntity[], DownloadTokenNotFoundError>

  abstract findById(
    id: DownloadTokenId
  ): Effect.Effect<Option.Option<DownloadTokenEntity>, DownloadTokenNotFoundError | ValidationError>

  abstract findByToken(
    token: string
  ): Effect.Effect<Option.Option<DownloadTokenEntity>, DownloadTokenNotFoundError | ValidationError>

  abstract findByUserId(
    userId: UserId
  ): Effect.Effect<readonly DownloadTokenEntity[], DownloadTokenNotFoundError | ValidationError>

  abstract findByDocumentId(
    documentId: DocumentId
  ): Effect.Effect<readonly DownloadTokenEntity[], DownloadTokenNotFoundError | ValidationError>

  abstract findValidTokens(
    documentId: DocumentId,
    userId: UserId
  ): Effect.Effect<readonly DownloadTokenEntity[], DownloadTokenNotFoundError | ValidationError>

  // Standardized exists/delete per BaseRepository
  abstract exists(id: DownloadTokenId): RepositoryEffect<boolean, DownloadTokenNotFoundError>

  abstract save(
    token: DownloadTokenEntity
  ): Effect.Effect<DownloadTokenEntity, ValidationError | BusinessRuleViolationError>

  abstract markAsUsed(
    token: string
  ): Effect.Effect<DownloadTokenEntity, DownloadTokenNotFoundError | DownloadTokenAlreadyUsedError | ValidationError>

  abstract delete(id: DownloadTokenId): RepositoryEffect<boolean, DownloadTokenNotFoundError>

  abstract deleteExpiredTokens(): Effect.Effect<number, never>

  abstract deleteByDocumentId(
    documentId: DocumentId
  ): Effect.Effect<number, DownloadTokenNotFoundError>
}
