import { Result, ok, err } from "../../shared/result/result";
import { Database, DatabaseTransaction } from "./connection";
import { TransactionManagerInterface } from "./interfaces";

/**
 * Transaction manager for handling multi-step operations.
 * Provides a clean interface for transaction management following the existing patterns.
 */
export class TransactionManager implements TransactionManagerInterface {
  constructor(private readonly db: Database) {}

  /**
   * Executes a function within a database transaction.
   * Automatically handles rollback on errors and commit on success.
   */
  async executeInTransaction<T, E extends Error>(
    operation: (tx: DatabaseTransaction) => Promise<Result<T, E>>
  ): Promise<Result<T, E>> {
    try {
      return await this.db.transaction(async (tx) => {
        const result = await operation(tx);
        
        // If the operation failed, throw to trigger rollback
        if (!result.ok) {
          throw new TransactionError(result.error.message, result.error);
        }
        
        return result;
      });
    } catch (error) {
      if (error instanceof TransactionError) {
        return err(error.originalError as E);
      }
      return err(new Error("Transaction failed unexpectedly") as E);
    }
  }

  /**
   * Executes multiple operations within a single transaction.
   * All operations must succeed, or all will be rolled back.
   */
  async executeMultipleInTransaction<T, E extends Error>(
    operations: Array<(tx: DatabaseTransaction) => Promise<Result<T, E>>>
  ): Promise<Result<T[], E>> {
    return this.executeInTransaction(async (tx) => {
      const results: T[] = [];
      
      for (const operation of operations) {
        const result = await operation(tx);
        if (!result.ok) {
          return err(result.error);
        }
        results.push(result.value);
      }
      
      return ok(results);
    });
  }
}

/**
 * Internal error for transaction management.
 */
class TransactionError extends Error {
  constructor(message: string, public readonly originalError: Error) {
    super(message);
    this.name = 'TransactionError';
  }
}

/**
 * Repository interface with transaction support.
 */
export interface TransactionAwareRepository {
  /**
   * Provides access to the database instance for transactions.
   */
  getDatabase(): Database;
}
