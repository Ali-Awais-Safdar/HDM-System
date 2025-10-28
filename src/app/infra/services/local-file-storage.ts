import { Effect, pipe } from "effect"
import { promises as fs } from "fs"
import * as path from "path"
import crypto from "crypto"
import type { ConfigPort } from "@application/services/ports/config.port"
import type { LoggerPort } from "@application/services/ports/logger.port"
import { inject, injectable } from "tsyringe"
import { TOKENS } from "@infra/di/container"
import { 
  FileStoragePort, 
  FileStorageError, 
  type InitiateUploadStorageRequest, 
  type InitiateUploadStorageResponse, 
  type CompleteUploadRequest, 
  type CompleteUploadResponse, 
  type UploadMetadata 
} from "@application/services/ports/file-storage.port"
import type { FileKey, MimeType, FileSize } from "@domain/refined/file-reference"
import type { Sha256 } from "@domain/refined/checksum"

/**
 * LocalFileStorage implements FileStoragePort using the local filesystem.
 * 
 * This implementation:
 * - Stores files in a configurable base directory (STORAGE_PATH)
 * - Generates deterministic file keys based on contentRef
 * - Creates upload metadata files for tracking upload sessions
 * - Validates file existence and metadata during completeUpload
 * - Uses Effect for error handling with proper error mapping
 */
@injectable()
export class LocalFileStorage extends FileStoragePort {
  private readonly storagePath: string
  private readonly metadataPath: string
  private readonly uploadsPath: string
  private readonly logger: LoggerPort

  constructor(
    @inject(TOKENS.CONFIG_PORT)
    config: ConfigPort,
    @inject(TOKENS.LOGGER_PORT)
    logger: LoggerPort
  ) {
    super()
    this.storagePath = config.STORAGE_PATH
    this.metadataPath = path.join(this.storagePath, "metadata")
    this.uploadsPath = path.join(this.storagePath, "uploads")
    this.logger = logger.child({ service: "LocalFileStorage" })
  }

  createUploadUrl(
    request: InitiateUploadStorageRequest
  ): Effect.Effect<InitiateUploadStorageResponse, FileStorageError> {
    this.logger.debug("Creating upload URL", {
      documentId: request.documentId,
      userId: request.userId,
      fileSize: request.fileSize,
      mimeType: request.mimeType
    })
    
    return pipe(
      // 1. Ensure directories exist
      this.ensureDirectories(),
      
      // 2. Generate deterministic file key from contentRef
      Effect.flatMap(() => this.generateFileKey(request.contentRef)),
      
      // 3. Create upload metadata with file key
      Effect.flatMap((fileKey) => {
        const metadata: UploadMetadata = {
          documentId: request.documentId,
          userId: request.userId,
          contentRef: request.contentRef,
          expectedSize: request.fileSize,
          expectedMimeType: request.mimeType,
          initiatedAt: new Date(),
          expiresAt: new Date(Date.now() + request.expiryMs)
        }
        
        return pipe(
          this.createUploadMetadata(metadata, request.contentRef),
          Effect.map(() => ({ metadata, fileKey }))
        )
      }),
      
      // 4. Build response
      Effect.map(({ metadata, fileKey }) => {
        this.logger.info("Upload URL created successfully", {
          documentId: request.documentId,
          fileKey,
          expiresAt: metadata.expiresAt
        })
        
        return {
          uploadUrl: `/api/files/upload/${request.contentRef}`,
          fileKey: fileKey,
          contentRef: request.contentRef,
          expiresAt: metadata.expiresAt,
          uploadMetadata: metadata
        }
      }),
      
      // Log errors
      Effect.tapError((error) => Effect.sync(() => {
        this.logger.error("Failed to create upload URL", {
          documentId: request.documentId,
          error: error.message,
          errorCode: error.code
        })
      }))
    )
  }

  completeUpload(
    request: CompleteUploadRequest
  ): Effect.Effect<CompleteUploadResponse, FileStorageError> {
    this.logger.debug("Completing upload", {
      fileKey: request.fileKey,
      expectedSize: request.expectedSize,
      expectedMimeType: request.expectedMimeType
    })
    
    return pipe(
      // 1. Load upload metadata
      this.loadUploadMetadata(request.contentRef),
      
      // 2. Validate metadata against request
      Effect.flatMap((metadata) => {
        // Compare stored metadata with request
        const contentRefMatch = metadata.contentRef === request.contentRef
        const sizeMatch = metadata.expectedSize === request.expectedSize
        const mimeTypeMatch = metadata.expectedMimeType === request.expectedMimeType
        
        // ContentRef mismatch is critical - fail immediately
        if (!contentRefMatch) {
          return Effect.fail(new FileStorageError(
            `ContentRef mismatch: expected ${request.contentRef}, got ${metadata.contentRef}`,
            "INVALID_REQUEST"
          ))
        }
        
        // Return metadata for later use
        return Effect.succeed({ metadata, sizeMatch, mimeTypeMatch })
      }),
      
      // 3. Get the file path based on fileKey
      Effect.flatMap((validation) => {
        const filePath = path.join(this.storagePath, request.fileKey)
        return Effect.succeed({ ...validation, filePath })
      }),
      
      // 4. Verify file exists and get stats
      Effect.flatMap(({ metadata, sizeMatch, mimeTypeMatch, filePath }) =>
        pipe(
          Effect.tryPromise({
            try: async () => {
              await fs.access(filePath, fs.constants.F_OK)
              return filePath
            },
            catch: (error) => {
              // Sanitize file path in error message
              return new FileStorageError(
                `File not found: ${request.fileKey}`,
                "NOT_FOUND",
                error
              )
            }
          }),
          Effect.flatMap((existingPath) =>
            Effect.zip(
              Effect.succeed(existingPath),
              this.getFileStats(existingPath)
            )
          ),
          Effect.map(([filePath, stats]) => ({ metadata, sizeMatch, mimeTypeMatch, filePath, stats }))
        )
      ),
      
      // 5. Calculate file checksum
      Effect.flatMap(({ metadata, sizeMatch, mimeTypeMatch, filePath, stats }) =>
        pipe(
          Effect.tryPromise({
            try: async () => {
              const fileBuffer = await fs.readFile(filePath)
              const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex")
              return hash
            },
            catch: (error) => new FileStorageError(
              `Failed to calculate file checksum: ${error instanceof Error ? error.message : String(error)}`,
              "STORAGE_ERROR",
              error
            )
          }),
          Effect.map((checksum) => ({ metadata, sizeMatch, mimeTypeMatch, filePath, stats, checksum }))
        )
      ),
      
      // 6. Build verification metadata
      Effect.map(({ metadata, sizeMatch, mimeTypeMatch, filePath, stats, checksum }) => {
        const actualSize = stats.size
        const actualMimeType = this.detectMimeType(filePath)
        
        // Validate contentRef
        const contentRefValid = metadata.contentRef === request.contentRef
        
        const verificationMetadata = {
          sizeValid: actualSize === request.expectedSize && sizeMatch,
          mimeTypeValid: actualMimeType === request.expectedMimeType && mimeTypeMatch,
          contentRefValid: contentRefValid,
          warnings: [] as string[]
        }
        
        if (!verificationMetadata.sizeValid) {
          verificationMetadata.warnings.push(
            `File size mismatch: expected ${request.expectedSize}, got ${actualSize}`
          )
        }
        if (!verificationMetadata.mimeTypeValid) {
          verificationMetadata.warnings.push(
            `MIME type mismatch: expected ${request.expectedMimeType}, got ${actualMimeType}`
          )
        }
        
        return {
          fileKey: request.fileKey,
          actualSize: actualSize as FileSize,
          actualMimeType: actualMimeType as MimeType,
          checksum: checksum as Sha256,
          completedAt: new Date(),
          verificationMetadata
        }
      }),
      
      // 7. Log successful completion
      Effect.tap((response) => Effect.sync(() => {
        this.logger.info("Upload completed successfully", {
          fileKey: response.fileKey,
          actualSize: response.actualSize,
          checksum: response.checksum,
          warnings: response.verificationMetadata.warnings.length > 0 
            ? response.verificationMetadata.warnings 
            : undefined
        })
      })),
      
      // 8. Cleanup metadata file
      Effect.tap(() => this.cleanupMetadata(request.contentRef)),
      
      // Log errors
      Effect.tapError((error) => Effect.sync(() => {
        this.logger.error("Failed to complete upload", {
          fileKey: request.fileKey,
          error: error.message,
          errorCode: error.code
        })
      }))
    )
  }

  // ===== PRIVATE HELPERS =====

  private ensureDirectories(): Effect.Effect<void, FileStorageError> {
    return pipe(
      Effect.tryPromise({
        try: async () => {
          await fs.mkdir(this.metadataPath, { recursive: true })
          await fs.mkdir(this.uploadsPath, { recursive: true })
        },
        catch: (error) => new FileStorageError(
          `Failed to create storage directories: ${error instanceof Error ? error.message : String(error)}`,
          "STORAGE_ERROR",
          error
        )
      })
    )
  }

  private generateFileKey(contentRef: string): Effect.Effect<FileKey, FileStorageError> {
    return pipe(
      Effect.sync(() => {
        // Generate deterministic hash from contentRef
        const hash = crypto.createHash("sha256").update(contentRef).digest("hex")
        // Use first 16 characters for file key
        const shortHash = hash.substring(0, 16)
        return `files/${shortHash}` as FileKey
      })
    )
  }

  private createUploadMetadata(
    metadata: UploadMetadata,
    contentRef: string
  ): Effect.Effect<void, FileStorageError> {
    return pipe(
      Effect.tryPromise({
        try: async () => {
          const metadataFile = path.join(this.metadataPath, `${contentRef}.json`)
          await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2))
        },
        catch: (error) => new FileStorageError(
          `Failed to create upload metadata: ${error instanceof Error ? error.message : String(error)}`,
          "STORAGE_ERROR",
          error
        )
      })
    )
  }

  private loadUploadMetadata(contentRef: string): Effect.Effect<UploadMetadata, FileStorageError> {
    return pipe(
      Effect.tryPromise({
        try: async () => {
          const metadataFile = path.join(this.metadataPath, `${contentRef}.json`)
          const content = await fs.readFile(metadataFile, "utf-8")
          return JSON.parse(content) as UploadMetadata
        },
        catch: (error) => {
          if (error instanceof Error && error.message.includes("ENOENT")) {
            // Don't expose internal contentRef details in client-facing error
            return new FileStorageError(
              "Upload session not found or expired",
              "NOT_FOUND",
              error
            )
          }
          // Sanitized error message - no internal paths
          return new FileStorageError(
            "Failed to load upload metadata",
            "STORAGE_ERROR",
            error
          )
        }
      })
    )
  }


  private getFileStats(filePath: string): Effect.Effect<{ size: number; mimeType: string }, FileStorageError> {
    return pipe(
      Effect.tryPromise({
        try: async () => {
          const stats = await fs.stat(filePath)
          const mimeType = this.detectMimeType(filePath)
          return { size: stats.size, mimeType }
        },
        catch: (error) => new FileStorageError(
          `Failed to get file stats: ${error instanceof Error ? error.message : String(error)}`,
          "STORAGE_ERROR",
          error
        )
      })
    )
  }

  private detectMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase()
    const mimeTypes: Record<string, string> = {
      ".pdf": "application/pdf",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".txt": "text/plain",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }
    return mimeTypes[ext] || "application/octet-stream"
  }

  private cleanupMetadata(contentRef: string): Effect.Effect<void, FileStorageError> {
    return pipe(
      Effect.tryPromise({
        try: async () => {
          const metadataFile = path.join(this.metadataPath, `${contentRef}.json`)
          await fs.unlink(metadataFile)
        },
        catch: (error) => {
          // Ignore cleanup errors (file might not exist)
          return new FileStorageError(
            `Failed to cleanup metadata: ${error instanceof Error ? error.message : String(error)}`,
            "STORAGE_ERROR",
            error
          )
        }
      }),
      Effect.ignore
    )
  }
}

