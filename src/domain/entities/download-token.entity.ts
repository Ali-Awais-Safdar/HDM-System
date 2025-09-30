import { Effect, Schema as S, Option } from "effect"
import { DownloadToken as DownloadTokenSchema } from "../schema/download-token.schema"
import { makeDownloadTokenId } from "../value-objects/id.vo"
import { ValidationError, BusinessRuleViolationError } from "../errors/domain.errors"
import { UserId, DocumentId } from "../value-objects/id.vo"
import { toNullable, isSome } from "../utils/option.utils"
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
export class DownloadToken {
  private constructor(readonly props: S.Schema.Type<typeof DownloadTokenSchema>) {}

  // Effect-based factory for creating from unknown input
  static create = (input: unknown): Effect.Effect<DownloadToken, ValidationError> => {
    return Effect.gen(function* () {
      const props = yield* Effect.try({
        try: () => S.decodeUnknownSync(DownloadTokenSchema)(input),
        catch: (error) => new ValidationError(
          `Invalid download token data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          undefined,
          input
        )
      })
      return new DownloadToken(props)
    })
  }

  // Effect-based factory for creating new tokens
  static createNew = (props: {
    documentId: DocumentId;
    issuedTo: UserId;
    expiresAt: Date;
  }): Effect.Effect<DownloadToken, ValidationError> => {
    return Effect.gen(function* () {
      const token = DownloadToken.generateSecureToken()
      
      const tokenData = {
        id: makeDownloadTokenId(crypto.randomUUID()),
        token,
        ...props,
        usedAt: Option.none(), // Not used yet
        createdAt: new Date()
      }
      
      const validatedProps = yield* Effect.try({
        try: () => S.decodeUnknownSync(DownloadTokenSchema)(tokenData),
        catch: (error) => new ValidationError(
          `Invalid download token data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          undefined,
          tokenData
        )
      })
      
      return new DownloadToken(validatedProps)
    })
  }

  // Effect-based factory for creating with default 5-minute expiration
  static createWithDefaultExpiry = (props: {
    documentId: DocumentId;
    issuedTo: UserId;
  }): Effect.Effect<DownloadToken, ValidationError> => {
    return Effect.gen(function* () {
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
      
      return yield* DownloadToken.createNew({
        ...props,
        expiresAt,
      })
    })
  }

  // Effect-based factory for reconstructing from persistence
  static fromPersistence = (input: unknown): Effect.Effect<DownloadToken, ValidationError> => {
    return DownloadToken.create(input)
  }

  // Unsafe factory for internal use when data is already validated
  static unsafe = (props: S.Schema.Type<typeof DownloadTokenSchema>): DownloadToken => {
    return new DownloadToken(props)
  }

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
    return Effect.gen(function* (this: DownloadToken) {
      if (this.isUsed()) {
        yield* Effect.fail(new BusinessRuleViolationError(
          "TOKEN_ALREADY_USED",
          "Token has already been used",
          { tokenId: this.id }
        ))
      }

      if (this.isExpired()) {
        yield* Effect.fail(new BusinessRuleViolationError(
          "TOKEN_EXPIRED",
          "Cannot use expired token",
          { tokenId: this.id, expiresAt: this.expiresAt }
        ))
      }

      const updatedData = {
        ...this.props,
        usedAt: Option.some(new Date())
      }

      const validatedProps = yield* Effect.try({
        try: () => S.decodeUnknownSync(DownloadTokenSchema)(updatedData),
        catch: (error) => new ValidationError(
          `Invalid token data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'usedAt',
          new Date()
        )
      })

      return new DownloadToken(validatedProps)
    }.bind(this))
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
    return Effect.gen(function* (this: DownloadToken) {
      if (!this.belongsToUser(userId)) {
        yield* Effect.fail(new BusinessRuleViolationError(
          "TOKEN_USER_MISMATCH",
          "Token does not belong to the specified user",
          { tokenId: this.id, userId, issuedTo: this.issuedTo }
        ))
      }

      if (this.isUsed()) {
        yield* Effect.fail(new BusinessRuleViolationError(
          "TOKEN_ALREADY_USED",
          "Token has already been used",
          { tokenId: this.id }
        ))
      }

      if (this.isExpired(clockSkewToleranceMs)) {
        yield* Effect.fail(new BusinessRuleViolationError(
          "TOKEN_EXPIRED",
          "Token has expired",
          { tokenId: this.id, expiresAt: this.expiresAt }
        ))
      }

      return this
    }.bind(this))
  }

  /**
   * Serialization method using schema encode
   */
  toWireFormat = (): S.Schema.Type<typeof DownloadTokenSchema> => {
    return this.props
  }

  /**
   * Returns a plain object representation for serialization.
   * Note: The actual token is excluded for security reasons.
   */
  toPlainObject(clockSkewToleranceMs: number = 0) {
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
