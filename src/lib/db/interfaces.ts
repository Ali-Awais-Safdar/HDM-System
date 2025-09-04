import { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/**
 * Database interface abstractions using proper Drizzle types.
 * These interfaces provide type-safe abstractions for database operations
 * while maintaining compatibility with the existing architecture.
 */

/**
 * Main database interface - provides type-safe access to all database operations.
 * This is the primary interface that repositories should depend on.
 */
export interface DatabaseInterface extends NodePgDatabase<typeof schema> {
  // All methods from NodePgDatabase are inherited
  // This provides full type safety for all Drizzle operations
}

/**
 * Transaction interface - provides type-safe access to transaction operations.
 * This is used for operations that need to be executed within a database transaction.
 */
export interface DatabaseTransactionInterface extends NodePgDatabase<typeof schema> {
  // All methods from NodePgDatabase are inherited
  // This provides full type safety for transaction operations
}

/**
 * Repository base interface that provides access to database operations.
 * All repositories should implement this interface to ensure consistent
 * database access patterns across the application.
 */
export interface RepositoryDatabaseInterface {
  /**
   * Provides access to the main database instance for regular operations.
   */
  getDatabase(): DatabaseInterface;

  /**
   * Provides access to the transaction manager for transaction operations.
   */
  getTransactionManager(): TransactionManagerInterface;
}

/**
 * Transaction manager interface for handling database transactions.
 * This abstracts the transaction management logic while maintaining type safety.
 */
export interface TransactionManagerInterface {
  /**
   * Executes a function within a database transaction.
   * Automatically handles rollback on errors and commit on success.
   */
  executeInTransaction<T, E extends Error>(
    operation: (tx: DatabaseTransactionInterface) => Promise<import("../../shared/result/result").Result<T, E>>
  ): Promise<import("../../shared/result/result").Result<T, E>>;

  /**
   * Executes multiple operations within a single transaction.
   * All operations must succeed, or all will be rolled back.
   */
  executeMultipleInTransaction<T, E extends Error>(
    operations: Array<(tx: DatabaseTransactionInterface) => Promise<import("../../shared/result/result").Result<T, E>>>
  ): Promise<import("../../shared/result/result").Result<T[], E>>;
}

/**
 * Type aliases for convenience and backward compatibility.
 * These maintain the existing naming conventions while providing proper types.
 */
export type Database = DatabaseInterface;
export type DatabaseTransaction = DatabaseTransactionInterface;
export type TransactionManager = TransactionManagerInterface;
