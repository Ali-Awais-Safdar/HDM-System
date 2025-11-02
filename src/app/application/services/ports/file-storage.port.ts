import { Effect } from "effect"
import { DocumentId, UserId } from "@domain/refined/ids"
import { FileKey, MimeType, FileSize } from "@domain/refined/file-reference"
import { Sha256 } from "@domain/refined/checksum"

export type FileStorageErrorCode = 
  | "NOT_FOUND" 
  | "ACCESS_DENIED" 
  | "STORAGE_ERROR" 
  | "UPLOAD_FAILED" 
  | "INVALID_REQUEST" 
  | "EXPIRED"

/**
 * Expected file storage errors that can be handled by the application
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
 * Unexpected file storage errors (systemic failures) that should fail fast
 * Examples: filesystem unavailable, permissions denied at OS level, disk full
 */
export class FileStorageUnexpected extends Error {
  readonly _tag = "FileStorageUnexpected" as const
  
  constructor(
    message: string,
    public readonly errorType: "FILESYSTEM_UNAVAILABLE" | "PERMISSION_DENIED" | "DISK_FULL" | "UNKNOWN",
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = "FileStorageUnexpected"
  }
}

export type FileStorageErrorType = FileStorageError | FileStorageUnexpected

// ===== DIRECT UPLOAD TYPES =====

export interface UploadFileRequest {
  readonly stream: ReadableStream<Uint8Array>
  readonly metadata: {
    readonly documentId: DocumentId
    readonly userId: UserId
    readonly contentRef: string
    readonly mimeType: MimeType
    readonly expectedSize: FileSize
    readonly originalFilename?: string
  }
}

export interface UploadFileResponse {
  readonly fileKey: FileKey
  readonly checksum: Sha256
  readonly actualSize: FileSize
  readonly actualMimeType: MimeType
}

// ===== DIRECT DOWNLOAD TYPES =====

export interface DownloadFileMetadata {
  readonly mimeType: MimeType
  readonly size: FileSize
  readonly checksum: Sha256
  readonly originalFilename?: string
}

export interface DownloadFileResponse {
  readonly stream: ReadableStream<Uint8Array>
  readonly metadata: DownloadFileMetadata
}

export abstract class FileStoragePort {
  // ===== DIRECT UPLOAD OPERATIONS =====

  /**
   * Uploads a file directly by streaming file data to storage.
   * 
   * This method:
   * - Streams file data from ReadableStream to storage location
   * - Calculates SHA-256 checksum during write operation
   * - Validates file size and MIME type against expected values
   * - Generates deterministic fileKey based on contentRef
   * - Returns fileKey immediately after successful upload
   * 
   * Error handling:
   * - Expected errors (FileStorageError): file not found, invalid request
   * - Unexpected errors (FileStorageUnexpected): filesystem unavailable (fail-fast)
   */
  abstract uploadFile(
    request: UploadFileRequest
  ): Effect.Effect<UploadFileResponse, FileStorageErrorType>

  // ===== DIRECT DOWNLOAD OPERATIONS =====

  /**
   * Downloads a file by creating a readable stream from stored file.
   * 
   * This method:
   * - Creates a ReadableStream from the stored file at the given fileKey
   * - Returns file metadata including MIME type and size
   * - Supports efficient streaming for large files
   * 
   * Error handling:
   * - Expected errors (FileStorageError): file not found, access denied
   * - Unexpected errors (FileStorageUnexpected): filesystem unavailable (fail-fast)
   */
  abstract downloadFile(
    fileKey: FileKey
  ): Effect.Effect<DownloadFileResponse, FileStorageErrorType>
}
