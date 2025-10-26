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

// ===== UPLOAD INTENT TYPES =====

export interface InitiateUploadStorageRequest {
  readonly documentId: DocumentId
  readonly userId: UserId
  readonly contentRef: string
  readonly mimeType: MimeType
  readonly fileSize: FileSize
  readonly fileName: string
  readonly expiryMs: number
}

export interface InitiateUploadStorageResponse {
  readonly uploadUrl: string
  readonly fileKey: FileKey
  readonly contentRef: string
  readonly expiresAt: Date
  readonly uploadMetadata: UploadMetadata
}

export interface UploadMetadata {
  readonly documentId: DocumentId
  readonly userId: UserId
  readonly contentRef: string
  readonly expectedSize: FileSize
  readonly expectedMimeType: MimeType
  readonly initiatedAt: Date
  readonly expiresAt: Date
}

export interface CompleteUploadRequest {
  readonly fileKey: FileKey
  readonly contentRef: string
  readonly expectedSize: FileSize
  readonly expectedMimeType: MimeType
}

export interface CompleteUploadResponse {
  readonly fileKey: FileKey
  readonly actualSize: FileSize
  readonly actualMimeType: MimeType
  readonly checksum: Sha256
  readonly completedAt: Date
  readonly verificationMetadata: VerificationMetadata
}

export interface VerificationMetadata {
  readonly sizeValid: boolean
  readonly mimeTypeValid: boolean
  readonly contentRefValid: boolean
  readonly warnings: readonly string[]
}

export abstract class FileStoragePort {
  // ===== UPLOAD INTENT OPERATIONS =====
  
  abstract createUploadUrl(
    request: InitiateUploadStorageRequest
  ): Effect.Effect<InitiateUploadStorageResponse, FileStorageError>

  abstract completeUpload(
    request: CompleteUploadRequest
  ): Effect.Effect<CompleteUploadResponse, FileStorageError>
}
