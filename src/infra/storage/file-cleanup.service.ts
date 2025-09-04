import { Result, ok, err } from "../../shared/result/result";
import { createServiceLogger, logSecurityEvent } from "../../shared/logging/logger";
import { FileStorage } from "../../domain/services/document.service";

/**
 * File cleanup service for handling orphaned files and failed operations.
 * Provides mechanisms to safely cleanup files when transactions fail.
 */
export class FileCleanupService {
  private readonly logger = createServiceLogger('FileCleanupService');
  private readonly pendingCleanups = new Set<string>();

  constructor(private readonly fileStorage: FileStorage) {}

  /**
   * Registers a file for potential cleanup if operation fails.
   */
  registerForCleanup(storageKey: string): void {
    this.pendingCleanups.add(storageKey);
    this.logger.debug({ storageKey }, "File registered for potential cleanup");
  }

  /**
   * Confirms successful operation and removes file from cleanup list.
   */
  confirmSuccess(storageKey: string): void {
    this.pendingCleanups.delete(storageKey);
    this.logger.debug({ storageKey }, "File confirmed successful, removed from cleanup list");
  }

  /**
   * Performs cleanup for a specific file.
   */
  async cleanupFile(storageKey: string): Promise<Result<boolean, Error>> {
    try {
      this.logger.info({ storageKey }, "Starting file cleanup");
      
      const result = await this.fileStorage.delete(storageKey);
      this.pendingCleanups.delete(storageKey);
      
      if (result.ok) {
        this.logger.info({ storageKey }, "File cleanup successful");
        return ok(true);
      } else {
        this.logger.error({ storageKey, error: result.error.message }, "File cleanup failed");
        return err(result.error);
      }
    } catch (error) {
      this.logger.error({ 
        storageKey, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, "Unexpected error during file cleanup");
      
      return err(new Error(`File cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  /**
   * Performs cleanup for all pending files.
   */
  async cleanupAllPending(): Promise<Result<number, Error>> {
    const filesToCleanup = Array.from(this.pendingCleanups);
    let successCount = 0;
    let errors: Error[] = [];

    this.logger.info({ count: filesToCleanup.length }, "Starting cleanup of all pending files");

    for (const storageKey of filesToCleanup) {
      const result = await this.cleanupFile(storageKey);
      if (result.ok) {
        successCount++;
      } else {
        errors.push(result.error);
      }
    }

    if (errors.length > 0) {
      this.logger.warn({ 
        successCount, 
        errorCount: errors.length,
        totalCount: filesToCleanup.length 
      }, "Partial cleanup completed with errors");
      
      logSecurityEvent("file_cleanup_partial_failure", undefined, {
        successCount,
        errorCount: errors.length,
        totalCount: filesToCleanup.length
      });
      
      return err(new Error(`Partial cleanup: ${successCount}/${filesToCleanup.length} files cleaned successfully`));
    }

    this.logger.info({ successCount }, "All pending files cleaned successfully");
    return ok(successCount);
  }

  /**
   * Gets the count of pending cleanups.
   */
  getPendingCleanupCount(): number {
    return this.pendingCleanups.size;
  }

  /**
   * Gets all pending cleanup storage keys (for debugging).
   */
  getPendingCleanups(): string[] {
    return Array.from(this.pendingCleanups);
  }
}

