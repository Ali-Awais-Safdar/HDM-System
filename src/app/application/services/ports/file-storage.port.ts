import { Effect } from "effect"

export type FileStorageErrorCode = "NOT_FOUND" | "ACCESS_DENIED" | "STORAGE_ERROR"

/**
 * File storage error for file operations failures.
 */
export class FileStorageError extends Error {
  readonly _tag = "FileStorageError" as const
  
  constructor(
    message: string,
    public readonly code: FileStorageErrorCode = "STORAGE_ERROR",
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = "FileStorageError"
  }
}

/**
 * File storage port (interface) for document file operations.
 * This is an application-level port for external file storage technology.
 */
export abstract class FileStoragePort {
  abstract store(key: string, data: Buffer): Effect.Effect<string, FileStorageError>
  abstract retrieve(key: string): Effect.Effect<Buffer, FileStorageError>
  abstract delete(key: string): Effect.Effect<void, FileStorageError>
  abstract exists(key: string): Effect.Effect<boolean, FileStorageError>
}
