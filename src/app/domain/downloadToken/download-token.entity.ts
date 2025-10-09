import { Effect, Option, ParseResult, Schema as S } from "effect"
import { DownloadToken as DownloadTokenSchema } from "@domain/downloadToken/download-token.schema"
import { BaseEntity, type IEntity } from "@domain/utils/base.entity"
import { BusinessRuleViolationError } from "@domain/utils/base.errors"
import { formatParseError } from "@domain/utils/option.utils"
import { DownloadTokenId, DocumentId, UserId } from "@domain/refined/ids"
import { DownloadTokenValidationError } from "@domain/downloadToken/download-token.error"

export interface IDownloadToken extends IEntity<DownloadTokenId> {
  readonly id: DownloadTokenId
  readonly token: string
  readonly documentId: DocumentId
  readonly issuedTo: UserId
  readonly expiresAt: Date
  readonly usedAt: Option.Option<Date>
  readonly createdAt: Date
}

export type DownloadTokenType = S.Schema.Type<typeof DownloadTokenSchema>
export type SerializedDownloadToken =
  S.Schema.Encoded<typeof DownloadTokenSchema>

export class DownloadTokenEntity
  extends BaseEntity<typeof DownloadTokenSchema, DownloadTokenType>
  implements IDownloadToken
{
  private constructor(data: DownloadTokenType) {
    super(DownloadTokenSchema, data)
  }

  static create(
    input: SerializedDownloadToken
  ): Effect.Effect<DownloadTokenEntity, DownloadTokenValidationError, never> {
    return S.decodeUnknown(DownloadTokenSchema)(input).pipe(
      Effect.map((data) => new DownloadTokenEntity(data)),
      Effect.mapError((error) => DownloadTokenEntity.toValidationError(error, input))
    ) as Effect.Effect<DownloadTokenEntity, DownloadTokenValidationError, never>
  }

  private static toValidationError(
    error: unknown,
    input: SerializedDownloadToken
  ): DownloadTokenValidationError {
    if (error instanceof DownloadTokenValidationError) {
      return error
    }
    return new DownloadTokenValidationError(
      `DownloadToken validation failed: ${formatParseError(error as ParseResult.ParseError)}`,
      "downloadToken",
      input
    )
  }

  serialized(): Effect.Effect<
    SerializedDownloadToken,
    ParseResult.ParseError,
    never
  > {
    return super.serialized() as Effect.Effect<
      SerializedDownloadToken,
      ParseResult.ParseError,
      never
    >
  }

  get id(): DownloadTokenId {
    return this.data.id
  }

  get token(): string {
    return this.data.token
  }

  get documentId(): DocumentId {
    return this.data.documentId
  }

  get issuedTo(): UserId {
    return this.data.issuedTo
  }

  get expiresAt(): Date {
    return this.data.expiresAt
  }

  get usedAt(): Option.Option<Date> {
    return this.data.usedAt
  }

  get createdAt(): Date {
    return this.data.createdAt
  }

  get updatedAt(): Date | null {
    return Option.getOrNull(this.data.usedAt)
  }

  get hasBeenUsed(): boolean {
    return Option.isSome(this.usedAt)
  }

  get hasExpired(): boolean {
    return new Date() > this.expiresAt
  }

  get isCurrentlyValid(): boolean {
    return !this.hasExpired && !this.hasBeenUsed
  }

  get millisecondsUntilExpiry(): number {
    const timeLeft = this.expiresAt.getTime() - new Date().getTime()
    return Math.max(0, timeLeft)
  }

  get secondsUntilExpiry(): number {
    return Math.floor(this.millisecondsUntilExpiry / 1000)
  }

  isValid(clockSkewToleranceMs: number = 0): boolean {
    return !this.isExpired(clockSkewToleranceMs) && !this.hasBeenUsed
  }

  isExpired(clockSkewToleranceMs: number = 0): boolean {
    const now = new Date()
    const adjustedExpiryTime = new Date(
      this.expiresAt.getTime() + clockSkewToleranceMs
    )
    return now > adjustedExpiryTime
  }

  isUsed(): boolean {
    return this.hasBeenUsed
  }

  belongsToUser(userId: UserId): boolean {
    return this.issuedTo === userId
  }

  getTimeToExpiry(clockSkewToleranceMs: number = 0): number {
    const now = new Date()
    const adjustedExpiryTime = this.expiresAt.getTime() + clockSkewToleranceMs
    const timeLeft = adjustedExpiryTime - now.getTime()
    return Math.max(0, timeLeft)
  }

  markAsUsed(): Effect.Effect<
    DownloadTokenEntity,
    BusinessRuleViolationError | DownloadTokenValidationError,
    never
  > {
    if (this.hasBeenUsed) {
      return Effect.fail(
        new BusinessRuleViolationError(
          "TOKEN_ALREADY_USED",
          "Token has already been used",
          { tokenId: this.id }
        )
      )
    }

    if (this.hasExpired) {
      return Effect.fail(
        new BusinessRuleViolationError(
          "TOKEN_EXPIRED",
          "Cannot use expired token",
          { tokenId: this.id, expiresAt: this.expiresAt }
        )
      )
    }

    const usedAtIso = new Date().toISOString()
    return this.serialized().pipe(
      Effect.mapError(
        (error) =>
          new DownloadTokenValidationError(
            `Failed to prepare download token for usage: ${formatParseError(error)}`,
            "usedAt",
            usedAtIso
          )
      ),
      Effect.flatMap((currentSerialized) =>
        DownloadTokenEntity.create({
          ...currentSerialized,
          usedAt: usedAtIso
        })
      )
    )
  }

  validateForUse(
    userId: UserId,
    clockSkewToleranceMs: number = 0
  ): Effect.Effect<DownloadTokenEntity, BusinessRuleViolationError, never> {
    if (!this.belongsToUser(userId)) {
      return Effect.fail(
        new BusinessRuleViolationError(
          "TOKEN_USER_MISMATCH",
          "Token does not belong to the specified user",
          { tokenId: this.id, userId, issuedTo: this.issuedTo }
        )
      )
    }

    if (this.hasBeenUsed) {
      return Effect.fail(
        new BusinessRuleViolationError(
          "TOKEN_ALREADY_USED",
          "Token has already been used",
          { tokenId: this.id }
        )
      )
    }

    if (this.isExpired(clockSkewToleranceMs)) {
      return Effect.fail(
        new BusinessRuleViolationError(
          "TOKEN_EXPIRED",
          "Token has expired",
          { tokenId: this.id, expiresAt: this.expiresAt }
        )
      )
    }

    return Effect.succeed(this)
  }
}
