import { Schema as S, Option } from "effect"
import { DownloadToken as DownloadTokenSchema } from "../schema/download-token.schema"
import { makeDownloadTokenId } from "../value-objects/id.vo"
import { randomBytes } from "crypto";

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

  static fromProps = (u: unknown) => {
    const props = S.decodeUnknownSync(DownloadTokenSchema)(u)
    return new DownloadToken(props)
  }

  static unsafe = (p: S.Schema.Type<typeof DownloadTokenSchema>) => new DownloadToken(p)

  // convenience read accessors
  get id() { return this.props.id }
  get token() { return this.props.token }
  get documentId() { return this.props.documentId }
  get issuedTo() { return this.props.issuedTo }
  get expiresAt() { return this.props.expiresAt }
  get usedAt() { return this.props.usedAt }
  get createdAt() { return this.props.createdAt }

  /**
   * Creates a new DownloadToken with a cryptographically secure random token.
   */
  static create(props: {
    documentId: S.Schema.Type<typeof DownloadTokenSchema>['documentId'];
    issuedTo: S.Schema.Type<typeof DownloadTokenSchema>['issuedTo'];
    expiresAt: Date;
  }): DownloadToken {
    const token = this.generateSecureToken();
    
    return DownloadToken.fromProps({
      id: makeDownloadTokenId(crypto.randomUUID()),
      token,
      ...props,
      usedAt: Option.none(), // Not used yet
      createdAt: new Date()
    });
  }

  /**
   * Creates a new DownloadToken with default 5-minute expiration.
   */
  static createWithDefaultExpiry(props: {
    documentId: S.Schema.Type<typeof DownloadTokenSchema>['documentId'];
    issuedTo: S.Schema.Type<typeof DownloadTokenSchema>['issuedTo'];
  }): DownloadToken {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
    
    return this.create({
      ...props,
      expiresAt,
    });
  }

  /**
   * Reconstructs a DownloadToken from persistence layer.
   */
  static fromPersistence(props: {
    id: S.Schema.Type<typeof DownloadTokenSchema>['id'];
    token: string;
    documentId: S.Schema.Type<typeof DownloadTokenSchema>['documentId'];
    issuedTo: S.Schema.Type<typeof DownloadTokenSchema>['issuedTo'];
    expiresAt: Date;
    usedAt: Option.Option<Date>;
    createdAt: Date;
  }): DownloadToken {
    return DownloadToken.fromProps(props);
  }

  /**
   * Checks if the token is valid (not expired and not used).
   * Includes clock-skew tolerance for expiration check.
   */
  isValid(clockSkewToleranceMs: number = 0): boolean {
    return !this.isExpired(clockSkewToleranceMs) && !this.isUsed();
  }

  /**
   * Checks if the token has expired.
   * Includes clock-skew tolerance to handle time differences between client and server.
   */
  isExpired(clockSkewToleranceMs: number = 0): boolean {
    const now = new Date();
    const adjustedExpiryTime = new Date(this.expiresAt.getTime() + clockSkewToleranceMs);
    return now > adjustedExpiryTime;
  }

  /**
   * Checks if the token has been used.
   */
  isUsed(): boolean {
    return Option.isSome(this.usedAt);
  }

  /**
   * Marks the token as used with the current timestamp.
   * Returns a new instance (immutable).
   * Uses schema validation instead of throwing errors.
   */
  markAsUsed(): DownloadToken {
    // Use schema validation to ensure the token can be marked as used
    const updatedProps = {
      ...this.props,
      usedAt: Option.some(new Date()) as any // Mark as used now
    };
    
    // Validate the updated props through schema
    return DownloadToken.fromProps(updatedProps);
  }

  /**
   * Checks if the token belongs to the specified user.
   */
  belongsToUser(userId: S.Schema.Type<typeof DownloadTokenSchema>['issuedTo']): boolean {
    return this.issuedTo === userId;
  }

  /**
   * Gets the remaining time before expiration in milliseconds.
   * Returns 0 if already expired.
   * Includes clock-skew tolerance in the calculation.
   */
  getTimeToExpiry(clockSkewToleranceMs: number = 0): number {
    const now = new Date();
    const adjustedExpiryTime = this.expiresAt.getTime() + clockSkewToleranceMs;
    const timeLeft = adjustedExpiryTime - now.getTime();
    return Math.max(0, timeLeft);
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
      usedAt: Option.getOrNull(this.usedAt),
      createdAt: this.createdAt,
      isValid: this.isValid(clockSkewToleranceMs),
      isExpired: this.isExpired(clockSkewToleranceMs),
      isUsed: this.isUsed(),
      timeToExpiry: this.getTimeToExpiry(clockSkewToleranceMs),
    };
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
      .replace(/=/g, ''); // Remove padding for URL safety
  }
}
