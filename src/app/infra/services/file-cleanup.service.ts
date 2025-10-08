import { Effect } from "effect"
import { FileStorageError, FileStoragePort } from "@application/services/ports/file-storage.port"
import { createServiceLogger, logSecurityEvent } from "@shared/logging/logger"

/**
 * File cleanup service for handling orphaned files and failed operations.
 */
export class FileCleanupService {
  private readonly logger = createServiceLogger('FileCleanupService')
  private readonly pendingCleanups = new Set<string>()

  constructor(private readonly fileStorage: FileStoragePort) {}

  registerForCleanup(storageKey: string): void {
    this.pendingCleanups.add(storageKey)
    this.logger.debug({ storageKey }, "File registered for potential cleanup")
  }

  confirmSuccess(storageKey: string): void {
    this.pendingCleanups.delete(storageKey)
    this.logger.debug({ storageKey }, "File confirmed successful, removed from cleanup list")
  }

  cleanupFile(storageKey: string): Effect.Effect<boolean, FileStorageError> {
    return Effect.gen(this, function* () {
      this.logger.info({ storageKey }, "Starting file cleanup")
      
      yield* this.fileStorage.delete(storageKey)
      this.pendingCleanups.delete(storageKey)
      
      this.logger.info({ storageKey }, "File cleanup successful")
      return true
    }).pipe(
      Effect.catchAll((error) => {
        this.logger.error({ 
          storageKey, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        }, "File cleanup failed")
        
        return Effect.fail(error)
      })
    )
  }

  cleanupAllPending(): Effect.Effect<number, FileStorageError> {
    const filesToCleanup = Array.from(this.pendingCleanups)
    
    this.logger.info({ count: filesToCleanup.length }, "Starting cleanup of all pending files")

    return Effect.gen(this, function* () {
      let successCount = 0
      const errors: FileStorageError[] = []

      for (const storageKey of filesToCleanup) {
        const result = yield* this.cleanupFile(storageKey).pipe(
          Effect.match({
            onFailure: (error) => ({ success: false as const, error }),
            onSuccess: () => ({ success: true as const })
          })
        )

        if (result.success) {
          successCount++
        } else {
          errors.push(result.error)
        }
      }

      if (errors.length > 0) {
        this.logger.warn({ 
          successCount, 
          errorCount: errors.length,
          totalCount: filesToCleanup.length 
        }, "Partial cleanup completed with errors")
        
        logSecurityEvent("file_cleanup_partial_failure", undefined, {
          successCount,
          errorCount: errors.length,
          totalCount: filesToCleanup.length
        })
        
        return yield* Effect.fail(
          new FileStorageError(
            `Partial cleanup: ${successCount}/${filesToCleanup.length} files cleaned successfully`,
            "STORAGE_ERROR"
          )
        )
      }

      this.logger.info({ successCount }, "All pending files cleaned successfully")
      return successCount
    })
  }

  getPendingCleanupCount(): number {
    return this.pendingCleanups.size
  }

  getPendingCleanups(): string[] {
    return Array.from(this.pendingCleanups)
  }
}
