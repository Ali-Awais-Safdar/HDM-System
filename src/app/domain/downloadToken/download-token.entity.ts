import { Effect, Schema as S, Option, ParseResult } from "effect"
import { randomBytes, randomUUID } from "crypto"
import { DownloadToken as DownloadTokenSchema } from "@domain/downloadToken/download-token.schema"
import { BaseEntity, type IEntity } from "@domain/utils/base.entity"
import { BusinessRuleViolationError, ValidationError } from "@domain/utils/base.errors"
import { formatParseError, optionToMaybe } from "@domain/utils/option.utils"
import {
  DownloadTokenId,
  DocumentId,
  UserId,
  makeDownloadTokenIdSync
} from "@domain/refined/ids"

export interface IDownloadToken extends IEntity<DownloadTokenId> {
  readonly id: DownloadTokenId
  readonly token: string
  readonly documentId: DocumentId
  readonly issuedTo: UserId
  readonly expiresAt: Date
  readonly usedAt: Option.Option<Date>
  readonly createdAt: Date
}

/**
 * Runtime type derived from schema.
 * Represents the validated DownloadToken type with Option<T> for optional fields.
 */
export type DownloadTokenType = S.Schema.Type<typeof DownloadTokenSchema>

/**
 * Serialized DownloadToken type derived from schema encoding.
 * Represents the external format for APIs and persistence.
 */
export type SerializedDownloadToken = S.Schema.Encoded<typeof DownloadTokenSchema>

/**
 * Download Token Entity
 * 
 * Represents a secure download token for document access.
 * Follows immutable entity pattern - all updates return new instances.
 */
export class DownloadTokenEntity
  extends BaseEntity<IDownloadToken, typeof DownloadTokenSchema>
  implements IDownloadToken
{
  // ========== Direct Readonly Properties ==========
  // Properties cannot be reassigned after construction
  // Optional values are explicitly handled with Option
  
  readonly token: string
  readonly documentId: DocumentId
  readonly issuedTo: UserId
  readonly expiresAt: Date
  readonly usedAt: Option.Option<Date> // Explicit optionality with Option type
  // ========== Static Factory Methods ==========

  private static toRuntime(data: DownloadTokenType): IDownloadToken {
    return {
      id: data.id,
      token: data.token,
      documentId: data.documentId,
      issuedTo: data.issuedTo,
      expiresAt: data.expiresAt,
      usedAt: data.usedAt,
      createdAt: data.createdAt,
      updatedAt: optionToMaybe(data.usedAt)
    }
  }

  /**
   * Creates a DownloadToken entity from external/unknown data.
   * Validates input using schema and returns Effect with proper error handling.
   * This is the primary factory method for creating tokens from external sources.
   */
  static create(input: unknown): Effect.Effect<DownloadTokenEntity, ValidationError, never> {
    return S.decodeUnknown(DownloadTokenSchema)(input).pipe(
      Effect.map((validated) =>
        new DownloadTokenEntity(DownloadTokenEntity.toRuntime(validated))
      ),
      Effect.mapError((error) => 
        new ValidationError(
          `Invalid download token data: ${formatParseError(error)}`,
          undefined,
          input
        )
      )
    ) as Effect.Effect<DownloadTokenEntity, ValidationError, never>
  }

  /**
   * Creates a new DownloadToken entity with business logic validation.
   * Use this for creating new tokens in the domain (not from persistence).
   */
  static createNew(props: {
    documentId: DocumentId;
    issuedTo: UserId;
    expiresAt: Date;
  }): Effect.Effect<DownloadTokenEntity, ValidationError, never> {
    const token = DownloadTokenEntity.generateSecureToken()
    const tokenData = {
      id: makeDownloadTokenIdSync(randomUUID()),
      token,
      documentId: props.documentId,
      issuedTo: props.issuedTo,
      expiresAt: props.expiresAt,
      usedAt: null, // Pass null directly, schema will handle conversion
      createdAt: new Date()
    }
    
    return S.decodeUnknown(DownloadTokenSchema)(tokenData).pipe(
      Effect.map((validated) =>
        new DownloadTokenEntity(DownloadTokenEntity.toRuntime(validated))
      ),
      Effect.mapError((error) => 
        new ValidationError(
          `Invalid download token data: ${formatParseError(error)}`,
          undefined,
          tokenData
        )
      )
    ) as Effect.Effect<DownloadTokenEntity, ValidationError, never>
  }

  /**
   * Creates a token with default 5-minute expiry.
   */
  static createWithDefaultExpiry(props: {
    documentId: DocumentId;
    issuedTo: UserId;
  }): Effect.Effect<DownloadTokenEntity, ValidationError, never> {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
    return DownloadTokenEntity.createNew({
      ...props,
      expiresAt,
    })
  }

  /**
   * Creates entity from persistence layer data.
   * Alias for create() for semantic clarity.
   */
  static fromPersistence(input: unknown): Effect.Effect<DownloadTokenEntity, ValidationError, never> {
    return DownloadTokenEntity.create(input)
  }

  /**
   * Unsafe constructor for when data is already validated.
   * Use only in controlled contexts (e.g., tests, after validation).
   */
  static unsafe(data: DownloadTokenType): DownloadTokenEntity {
    return new DownloadTokenEntity(DownloadTokenEntity.toRuntime(data))
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

  // ========== Constructor (Private) ==========
  // Constructor receives pre-validated data
  // All validation happens in factory methods before construction
  
  private constructor(runtime: Readonly<IDownloadToken>) {
    super(DownloadTokenSchema, runtime)
    this.token = runtime.token
    this.documentId = runtime.documentId
    this.issuedTo = runtime.issuedTo
    this.expiresAt = runtime.expiresAt
    this.usedAt = runtime.usedAt // Already Option<Date> from schema
  }

  // ========== Getters & Computed Properties ==========
  
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

  // ========== Public Domain Methods ==========
  
  /**
   * Checks if the token is valid (not expired and not used).
   */
  isValid(clockSkewToleranceMs: number = 0): boolean {
    return !this.isExpired(clockSkewToleranceMs) && !this.hasBeenUsed
  }

  /**
   * Checks if the token has expired.
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
    return this.hasBeenUsed
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
   * Marks the token as used.
   * Returns new entity instance with usedAt set to current time (immutable update pattern).
   */
  markAsUsed(): Effect.Effect<DownloadTokenEntity, ValidationError | BusinessRuleViolationError, never> {
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
    return this.serialized().pipe(
      Effect.mapError((error) =>
        new ValidationError(
          `Failed to prepare download token for usage: ${formatParseError(error)}`,
          "usedAt",
          usedAt
        )
      ),
      Effect.flatMap((currentSerialized) =>
        DownloadTokenEntity.create({
          ...currentSerialized,
          usedAt: usedAt // Pass Date directly, schema will handle conversion
        })
      )
    )
  }

  /**
   * Validates the token for use by a specific user.
   * Checks ownership, usage status, and expiration.
   */
  validateForUse(userId: UserId, clockSkewToleranceMs: number = 0): Effect.Effect<DownloadTokenEntity, BusinessRuleViolationError, never> {
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

  /**
   * Returns wire format (validated runtime type).
   * Used for internal domain operations.
   */
  toWireFormat(): IDownloadToken {
    return {
      id: this.id,
      token: this.token,
      documentId: this.documentId,
      issuedTo: this.issuedTo,
      expiresAt: this.expiresAt,
      usedAt: this.usedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    }
  }

  /**
   * Serializes the entity using Effect Schema encoding.
   * Properly transforms Option<T> fields to nullable values for external systems.
   * This is automatic serialization with type safety.
   */
  serialized(): Effect.Effect<SerializedDownloadToken, ParseResult.ParseError, never> {
    return S.encode(DownloadTokenSchema)(this.props as any) as Effect.Effect<SerializedDownloadToken, ParseResult.ParseError, never>
  }

  /**
   * Converts to plain object for APIs.
   * Includes computed properties for convenience.
   */
  toPlainObject(clockSkewToleranceMs: number = 0) {
    return {
      id: this.id,
      documentId: this.documentId,
      issuedTo: this.issuedTo,
      expiresAt: this.expiresAt,
      usedAt: optionToMaybe(this.usedAt),
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
