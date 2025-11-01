import { Effect } from "effect"
import { DocumentId, UserId } from "@domain/refined/ids"
import { FileKey, MimeType, FileSize } from "@domain/refined/file-reference"
import { Sha256 } from "@domain/refined/checksum"

export type FileStorageErrorCode = "NOT_FOUND" | "ACCESS_DENIED" | "STORAGE_ERROR" | "UPLOAD_FAILED" | "INVALID_REQUEST" | "EXPIRED"

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
   */
  abstract uploadFile(
    request: UploadFileRequest
  ): Effect.Effect<UploadFileResponse, FileStorageError>

  // ===== DIRECT DOWNLOAD OPERATIONS =====

  /**
   * Downloads a file by creating a readable stream from stored file.
   * 
   * This method:
   * - Creates a ReadableStream from the stored file at the given fileKey
   * - Returns file metadata including MIME type and size
   * - Supports efficient streaming for large files
   */
  abstract downloadFile(
    fileKey: FileKey
  ): Effect.Effect<DownloadFileResponse, FileStorageError>
}
