import { randomBytes, randomUUID } from "crypto"
import { Effect } from "effect"
import {
  DownloadTokenEntity,
  type SerializedDownloadToken
} from "@domain/downloadToken/download-token.entity"
import {
  DownloadTokenNotFoundError,
  DownloadTokenRepository,
} from "@domain/downloadToken/download-token.repository"
import { DownloadTokenValidationError } from "@domain/downloadToken/download-token.error"
import { BusinessRuleViolationError, DomainError, ValidationError } from "@domain/utils/base.errors"
import {
  DocumentId,
  DownloadTokenId,
  UserId,
  makeDownloadTokenIdSync
} from "@domain/refined/ids"

export type DownloadTokenServiceErrorCode =
  | "REPOSITORY_ERROR"
  | "TOKEN_NOT_FOUND"
  | "TOKEN_EXPIRED"
  | "TOKEN_ALREADY_USED"
  | "UNKNOWN_ERROR"

export class DownloadTokenServiceError extends DomainError {
  readonly _tag = "DownloadTokenServiceError" as const
  
  constructor(
    message: string,
    public readonly code: DownloadTokenServiceErrorCode,
    public readonly cause?: Error,
    details?: Record<string, unknown>
  ) {
    super(message, { code, cause: cause?.message, ...details })
  }
}

export class DownloadTokenService {
  constructor(
    private readonly tokenRepository: DownloadTokenRepository,
    private readonly clockSkewToleranceMs: number = 0
  ) {}

  generateDownloadToken(
    documentId: DocumentId,
    issuedTo: UserId,
    expiresAt?: Date
  ): Effect.Effect<
    DownloadTokenEntity, 
    DownloadTokenServiceError | ValidationError
  > {
    const preparedExpiresAt =
      expiresAt ?? new Date(Date.now() + 15 * 60 * 1000)
    const serialized: SerializedDownloadToken = {
      id: makeDownloadTokenIdSync(randomUUID()),
      token: randomBytes(32).toString("base64url"),
      documentId,
      issuedTo,
      expiresAt: preparedExpiresAt.toISOString(),
      usedAt: null,
      createdAt: new Date().toISOString()
    }

    return DownloadTokenEntity.create(serialized).pipe(
      Effect.flatMap(token => this.tokenRepository.save(token)),
      Effect.mapError(error => 
        error instanceof ValidationError
          ? error
          : new DownloadTokenServiceError(
              "Failed to generate download token",
              "REPOSITORY_ERROR",
              error as Error
            )
      )
    )
  }

  consumeDownloadToken(
    tokenString: string,
    userId: UserId
  ): Effect.Effect<
    DownloadTokenEntity,
    DownloadTokenServiceError |
      DownloadTokenNotFoundError |
      ValidationError |
      BusinessRuleViolationError |
      DownloadTokenValidationError
  > {
    return this.tokenRepository.findByToken(tokenString).pipe(
      Effect.flatMap(tokenOption =>
        Effect.gen(this, function* () {
          if (tokenOption._tag === "None") {
            return yield* Effect.fail(
              new DownloadTokenServiceError("Download token not found", "TOKEN_NOT_FOUND")
            )
          }

          const token = tokenOption.value

          if (token.isUsed()) {
            return yield* Effect.fail(
              new DownloadTokenServiceError("Token has already been used", "TOKEN_ALREADY_USED")
            )
          }

          if (token.isExpired(this.clockSkewToleranceMs)) {
            return yield* Effect.fail(
              new DownloadTokenServiceError("Token has expired", "TOKEN_EXPIRED")
            )
          }

          if (!token.belongsToUser(userId)) {
            return yield* Effect.fail(
              new DownloadTokenServiceError("Token does not belong to user", "TOKEN_NOT_FOUND")
            )
          }

          const usedToken = yield* token.markAsUsed()
          return yield* this.tokenRepository.save(usedToken)
        })
      )
    )
  }

  cleanupExpiredTokens(): Effect.Effect<number, never> {
    return this.tokenRepository.deleteExpiredTokens()
  }

  getActiveTokensForDocument(
    documentId: DocumentId
  ): Effect.Effect<readonly DownloadTokenEntity[], DownloadTokenNotFoundError | ValidationError> {
    return this.tokenRepository.findByDocumentId(documentId).pipe(
      Effect.map(tokens => 
        tokens.filter(token => token.isValid(this.clockSkewToleranceMs))
      )
    )
  }

  revokeToken(
    tokenId: DownloadTokenId
  ): Effect.Effect<boolean, DownloadTokenNotFoundError | ValidationError> {
    return this.tokenRepository.delete(tokenId)
  }
}
