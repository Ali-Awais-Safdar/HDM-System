import { Effect, Option, ParseResult, Schema as S, Clock } from "effect"
import { DownloadToken as DownloadTokenSchema } from "@domain/downloadToken/download-token.schema"
import { BusinessRuleViolationError } from "@domain/utils/base.errors"
import { DownloadTokenAlreadyUsedError } from "@domain/downloadToken/download-token.error"
import { formatParseError, mapParseError } from "@domain/utils/option.utils"
import { DownloadTokenId, DocumentId, UserId } from "@domain/refined/ids"
import { DownloadTokenValidationError } from "@domain/downloadToken/download-token.error"
import { require } from "@domain/utils/effect-guards"
import { getCurrentTime } from "@domain/utils/audit-trail"
import { applyMutationWithProvidedTimestamp, serializeWith } from "@domain/utils/schema-transform"
import { isExpiredAt, msUntilExpiry } from "@domain/downloadToken/expiry-window.vo"

export type DownloadTokenType = S.Schema.Type<typeof DownloadTokenSchema>
export type SerializedDownloadToken =
  S.Schema.Encoded<typeof DownloadTokenSchema>

export class DownloadTokenEntity {
  readonly id!: DownloadTokenId
  readonly token!: string
  readonly documentId!: DocumentId
  readonly issuedTo!: UserId
  readonly expiresAt!: Date
  readonly usedAt!: Option.Option<Date>
  readonly createdAt!: Date
  readonly updatedAt!: Option.Option<Date>

  private constructor(data: DownloadTokenType) {
    this.id = data.id
    this.createdAt = data.createdAt
    this.updatedAt = data.updatedAt
    this.token = data.token
    this.documentId = data.documentId
    this.issuedTo = data.issuedTo
    this.expiresAt = data.expiresAt
    this.usedAt = data.usedAt
  }

  static create(
    input: SerializedDownloadToken
  ): Effect.Effect<DownloadTokenEntity, DownloadTokenValidationError, Clock.Clock> {
    return getCurrentTime().pipe(
      Effect.flatMap((now) => {
        const dataWithAudit = {
          ...input,
          createdAt: input.createdAt || now.toISOString(),
          updatedAt: input.updatedAt
        }
        return S.decodeUnknown(DownloadTokenSchema)(dataWithAudit).pipe(
          Effect.map((data) => new DownloadTokenEntity(data)),
          Effect.mapError((error) => new DownloadTokenValidationError(
            mapParseError(error as ParseResult.ParseError, (m) => `DownloadToken validation failed: ${m}`),
            "downloadToken",
            input
          ))
        )
      })
    ) as Effect.Effect<DownloadTokenEntity, DownloadTokenValidationError, Clock.Clock>
  }

  serialized(): Effect.Effect<SerializedDownloadToken, ParseResult.ParseError, never> {
    return serializeWith(DownloadTokenSchema, this as unknown as DownloadTokenType)
  }

  get hasBeenUsed(): boolean {
    return Option.isSome(this.usedAt)
  }

  millisecondsUntilExpiry(): Effect.Effect<number, never, Clock.Clock> {
    return msUntilExpiry(this.expiresAt)
  }

  secondsUntilExpiry(): Effect.Effect<number, never, Clock.Clock> {
    return this.millisecondsUntilExpiry().pipe(
      Effect.map((ms) => Math.floor(ms / 1000))
    )
  }

  isValid(clockSkewToleranceMs: number = 0): Effect.Effect<boolean, never, Clock.Clock> {
    return this.isExpired(clockSkewToleranceMs).pipe(
      Effect.map((expired) => !expired && !this.hasBeenUsed)
    )
  }

  isExpired(clockSkewToleranceMs: number = 0): Effect.Effect<boolean, never, Clock.Clock> {
    return isExpiredAt(this.expiresAt, clockSkewToleranceMs)
  }

  isUsed(): boolean {
    return this.hasBeenUsed
  }

  belongsToUser(userId: UserId): boolean {
    return this.issuedTo === userId
  }

  getTimeToExpiry(clockSkewToleranceMs: number = 0): Effect.Effect<number, never, Clock.Clock> {
    return getCurrentTime().pipe(
      Effect.map((now) => Math.max(0, (this.expiresAt.getTime() + clockSkewToleranceMs) - now.getTime()))
    )
  }

  markAsUsed(): Effect.Effect<
    DownloadTokenEntity,
    DownloadTokenAlreadyUsedError | BusinessRuleViolationError | DownloadTokenValidationError,
    Clock.Clock
  > {
    return getCurrentTime().pipe(
      Effect.flatMap((now) =>
        require(
          !this.hasBeenUsed,
          () => new DownloadTokenAlreadyUsedError("Download token already used", "token", this.id)
        ).pipe(
          Effect.flatMap(() =>
            require(
              now <= this.expiresAt,
              () => new BusinessRuleViolationError(
                "TOKEN_EXPIRED",
                "Cannot use expired token",
                { tokenId: this.id, expiresAt: this.expiresAt }
              )
            )
          ),
          Effect.flatMap(() =>
            applyMutationWithProvidedTimestamp(
              DownloadTokenSchema,
              this as unknown,
              now,
              () => ({ usedAt: now.toISOString() }),
              (error) => new DownloadTokenValidationError(
                `Failed to prepare download token for usage: ${formatParseError(error as ParseResult.ParseError)}`,
                "usedAt",
                null
              ),
              (input) => DownloadTokenEntity.create(input)
            )
          )
        )
      )
    )
  }

  validateForUse(
    userId: UserId,
    clockSkewToleranceMs: number = 0
  ): Effect.Effect<DownloadTokenEntity, DownloadTokenAlreadyUsedError | BusinessRuleViolationError, Clock.Clock> {
    return require(
      this.belongsToUser(userId),
      () => new BusinessRuleViolationError(
        "TOKEN_USER_MISMATCH",
        "Token does not belong to the specified user",
        { tokenId: this.id, userId, issuedTo: this.issuedTo }
      )
    ).pipe(
      Effect.flatMap(() => require(
        !this.hasBeenUsed,
        () => new DownloadTokenAlreadyUsedError("Download token already used", "token", this.id)
      )),
      Effect.flatMap(() => this.isExpired(clockSkewToleranceMs).pipe(
        Effect.flatMap((expired) => require(
          !expired,
          () => new BusinessRuleViolationError(
            "TOKEN_EXPIRED",
            "Token has expired",
            { tokenId: this.id, expiresAt: this.expiresAt }
          )
        ))
      )),
      Effect.as(this)
    )
  }
}
