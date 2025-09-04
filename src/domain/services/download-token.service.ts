import { Result, ok, err } from "../../shared/result/result";
import { UserId, DocumentId } from "../../shared/types/brand";
import { DownloadToken } from "../entities/download-token.entity";

/**
 * Domain service interface for download token management.
 * Defines the contract for download token persistence operations.
 */
export interface DownloadTokenRepository {
  /**
   * Saves a download token to the persistence layer.
   */
  save(token: DownloadToken): Promise<Result<DownloadToken, DownloadTokenRepositoryError>>;

  /**
   * Finds a download token by its token string.
   */
  findByToken(token: string): Promise<Result<DownloadToken | null, DownloadTokenRepositoryError>>;

  /**
   * Finds all download tokens for a specific document.
   */
  findByDocument(
    documentId: DocumentId
  ): Promise<Result<DownloadToken[], DownloadTokenRepositoryError>>;

  /**
   * Finds all download tokens issued to a specific user.
   */
  findByUser(
    userId: UserId
  ): Promise<Result<DownloadToken[], DownloadTokenRepositoryError>>;

  /**
   * Updates a download token (typically to mark as used).
   */
  update(token: DownloadToken): Promise<Result<DownloadToken, DownloadTokenRepositoryError>>;

  /**
   * Removes expired tokens from the database.
   * Returns the number of tokens removed.
   */
  removeExpiredTokens(): Promise<Result<number, DownloadTokenRepositoryError>>;

  /**
   * Removes all tokens for a specific document.
   */
  removeByDocument(
    documentId: DocumentId
  ): Promise<Result<number, DownloadTokenRepositoryError>>;
}

/**
 * Error types for download token repository operations.
 */
export class DownloadTokenRepositoryError extends Error {
  constructor(
    message: string,
    public readonly code: DownloadTokenRepositoryErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "DownloadTokenRepositoryError";
  }
}

export type DownloadTokenRepositoryErrorCode =
  | "TOKEN_NOT_FOUND"
  | "TOKEN_ALREADY_EXISTS"
  | "DATABASE_ERROR"
  | "CONSTRAINT_VIOLATION";

/**
 * Domain service for download token business logic.
 */
export class DownloadTokenService {
  constructor(
    private readonly tokenRepository: DownloadTokenRepository,
    private readonly clockSkewToleranceMs: number = 0
  ) {}

  /**
   * Generates a new download token for a document and user.
   */
  async generateDownloadToken(
    documentId: DocumentId,
    issuedTo: UserId,
    expiresAt?: Date
  ): Promise<Result<DownloadToken, DownloadTokenServiceError>> {
    try {
      const token = expiresAt 
        ? DownloadToken.create({ documentId, issuedTo, expiresAt })
        : DownloadToken.createWithDefaultExpiry({ documentId, issuedTo });

      const saveResult = await this.tokenRepository.save(token);

      if (!saveResult.ok) {
        return err(new DownloadTokenServiceError(
          "Failed to save download token",
          "REPOSITORY_ERROR",
          saveResult.error
        ));
      }

      return ok(saveResult.value);
    } catch (error) {
      return err(new DownloadTokenServiceError(
        "Unexpected error while generating download token",
        "UNKNOWN_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  /**
   * Validates and consumes a download token.
   * Returns the token if valid, marks it as used.
   */
  async consumeDownloadToken(
    tokenString: string
  ): Promise<Result<DownloadToken, DownloadTokenServiceError>> {
    try {
      // Find the token
      const findResult = await this.tokenRepository.findByToken(tokenString);

      if (!findResult.ok) {
        return err(new DownloadTokenServiceError(
          "Failed to find download token",
          "REPOSITORY_ERROR",
          findResult.error
        ));
      }

      if (!findResult.value) {
        return err(new DownloadTokenServiceError(
          "Download token not found",
          "TOKEN_NOT_FOUND"
        ));
      }

      const token = findResult.value;

      // Validate token - check specific conditions first for better error messages
      if (token.isUsed()) {
        return err(new DownloadTokenServiceError(
          "Download token has already been used",
          "TOKEN_ALREADY_USED"
        ));
      }
      
      if (token.isExpired(this.clockSkewToleranceMs)) {
        return err(new DownloadTokenServiceError(
          "Download token has expired",
          "TOKEN_EXPIRED"
        ));
      }

      // Mark token as used
      const usedToken = token.markAsUsed();
      const updateResult = await this.tokenRepository.update(usedToken);

      if (!updateResult.ok) {
        return err(new DownloadTokenServiceError(
          "Failed to mark token as used",
          "REPOSITORY_ERROR",
          updateResult.error
        ));
      }

      return ok(updateResult.value);
    } catch (error) {
      return err(new DownloadTokenServiceError(
        "Unexpected error while consuming download token",
        "UNKNOWN_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  /**
   * Cleans up expired tokens from the database.
   */
  async cleanupExpiredTokens(): Promise<Result<number, DownloadTokenServiceError>> {
    try {
      const result = await this.tokenRepository.removeExpiredTokens();

      if (!result.ok) {
        return err(new DownloadTokenServiceError(
          "Failed to cleanup expired tokens",
          "REPOSITORY_ERROR",
          result.error
        ));
      }

      return ok(result.value);
    } catch (error) {
      return err(new DownloadTokenServiceError(
        "Unexpected error during token cleanup",
        "UNKNOWN_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  /**
   * Gets active (valid) tokens for a document.
   */
  async getActiveTokensForDocument(
    documentId: DocumentId
  ): Promise<Result<DownloadToken[], DownloadTokenServiceError>> {
    try {
      const result = await this.tokenRepository.findByDocument(documentId);

      if (!result.ok) {
        return err(new DownloadTokenServiceError(
          "Failed to get tokens for document",
          "REPOSITORY_ERROR",
          result.error
        ));
      }

      // Filter only valid tokens
      const activeTokens = result.value.filter(token => token.isValid(this.clockSkewToleranceMs));
      return ok(activeTokens);
    } catch (error) {
      return err(new DownloadTokenServiceError(
        "Unexpected error while getting active tokens",
        "UNKNOWN_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }
}

/**
 * Error types for download token service operations.
 */
export class DownloadTokenServiceError extends Error {
  constructor(
    message: string,
    public readonly code: DownloadTokenServiceErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "DownloadTokenServiceError";
  }
}

export type DownloadTokenServiceErrorCode =
  | "REPOSITORY_ERROR"
  | "TOKEN_NOT_FOUND"
  | "TOKEN_EXPIRED"
  | "TOKEN_ALREADY_USED"
  | "UNKNOWN_ERROR";
