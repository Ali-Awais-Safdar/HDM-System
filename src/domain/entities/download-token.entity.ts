import { Effect, Schema as S, Option } from "effect"
import { DownloadToken as DownloadTokenSchema } from "../schema/download-token.schema"
import { makeDownloadTokenId } from "../value-objects/id.vo"
import { ValidationError, BusinessRuleViolationError } from "../errors/domain.errors"
import { UserId, DocumentId } from "../value-objects/id.vo"
import { toNullable, isSome } from "../utils/option.utils"
import { createEntityFactory, type Entity } from "../utils/entity.utils"
import { randomBytes } from "crypto"

/**
 * DownloadToken domain entity representing secure, short-lived access tokens for document downloads.
 * 
 * Business Rules:
 * - Tokens are single-use (marked as used after first consumption)
 * - Tokens have short expiration times (default 5 minutes)
 * - Tokens are cryptographically secure random strings
 * - Tokens are bound to a specific user and document
 * - Expired or used tokens are invalid
 */
export class DownloadToken implements Entity<S.Schema.Type<typeof DownloadTokenSchema>> {
  private constructor(readonly props: S.Schema.Type<typeof DownloadTokenSchema>) {}

  // Standardized factory methods using the entity utilities
  static create = createEntityFactory(
    DownloadTokenSchema,
    (props) => new DownloadToken(props),
    "DownloadToken"
  ).create

  static createNew = (props: {
    documentId: DocumentId;
    issuedTo: UserId;
    expiresAt: Date;
  }): Effect.Effect<DownloadToken, ValidationError> => {
    const token = DownloadToken.generateSecureToken()
    const tokenData = {
      id: makeDownloadTokenId(crypto.randomUUID()),
      token,
      ...props,
      usedAt: Option.none(),
      createdAt: new Date()
    }
    return S.decodeUnknown(DownloadTokenSchema)(tokenData).pipe(
      Effect.map((validated) => new DownloadToken(validated)),
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
  }): Effect.Effect<DownloadToken, ValidationError> => {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
    return DownloadToken.createNew({
      ...props,
      expiresAt,
    })
  }

  static fromPersistence = createEntityFactory(
    DownloadTokenSchema,
    (props) => new DownloadToken(props),
    "DownloadToken"
  ).fromPersistence

  static unsafe = createEntityFactory(
    DownloadTokenSchema,
    (props) => new DownloadToken(props),
    "DownloadToken"
  ).unsafe

  // convenience read accessors
  get id() { return this.props.id }
  get token() { return this.props.token }
  get documentId() { return this.props.documentId }
  get issuedTo() { return this.props.issuedTo }
  get expiresAt() { return this.props.expiresAt }
  get usedAt() { return this.props.usedAt }
  get createdAt() { return this.props.createdAt }

  /**
   * Checks if the token is valid (not expired and not used).
   * Includes clock-skew tolerance for expiration check.
   */
  isValid(clockSkewToleranceMs: number = 0): boolean {
    return !this.isExpired(clockSkewToleranceMs) && !this.isUsed()
  }

  /**
   * Checks if the token has expired.
   * Includes clock-skew tolerance to handle time differences between client and server.
   */
  isExpired(clockSkewToleranceMs: number = 0): boolean {
    const now = new Date()
    const adjustedExpiryTime = new Date(this.expiresAt.getTime() + clockSkewToleranceMs)
    return now > adjustedExpiryTime
  }

  /**
   * Checks if the token has been used.
   */
  isUsed(): boolean {
    return isSome(this.usedAt)
  }

  /**
   * Effect-based method for marking the token as used.
   * Returns a new instance (immutable).
   */
  markAsUsed = (): Effect.Effect<DownloadToken, ValidationError | BusinessRuleViolationError> => {
    // Check if already used
    if (this.isUsed()) {
      return Effect.fail(new BusinessRuleViolationError(
        "TOKEN_ALREADY_USED",
        "Token has already been used",
        { tokenId: this.id }
      ))
    }

    // Check if expired
    if (this.isExpired()) {
      return Effect.fail(new BusinessRuleViolationError(
        "TOKEN_EXPIRED",
        "Cannot use expired token",
        { tokenId: this.id, expiresAt: this.expiresAt }
      ))
    }

    // Update and validate
    const updatedData = {
      ...this.props,
      usedAt: Option.some(new Date())
    }

    return S.decodeUnknown(DownloadTokenSchema)(updatedData).pipe(
      Effect.mapError((error) => new ValidationError(
        `Invalid token data: ${error instanceof Error ? error.message : String(error)}`,
        'usedAt',
        updatedData.usedAt
      )),
      Effect.map(validated => new DownloadToken(validated))
    )
  }

  /**
   * Checks if the token belongs to the specified user.
   */
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

  /**
   * Effect-based method for validating token before use.
   */
  validateForUse = (userId: UserId, clockSkewToleranceMs: number = 0): Effect.Effect<DownloadToken, BusinessRuleViolationError> => {
    // Check if token belongs to user
    if (!this.belongsToUser(userId)) {
      return Effect.fail(new BusinessRuleViolationError(
        "TOKEN_USER_MISMATCH",
        "Token does not belong to the specified user",
        { tokenId: this.id, userId, issuedTo: this.issuedTo }
      ))
    }

    // Check if already used
    if (this.isUsed()) {
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

  /**
   * Standardized serialization methods
   */
  toWireFormat = (): S.Schema.Type<typeof DownloadTokenSchema> => {
    return this.props
  }

  /**
   * Returns a plain object representation for serialization.
   * Note: The actual token is excluded for security reasons.
   */
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
      isUsed: this.isUsed(),
      timeToExpiry: this.getTimeToExpiry(clockSkewToleranceMs),
    }
  }

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
}
