import { DownloadTokenId, UserId, DocumentId, newDownloadTokenId } from "../../shared/types/brand";
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
  private constructor(
    public readonly id: DownloadTokenId,
    public readonly token: string,
    public readonly documentId: DocumentId,
    public readonly issuedTo: UserId,
    public readonly expiresAt: Date,
    public readonly usedAt: Date | null,
    public readonly createdAt: Date
  ) {}

  /**
   * Creates a new DownloadToken with a cryptographically secure random token.
   */
  static create(props: {
    documentId: DocumentId;
    issuedTo: UserId;
    expiresAt: Date;
  }): DownloadToken {
    const token = this.generateSecureToken();
    
    return new DownloadToken(
      newDownloadTokenId(),
      token,
      props.documentId,
      props.issuedTo,
      props.expiresAt,
      null, // Not used yet
      new Date()
    );
  }

  /**
   * Creates a new DownloadToken with default 5-minute expiration.
   */
  static createWithDefaultExpiry(props: {
    documentId: DocumentId;
    issuedTo: UserId;
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
    id: DownloadTokenId;
    token: string;
    documentId: DocumentId;
    issuedTo: UserId;
    expiresAt: Date;
    usedAt: Date | null;
    createdAt: Date;
  }): DownloadToken {
    return new DownloadToken(
      props.id,
      props.token,
      props.documentId,
      props.issuedTo,
      props.expiresAt,
      props.usedAt,
      props.createdAt
    );
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
    return this.usedAt !== null;
  }

  /**
   * Marks the token as used with the current timestamp.
   * Returns a new instance (immutable).
   */
  markAsUsed(): DownloadToken {
    if (this.isUsed()) {
      throw new Error("Token has already been used");
    }

    return new DownloadToken(
      this.id,
      this.token,
      this.documentId,
      this.issuedTo,
      this.expiresAt,
      new Date(), // Mark as used now
      this.createdAt
    );
  }

  /**
   * Checks if the token belongs to the specified user.
   */
  belongsToUser(userId: UserId): boolean {
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
      usedAt: this.usedAt,
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
