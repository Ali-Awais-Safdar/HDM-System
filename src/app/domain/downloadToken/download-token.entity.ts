import { Effect, Schema as S, Option, ParseResult } from "effect"
import { randomBytes } from "crypto"
import { DownloadToken as DownloadTokenSchema } from "@domain/downloadToken/download-token.schema"
import { createEntityFactory, type Entity, type IEntity } from "@domain/utils/entity.utils"
import { BusinessRuleViolationError, ValidationError } from "@domain/utils/domain.errors"
import { isSome, toNullable } from "@domain/utils/option.utils"
import { DownloadTokenId, DocumentId, UserId, makeDownloadTokenIdSync } from "@domain/value-objects/id.vo"

export interface IDownloadToken extends IEntity {
  readonly id: DownloadTokenId
  readonly token: string
  readonly documentId: DocumentId
  readonly issuedTo: UserId
  readonly expiresAt: Date
  readonly usedAt: Option.Option<Date>
  readonly createdAt: Date
}

/**
 * Serialized DownloadToken type derived from schema encoding.
 */
export type SerializedDownloadToken = S.Schema.Encoded<typeof DownloadTokenSchema>

export class DownloadTokenEntity implements Entity<S.Schema.Type<typeof DownloadTokenSchema>, SerializedDownloadToken>, IDownloadToken {
  // ========== Static Factory Methods ==========
  
  static create = createEntityFactory(
    DownloadTokenSchema,
    (props) => new DownloadTokenEntity(props),
    "DownloadToken"
  ).create

  static createNew = (props: {
    documentId: DocumentId;
    issuedTo: UserId;
    expiresAt: Date;
  }): Effect.Effect<DownloadTokenEntity, ValidationError> => {
    const token = DownloadTokenEntity.generateSecureToken()
    const tokenData = {
      id: makeDownloadTokenIdSync(crypto.randomUUID()),
      token,
      documentId: props.documentId,
      issuedTo: props.issuedTo,
      expiresAt: props.expiresAt.toISOString(),
      usedAt: { _tag: "None" as const },
      createdAt: new Date().toISOString()
    }
    return S.decodeUnknown(DownloadTokenSchema)(tokenData).pipe(
      Effect.map((validated) => new DownloadTokenEntity(validated)),
      Effect.mapError((error) => new ValidationError(
        `Invalid download token data: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        tokenData
      ))
    )
  }

  static createWithDefaultExpiry = (props: {
    documentId: DocumentId;
    issuedTo: UserId;
  }): Effect.Effect<DownloadTokenEntity, ValidationError> => {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
    return DownloadTokenEntity.createNew({
      ...props,
      expiresAt,
    })
  }

  static fromPersistence = createEntityFactory(
    DownloadTokenSchema,
    (props) => new DownloadTokenEntity(props),
    "DownloadToken"
  ).fromPersistence

  static unsafe = createEntityFactory(
    DownloadTokenSchema,
    (props) => new DownloadTokenEntity(props),
    "DownloadToken"
  ).unsafe

  /**
   * Generates a cryptographically secure random token.
   * Uses 32 bytes (256 bits) of randomness, encoded as URL-safe base64.
   */
  private static generateSecureToken(): string {
    return randomBytes(32)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '') // Remove padding for URL safety
  }

  // ========== Constructor ==========

  private constructor(readonly props: Readonly<S.Schema.Type<typeof DownloadTokenSchema>>) {}

  // ========== Getters & Computed Properties ==========
  
  get id() { return this.props.id }
  get token() { return this.props.token }
  get documentId() { return this.props.documentId }
  get issuedTo() { return this.props.issuedTo }
  get expiresAt() { return this.props.expiresAt }
  get usedAt() { return this.props.usedAt }
  get createdAt() { return this.props.createdAt }

  get hasBeenUsed(): boolean {
    return isSome(this.usedAt)
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

  // Public Domain Methods
  
  isValid(clockSkewToleranceMs: number = 0): boolean {
    return !this.isExpired(clockSkewToleranceMs) && !this.hasBeenUsed
  }

  isExpired(clockSkewToleranceMs: number = 0): boolean {
    const now = new Date()
    const adjustedExpiryTime = new Date(this.expiresAt.getTime() + clockSkewToleranceMs)
    return now > adjustedExpiryTime
  }

  isUsed(): boolean {
    return this.hasBeenUsed
  }

  belongsToUser(userId: UserId): boolean {
    return this.issuedTo === userId
  }

  /**
   * Gets the remaining time before expiration in milliseconds.
   * Returns 0 if already expired.
   * Includes clock-skew tolerance in the calculation.
   */
  getTimeToExpiry(clockSkewToleranceMs: number = 0): number {
    const now = new Date()
    const adjustedExpiryTime = this.expiresAt.getTime() + clockSkewToleranceMs
    const timeLeft = adjustedExpiryTime - now.getTime()
    return Math.max(0, timeLeft)
  }

  markAsUsed = (): Effect.Effect<DownloadTokenEntity, ValidationError | BusinessRuleViolationError> => {
    // Check if already used
    if (this.hasBeenUsed) {
      return Effect.fail(new BusinessRuleViolationError(
        "TOKEN_ALREADY_USED",
        "Token has already been used",
        { tokenId: this.id }
      ))
    }

    // Check if expired
    if (this.hasExpired) {
      return Effect.fail(new BusinessRuleViolationError(
        "TOKEN_EXPIRED",
        "Cannot use expired token",
        { tokenId: this.id, expiresAt: this.expiresAt }
      ))
    }

    // Construct new entity directly with usedAt set to now
    const usedAt = new Date()
    const updated = new DownloadTokenEntity({
      ...this.props,
      usedAt: Option.some(usedAt)
    })

    return Effect.succeed(updated)
  }

  validateForUse = (userId: UserId, clockSkewToleranceMs: number = 0): Effect.Effect<DownloadTokenEntity, BusinessRuleViolationError> => {
    // Check if token belongs to user
    if (!this.belongsToUser(userId)) {
      return Effect.fail(new BusinessRuleViolationError(
        "TOKEN_USER_MISMATCH",
        "Token does not belong to the specified user",
        { tokenId: this.id, userId, issuedTo: this.issuedTo }
      ))
    }

    // Check if already used
    if (this.hasBeenUsed) {
      return Effect.fail(new BusinessRuleViolationError(
        "TOKEN_ALREADY_USED",
        "Token has already been used",
        { tokenId: this.id }
      ))
    }

    // Check if expired
    if (this.isExpired(clockSkewToleranceMs)) {
      return Effect.fail(new BusinessRuleViolationError(
        "TOKEN_EXPIRED",
        "Token has expired",
        { tokenId: this.id, expiresAt: this.expiresAt }
      ))
    }

    // All validations passed
    return Effect.succeed(this)
  }

  // ========== Serialization Methods ==========

  toWireFormat = (): S.Schema.Type<typeof DownloadTokenSchema> => {
    return this.props
  }

  /**
   * Serializes the entity using Effect Schema encoding.
   * Properly transforms Option<T> fields to nullable values for external systems.
   */
  serialized = (): Effect.Effect<SerializedDownloadToken, ParseResult.ParseError, never> => {
    return S.encode(DownloadTokenSchema)(this.props)
  }

  toPlainObject = (clockSkewToleranceMs: number = 0) => {
    return {
      id: this.id,
      documentId: this.documentId,
      issuedTo: this.issuedTo,
      expiresAt: this.expiresAt,
      usedAt: toNullable(this.usedAt),
      createdAt: this.createdAt,
      isValid: this.isValid(clockSkewToleranceMs),
      isExpired: this.isExpired(clockSkewToleranceMs),
      isUsed: this.hasBeenUsed,
      timeToExpiry: this.getTimeToExpiry(clockSkewToleranceMs),
      hasBeenUsed: this.hasBeenUsed,
      hasExpired: this.hasExpired,
      isCurrentlyValid: this.isCurrentlyValid,
      secondsUntilExpiry: this.secondsUntilExpiry
    }
  }
}
