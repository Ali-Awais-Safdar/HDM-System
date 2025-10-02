import { Effect, Option } from "effect"
import { DownloadTokenEntity } from "../entities/download-token.entity"
import { DownloadTokenId, DocumentId, UserId } from "../value-objects/id.vo"
import { ValidationError, BusinessRuleViolationError, DomainError } from "../errors/domain.errors"

/**
 * Download token-specific repository errors.
 */
export class DownloadTokenNotFoundError extends DomainError {
  readonly _tag = "DownloadTokenNotFoundError" as const
  readonly code = "DOWNLOAD_TOKEN_NOT_FOUND"
  
  constructor(
    public readonly tokenId?: DownloadTokenId,
    public readonly token?: string,
    details?: Record<string, unknown>
  ) {
    super(
      `Download token not found${tokenId ? ` (id: ${tokenId})` : token ? ` (token: ${token})` : ""}`,
      { tokenId, token, ...details }
    )
  }
}

export class DownloadTokenExpiredError extends DomainError {
  readonly _tag = "DownloadTokenExpiredError" as const
  readonly code = "DOWNLOAD_TOKEN_EXPIRED"
  
  constructor(
    public readonly tokenId: DownloadTokenId,
    details?: Record<string, unknown>
  ) {
    super(`Download token ${tokenId} has expired`, { tokenId, ...details })
  }
}

export class DownloadTokenAlreadyUsedError extends DomainError {
  readonly _tag = "DownloadTokenAlreadyUsedError" as const
  readonly code = "DOWNLOAD_TOKEN_ALREADY_USED"
  
  constructor(
    public readonly tokenId: DownloadTokenId,
    details?: Record<string, unknown>
  ) {
    super(`Download token ${tokenId} has already been used`, { tokenId, ...details })
  }
}

/**
 * Download token repository interface with Effect-based signatures and typed errors.
 */
export abstract class DownloadTokenRepository {

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

  abstract exists(
    id: DownloadTokenId
  ): Effect.Effect<boolean, DownloadTokenNotFoundError>

  abstract save(
    token: DownloadTokenEntity
  ): Effect.Effect<DownloadTokenEntity, ValidationError | BusinessRuleViolationError>

  abstract markAsUsed(
    token: string
  ): Effect.Effect<DownloadTokenEntity, DownloadTokenNotFoundError | DownloadTokenAlreadyUsedError | ValidationError>

  abstract delete(
    id: DownloadTokenId
  ): Effect.Effect<boolean, DownloadTokenNotFoundError>

  abstract deleteExpiredTokens(): Effect.Effect<number, never>

  abstract deleteByDocumentId(
    documentId: DocumentId
  ): Effect.Effect<number, DownloadTokenNotFoundError>
}

