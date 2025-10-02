import { Effect } from "effect"
import { DomainError } from "../errors/domain.errors"

/**
 * File storage port (interface) for document file operations.
 */
export abstract class FileStoragePort {

  abstract store(key: string, data: Buffer): Effect.Effect<string, FileStorageError>

  abstract retrieve(key: string): Effect.Effect<Buffer, FileStorageError>


  abstract delete(key: string): Effect.Effect<void, FileStorageError>


  abstract exists(key: string): Effect.Effect<boolean, FileStorageError>
}

export type FileStorageErrorCode = "NOT_FOUND" | "ACCESS_DENIED" | "STORAGE_ERROR"

export class FileStorageError extends DomainError {
  readonly _tag = "FileStorageError" as const
  
  constructor(
    message: string,
    public readonly code: FileStorageErrorCode = "STORAGE_ERROR",
    public readonly cause?: unknown,
    details?: Record<string, unknown>
  ) {
    super(message, { code, cause: cause instanceof Error ? cause.message : String(cause), ...details })
  }
}

