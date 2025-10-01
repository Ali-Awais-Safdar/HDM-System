import { Result, ok, err } from "../../shared/result/result";
import { UserId, DocumentId } from "../value-objects/id.vo";
import { Permission, PermissionLevel } from "../entities/permission.entity";

/**
 * Domain service interface for permission management.
 * Defines the contract for permission persistence operations.
 */
export interface PermissionRepository {
  /**
   * Saves a permission to the persistence layer.
   */
  save(permission: Permission): Promise<Result<Permission, PermissionRepositoryError>>;

  /**
   * Finds a permission by document and user.
   */
  findByDocumentAndUser(
    documentId: DocumentId,
    userId: UserId
  ): Promise<Result<Permission | null, PermissionRepositoryError>>;

  /**
   * Finds all permissions for a document.
   */
  findByDocument(
    documentId: DocumentId
  ): Promise<Result<Permission[], PermissionRepositoryError>>;

  /**
   * Finds all permissions for a user.
   */
  findByUser(
    userId: UserId
  ): Promise<Result<Permission[], PermissionRepositoryError>>;

  /**
   * Removes a permission by document and user.
   */
  removeByDocumentAndUser(
    documentId: DocumentId,
    userId: UserId
  ): Promise<Result<boolean, PermissionRepositoryError>>;

  /**
   * Removes all permissions for a document.
   */
  removeByDocument(
    documentId: DocumentId
  ): Promise<Result<number, PermissionRepositoryError>>;

  /**
   * Updates an existing permission level.
   */
  updatePermissionLevel(
    documentId: DocumentId,
    userId: UserId,
    newLevel: PermissionLevel
  ): Promise<Result<Permission, PermissionRepositoryError>>;

  /**
   * Transaction support methods
   */
  saveInTransaction(permission: Permission, tx: import("../../lib/db/connection").DatabaseTransaction): Promise<Result<Permission, PermissionRepositoryError>>;
  removeInTransaction(documentId: DocumentId, userId: UserId, tx: import("../../lib/db/connection").DatabaseTransaction): Promise<Result<boolean, PermissionRepositoryError>>;
  updatePermissionLevelInTransaction(
    documentId: DocumentId,
    userId: UserId,
    newLevel: PermissionLevel,
    tx: import("../../lib/db/connection").DatabaseTransaction
  ): Promise<Result<Permission, PermissionRepositoryError>>;
  executeInTransaction<T>(operation: (tx: import("../../lib/db/connection").DatabaseTransaction) => Promise<Result<T, Error>>): Promise<Result<T, PermissionRepositoryError>>;
}

/**
 * Error types for permission repository operations.
 */
export class PermissionRepositoryError extends Error {
  constructor(
    message: string,
    public readonly code: PermissionRepositoryErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "PermissionRepositoryError";
  }
}

export type PermissionRepositoryErrorCode =
  | "PERMISSION_NOT_FOUND"
  | "PERMISSION_ALREADY_EXISTS"
  | "INVALID_PERMISSION_LEVEL"
  | "DATABASE_ERROR"
  | "CONSTRAINT_VIOLATION";

/**
 * Domain service for permission-related business logic.
 */
export class PermissionService {
  constructor(private readonly permissionRepository: PermissionRepository) {}

  /**
   * Grants or updates a permission for a user on a document.
   * If the permission already exists, it updates the level.
   * Uses transactions to ensure consistency.
   */
  async grantPermission(
    documentId: DocumentId,
    userId: UserId,
    level: PermissionLevel
  ): Promise<Result<Permission, PermissionServiceError>> {
    try {
      const transactionResult = await this.permissionRepository.executeInTransaction(async (tx) => {
        // Check if permission already exists
        const existingResult = await this.permissionRepository.findByDocumentAndUser(
          documentId,
          userId
        );

        if (!existingResult.ok) {
          return err(new PermissionServiceError(
            "Failed to check existing permission",
            "REPOSITORY_ERROR",
            existingResult.error
          ));
        }

        if (existingResult.value) {
          // Update existing permission within transaction
          const updateResult = await this.permissionRepository.updatePermissionLevelInTransaction(
            documentId,
            userId,
            level,
            tx
          );

          if (!updateResult.ok) {
            return err(new PermissionServiceError(
              "Failed to update permission",
              "REPOSITORY_ERROR",
              updateResult.error
            ));
          }

          return ok(updateResult.value);
        } else {
          // Create new permission within transaction
          const permission = Permission.create({
            documentId,
            userId,
            level
          });

          const saveResult = await this.permissionRepository.saveInTransaction(permission, tx);

          if (!saveResult.ok) {
            return err(new PermissionServiceError(
              "Failed to save permission",
              "REPOSITORY_ERROR",
              saveResult.error
            ));
          }

          return ok(saveResult.value);
        }
      });

      if (!transactionResult.ok) {
        return err(new PermissionServiceError(
          "Transaction failed",
          "TRANSACTION_ERROR",
          transactionResult.error
        ));
      }

      return transactionResult;
    } catch (error) {
      return err(new PermissionServiceError(
        "Unexpected error while granting permission",
        "UNKNOWN_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  /**
   * Revokes a permission for a user on a document.
   * Uses transactions to ensure consistency.
   */
  async revokePermission(
    documentId: DocumentId,
    userId: UserId
  ): Promise<Result<boolean, PermissionServiceError>> {
    try {
      const transactionResult = await this.permissionRepository.executeInTransaction(async (tx) => {
        const result = await this.permissionRepository.removeInTransaction(
          documentId,
          userId,
          tx
        );

        if (!result.ok) {
          return err(new PermissionServiceError(
            "Failed to revoke permission",
            "REPOSITORY_ERROR",
            result.error
          ));
        }

        return ok(result.value);
      });

      if (!transactionResult.ok) {
        return err(new PermissionServiceError(
          "Transaction failed",
          "TRANSACTION_ERROR",
          transactionResult.error
        ));
      }

      return transactionResult;
    } catch (error) {
      return err(new PermissionServiceError(
        "Unexpected error while revoking permission",
        "UNKNOWN_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }
}

/**
 * Error types for permission service operations.
 */
export class PermissionServiceError extends Error {
  constructor(
    message: string,
    public readonly code: PermissionServiceErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "PermissionServiceError";
  }
}

export type PermissionServiceErrorCode =
  | "REPOSITORY_ERROR"
  | "PERMISSION_NOT_FOUND"
  | "INVALID_PERMISSION_LEVEL"
  | "TRANSACTION_ERROR"
  | "UNKNOWN_ERROR";

// Result helper functions imported at the top
