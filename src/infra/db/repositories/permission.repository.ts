import { eq, and } from "drizzle-orm";
import { 
  PermissionRepository, 
  PermissionRepositoryError 
} from "../../../domain/services/permission.service";
import { Permission, PermissionLevel } from "../../../domain/entities/permission.entity";
import { Result, ok, err } from "../../../shared/result/result";
import { UserId, DocumentId, asPermissionId } from "../../../shared/types/brand";
import { permissions } from "../../../lib/db/schema";
import { Database, DatabaseTransaction } from "../../../lib/db/connection";
import { TransactionManager } from "../../../lib/db/transaction";

/**
 * Drizzle ORM implementation of the PermissionRepository.
 * Handles all database operations for permissions with transaction support.
 */
export class DrizzlePermissionRepository implements PermissionRepository {
  private readonly transactionManager: TransactionManager;

  constructor(private readonly db: Database) {
    this.transactionManager = new TransactionManager(db);
  }

  async save(permission: Permission): Promise<Result<Permission, PermissionRepositoryError>> {
    try {
      const permissionData = {
        id: permission.id,
        documentId: permission.documentId,
        userId: permission.userId,
        permission: permission.level,
        createdAt: permission.createdAt,
      };

      await this.db.insert(permissions).values(permissionData);

      return ok(permission);
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate key')) {
        return err(new PermissionRepositoryError(
          "Permission already exists for this document and user",
          "PERMISSION_ALREADY_EXISTS",
          error
        ));
      }

      return err(new PermissionRepositoryError(
        "Failed to save permission",
        "DATABASE_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  async findByDocumentAndUser(
    documentId: DocumentId,
    userId: UserId
  ): Promise<Result<Permission | null, PermissionRepositoryError>> {
    try {
      const result = await this.db
        .select()
        .from(permissions)
        .where(
          and(
            eq(permissions.documentId, documentId),
            eq(permissions.userId, userId)
          )
        )
        .limit(1);

      if (result.length === 0) {
        return ok(null);
      }

      const permissionRow = result[0]!; // We know it exists because length > 0
      const permission = Permission.fromPersistence({
        id: asPermissionId(permissionRow.id),
        documentId: permissionRow.documentId as DocumentId,
        userId: permissionRow.userId as UserId,
        level: permissionRow.permission as PermissionLevel,
        createdAt: permissionRow.createdAt,
      });

      return ok(permission);
    } catch (error) {
      return err(new PermissionRepositoryError(
        "Failed to find permission",
        "DATABASE_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  async findByDocument(
    documentId: DocumentId
  ): Promise<Result<Permission[], PermissionRepositoryError>> {
    try {
      const result = await this.db
        .select()
        .from(permissions)
        .where(eq(permissions.documentId, documentId));

      const permissionEntities = result.map(row => 
        Permission.fromPersistence({
          id: asPermissionId(row.id),
          documentId: row.documentId as DocumentId,
          userId: row.userId as UserId,
          level: row.permission as PermissionLevel,
          createdAt: row.createdAt,
        })
      );

      return ok(permissionEntities);
    } catch (error) {
      return err(new PermissionRepositoryError(
        "Failed to find permissions by document",
        "DATABASE_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  async findByUser(
    userId: UserId
  ): Promise<Result<Permission[], PermissionRepositoryError>> {
    try {
      const result = await this.db
        .select()
        .from(permissions)
        .where(eq(permissions.userId, userId));

      const permissionEntities = result.map(row => 
        Permission.fromPersistence({
          id: asPermissionId(row.id),
          documentId: row.documentId as DocumentId,
          userId: row.userId as UserId,
          level: row.permission as PermissionLevel,
          createdAt: row.createdAt,
        })
      );

      return ok(permissionEntities);
    } catch (error) {
      return err(new PermissionRepositoryError(
        "Failed to find permissions by user",
        "DATABASE_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  async removeByDocumentAndUser(
    documentId: DocumentId,
    userId: UserId
  ): Promise<Result<boolean, PermissionRepositoryError>> {
    try {
      const result = await this.db
        .delete(permissions)
        .where(
          and(
            eq(permissions.documentId, documentId),
            eq(permissions.userId, userId)
          )
        );

      // Check if any rows were affected
      const deleted = result.rowCount !== null && result.rowCount > 0;
      return ok(deleted);
    } catch (error) {
      return err(new PermissionRepositoryError(
        "Failed to remove permission",
        "DATABASE_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  async removeByDocument(
    documentId: DocumentId
  ): Promise<Result<number, PermissionRepositoryError>> {
    try {
      const result = await this.db
        .delete(permissions)
        .where(eq(permissions.documentId, documentId));

      const deletedCount = result.rowCount || 0;
      return ok(deletedCount);
    } catch (error) {
      return err(new PermissionRepositoryError(
        "Failed to remove permissions by document",
        "DATABASE_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  async updatePermissionLevel(
    documentId: DocumentId,
    userId: UserId,
    newLevel: PermissionLevel
  ): Promise<Result<Permission, PermissionRepositoryError>> {
    try {
      const result = await this.db
        .update(permissions)
        .set({ permission: newLevel })
        .where(
          and(
            eq(permissions.documentId, documentId),
            eq(permissions.userId, userId)
          )
        )
        .returning();

      if (result.length === 0) {
        return err(new PermissionRepositoryError(
          "Permission not found for update",
          "PERMISSION_NOT_FOUND"
        ));
      }

      const updatedRow = result[0]!; // We know it exists because length > 0
      const permission = Permission.fromPersistence({
        id: asPermissionId(updatedRow.id),
        documentId: updatedRow.documentId as DocumentId,
        userId: updatedRow.userId as UserId,
        level: updatedRow.permission as PermissionLevel,
        createdAt: updatedRow.createdAt,
      });

      return ok(permission);
    } catch (error) {
      return err(new PermissionRepositoryError(
        "Failed to update permission level",
        "DATABASE_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  // Transaction support methods

  /**
   * Saves a permission within an existing transaction.
   */
  async saveInTransaction(permission: Permission, tx: DatabaseTransaction): Promise<Result<Permission, PermissionRepositoryError>> {
    try {
      const permissionData = {
        id: permission.id,
        documentId: permission.documentId,
        userId: permission.userId,
        permission: permission.level,
        createdAt: permission.createdAt,
      };

      await tx.insert(permissions).values(permissionData);
      return ok(permission);
    } catch (error) {
      return err(new PermissionRepositoryError(
        "Failed to save permission in transaction",
        "DATABASE_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  /**
   * Removes a permission within an existing transaction.
   */
  async removeInTransaction(documentId: DocumentId, userId: UserId, tx: DatabaseTransaction): Promise<Result<boolean, PermissionRepositoryError>> {
    try {
      await tx
        .delete(permissions)
        .where(
          and(
            eq(permissions.documentId, documentId),
            eq(permissions.userId, userId)
          )
        );

      return ok(true);
    } catch (error) {
      return err(new PermissionRepositoryError(
        "Failed to remove permission in transaction",
        "DATABASE_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  /**
   * Updates a permission level within an existing transaction.
   */
  async updatePermissionLevelInTransaction(
    documentId: DocumentId,
    userId: UserId,
    newLevel: PermissionLevel,
    tx: DatabaseTransaction
  ): Promise<Result<Permission, PermissionRepositoryError>> {
    try {
      const result = await tx
        .update(permissions)
        .set({ permission: newLevel })
        .where(
          and(
            eq(permissions.documentId, documentId),
            eq(permissions.userId, userId)
          )
        )
        .returning();

      if (result.length === 0) {
        return err(new PermissionRepositoryError(
          "Permission not found for update",
          "PERMISSION_NOT_FOUND"
        ));
      }

      const updatedRow = result[0]!;
      const permission = Permission.fromPersistence({
        id: asPermissionId(updatedRow.id),
        documentId: updatedRow.documentId as DocumentId,
        userId: updatedRow.userId as UserId,
        level: updatedRow.permission as PermissionLevel,
        createdAt: updatedRow.createdAt,
      });

      return ok(permission);
    } catch (error) {
      return err(new PermissionRepositoryError(
        "Failed to update permission level in transaction",
        "DATABASE_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  /**
   * Executes an operation within a database transaction.
   */
  async executeInTransaction<T>(operation: (tx: DatabaseTransaction) => Promise<Result<T, Error>>): Promise<Result<T, PermissionRepositoryError>> {
    try {
      const result = await this.transactionManager.executeInTransaction(operation);
      
      if (!result.ok) {
        return err(new PermissionRepositoryError(
          "Transaction execution failed",
          "DATABASE_ERROR",
          result.error
        ));
      }
      
      return result;
    } catch (error) {
      return err(new PermissionRepositoryError(
        "Transaction execution failed",
        "DATABASE_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }
}
