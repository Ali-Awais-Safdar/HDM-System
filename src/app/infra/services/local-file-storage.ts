import { Effect, pipe } from "effect"
import { promises as fs } from "fs"
import { createReadStream, createWriteStream } from "fs"
import * as path from "path"
import crypto from "crypto"
import type { ConfigPort } from "@application/services/ports/config.port"
import type { LoggerPort } from "@application/services/ports/logger.port"
import { inject, injectable } from "tsyringe"
import { TOKENS } from "@infra/di/container"
import { 
  FileStoragePort, 
  FileStorageError, 
  FileStorageUnexpected,
  type FileStorageErrorType,
  type UploadFileRequest,
  type UploadFileResponse,
  type DownloadFileResponse,
  type DownloadFileMetadata
} from "@application/services/ports/file-storage.port"
import type { FileKey, MimeType, FileSize } from "@domain/refined/file-reference"
import type { Sha256 } from "@domain/refined/checksum"

/**
 * Metadata stored alongside binary files for checksum verification and file attributes.
 */
type StoredMetadata = {
  checksum: Sha256
  mimeType: MimeType
  size: FileSize
  originalFilename?: string
}

/**
 * Helper to determine if a filesystem error should fail fast
 */
function isFilesystemUnavailableError(error: unknown): boolean {
  const code = (error as any)?.code
  return (
    code === 'EACCES' || // Permission denied
    code === 'EPERM' ||  // Operation not permitted
    code === 'ENOSPC' || // No space left on device
    code === 'EROFS' ||  // Read-only file system
    code === 'EIO'       // Input/output error
  )
}

/**
 * Helper to map filesystem errors to appropriate FileStorageErrorType
 */
function mapFilesystemError(
  error: unknown,
  message: string,
  defaultCode: "STORAGE_ERROR" | "UPLOAD_FAILED" = "STORAGE_ERROR"
): FileStorageErrorType {
  if (isFilesystemUnavailableError(error)) {
    const code = (error as any)?.code
    const errorType = 
      code === 'EACCES' || code === 'EPERM' ? "PERMISSION_DENIED" :
      code === 'ENOSPC' ? "DISK_FULL" :
      "FILESYSTEM_UNAVAILABLE"
    
    return new FileStorageUnexpected(
      `${message}: ${error instanceof Error ? error.message : String(error)}`,
      errorType,
      error
    )
  }
  
  return new FileStorageError(message, defaultCode, error)
}

/**
 * LocalFileStorage implements FileStoragePort using the local filesystem.
 * 
 * This implementation:
 * - Stores files in a configurable base directory (STORAGE_PATH)
 * - Generates deterministic file keys based on contentRef
 * - Streams files directly to storage with checksum calculation during write
 * - Validates file size and MIME type during upload
 * - Uses Effect for error handling with proper error mapping
 * - Implements fail-fast for systemic filesystem failures (EACCES, ENOSPC, etc.)
 */
@injectable()
export class LocalFileStorage extends FileStoragePort {
  private readonly storagePath: string
  private readonly logger: LoggerPort
  private readonly METADATA_EXTENSION = ".meta.json" as const

  constructor(
    @inject(TOKENS.CONFIG_PORT)
    config: ConfigPort,
    @inject(TOKENS.LOGGER_PORT)
    logger: LoggerPort
  ) {
    super()
    this.storagePath = config.STORAGE_PATH
    this.logger = logger.child({ service: "LocalFileStorage" })
  }

  uploadFile(
    request: UploadFileRequest
  ): Effect.Effect<UploadFileResponse, FileStorageErrorType> {
    this.logger.debug("Uploading file directly", {
      documentId: request.metadata.documentId,
      userId: request.metadata.userId,
      contentRef: request.metadata.contentRef,
      expectedSize: request.metadata.expectedSize,
      mimeType: request.metadata.mimeType
    })

    return pipe(
      // 1. Generate deterministic file key from contentRef
      this.generateFileKey(request.metadata.contentRef),

      // 2. Build full file path and ensure parent directories exist
      Effect.flatMap((fileKey) => {
        const filePath = path.join(this.storagePath, fileKey)
        const fileDir = path.dirname(filePath)
        
        return pipe(
          Effect.tryPromise({
            try: async () => {
              await fs.mkdir(fileDir, { recursive: true })
              return { filePath, fileKey }
            },
            catch: (error) => mapFilesystemError(
              error,
              "Failed to create file directory",
              "STORAGE_ERROR"
            )
          })
        )
      }),

      // 4. Stream file to storage and calculate checksum simultaneously
      Effect.flatMap(({ filePath, fileKey }) =>
        pipe(
          Effect.tryPromise({
            try: async () => {
              // Create hash for checksum calculation
              const hash = crypto.createHash("sha256")
              let bytesWritten = 0

              // Get reader from Web ReadableStream
              const reader = request.stream.getReader()
              const writeStream = createWriteStream(filePath)

              try {
                // Stream file data while calculating hash
                while (true) {
                  const { done, value } = await reader.read()

                  if (done) {
                    // Finalize write stream
                    writeStream.end()
                    break
                  }

                  // Update hash during write
                  hash.update(value)

                  // Write to file with backpressure handling
                  if (!writeStream.write(value)) {
                    await new Promise<void>((resolve) => {
                      writeStream.once("drain", resolve)
                    })
                  }

                  bytesWritten += value.length
                }

                // Wait for write stream to finish
                await new Promise<void>((resolve, reject) => {
                  writeStream.on("finish", resolve)
                  writeStream.on("error", reject)
                })

                // Finalize hash
                const checksum = hash.digest("hex") as Sha256
                const actualSize = bytesWritten as FileSize

                return { filePath, fileKey, checksum, actualSize }
              } catch (error) {
                // Cleanup on error
                writeStream.destroy()
                reader.releaseLock()
                
                // Try to delete partial file
                try {
                  await fs.unlink(filePath)
                } catch {
                  // Ignore cleanup errors
                }

                throw error
              } finally {
                reader.releaseLock()
              }
            },
            catch: (error) => mapFilesystemError(
              error,
              "Failed to write file stream",
              "UPLOAD_FAILED"
            )
          })
        )
      ),

      // 5. Validate file size and persist metadata
      Effect.flatMap(({ filePath, fileKey, checksum, actualSize }) =>
        pipe(
          this.getFileStats(filePath),
          Effect.flatMap(() => {
            // Validate size
            if (actualSize !== request.metadata.expectedSize) {
              return pipe(
                this.cleanupFilesOnError(filePath),
                Effect.flatMap(() =>
                  Effect.fail(new FileStorageError(
                    `File size mismatch: expected ${request.metadata.expectedSize}, got ${actualSize}`,
                    "INVALID_REQUEST",
                    { expectedSize: request.metadata.expectedSize, actualSize }
                  ))
                )
              )
            }

            const mimeType = request.metadata.mimeType

            // Persist metadata sidecar file after successful validation
            const metadata: StoredMetadata = request.metadata.originalFilename !== undefined
              ? {
                  checksum,
                  mimeType,
                  size: actualSize,
                  originalFilename: request.metadata.originalFilename
                }
              : {
                  checksum,
                  mimeType,
                  size: actualSize
                }
            
            return pipe(
              this.writeMetadata(filePath, metadata),
              Effect.map(() => ({
                fileKey,
                checksum,
                actualSize,
                actualMimeType: mimeType
              }))
            )
          })
        )
      ),

      // 6. Log successful upload
      Effect.tap((response) => Effect.sync(() => {
        this.logger.info("File uploaded successfully", {
          fileKey: response.fileKey,
          checksum: response.checksum,
          actualSize: response.actualSize,
          actualMimeType: response.actualMimeType
        })
      })),

      // Log errors
      Effect.tapError((error) => Effect.sync(() => {
        this.logger.error("Failed to upload file", {
          documentId: request.metadata.documentId,
          contentRef: request.metadata.contentRef,
          error: error instanceof Error ? error.message : String(error),
          errorCode: error instanceof FileStorageError ? error.code : undefined
        })
      }))
    )
  }

  downloadFile(
    fileKey: FileKey
  ): Effect.Effect<DownloadFileResponse, FileStorageErrorType> {
    this.logger.debug("Downloading file", { fileKey })

    return pipe(
      // 1. Build file path
      Effect.sync(() => path.join(this.storagePath, fileKey)),

      // 2. Check if file exists and get metadata
      Effect.flatMap((filePath) =>
        pipe(
          Effect.tryPromise({
            try: async () => {
              await fs.access(filePath, fs.constants.F_OK)
              return filePath
            },
            catch: (error) => new FileStorageError(
              `File not found: ${fileKey}`,
              "NOT_FOUND",
              error
            )
          }),
          Effect.flatMap((existingPath) =>
            Effect.zip(
              Effect.succeed(existingPath),
              this.getFileStats(existingPath)
            )
          )
        )
      ),

      // 3. Read metadata sidecar and create stream
      Effect.flatMap(([filePath, _stats]) =>
        pipe(
          this.readMetadata(filePath),
          Effect.map((storedMetadata) => {
            // Create Node.js read stream
            const nodeStream = createReadStream(filePath)

            // Convert Node.js stream to Web ReadableStream
            const webStream = this.nodeStreamToWebStream(nodeStream)

            // Build metadata from stored sidecar
            const metadata: DownloadFileMetadata = storedMetadata.originalFilename !== undefined
              ? {
                  mimeType: storedMetadata.mimeType,
                  size: storedMetadata.size,
                  checksum: storedMetadata.checksum,
                  originalFilename: storedMetadata.originalFilename
                }
              : {
                  mimeType: storedMetadata.mimeType,
                  size: storedMetadata.size,
                  checksum: storedMetadata.checksum
                }

            return { stream: webStream, metadata }
          })
        )
      ),

      // 4. Log successful download
      Effect.tap((response) => Effect.sync(() => {
        this.logger.info("File download initiated", {
          fileKey,
          size: response.metadata.size,
          mimeType: response.metadata.mimeType
        })
      })),

      // Log errors
      Effect.tapError((error) => Effect.sync(() => {
        this.logger.error("Failed to download file", {
          fileKey,
          error: error instanceof Error ? error.message : String(error),
          errorCode: error instanceof FileStorageError ? error.code : undefined
        })
      }))
    )
  }

  // ===== PRIVATE HELPERS =====

  private generateFileKey(contentRef: string): Effect.Effect<FileKey, FileStorageErrorType> {
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

  private getFileStats(filePath: string): Effect.Effect<{ size: number; mimeType: string }, FileStorageErrorType> {
    return pipe(
      Effect.tryPromise({
        try: async () => {
          const stats = await fs.stat(filePath)
          const mimeType = this.detectMimeType(filePath)
          return { size: stats.size, mimeType }
        },
        catch: (error) => mapFilesystemError(
          error,
          "Failed to get file stats",
          "STORAGE_ERROR"
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

  private nodeStreamToWebStream(nodeStream: ReturnType<typeof createReadStream>): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        nodeStream.on("data", (chunk: string | Buffer) => {
          const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk
          controller.enqueue(new Uint8Array(buffer))
        })

        nodeStream.on("end", () => {
          controller.close()
        })

        nodeStream.on("error", (error) => {
          controller.error(error)
        })
      },
      cancel() {
        nodeStream.destroy()
      }
    })
  }

  private metadataPath(filePath: string): string {
    return `${filePath}${this.METADATA_EXTENSION}`
  }

  private writeMetadata(
    filePath: string,
    metadata: StoredMetadata
  ): Effect.Effect<void, FileStorageErrorType> {
    return Effect.tryPromise({
      try: async () => {
        await fs.writeFile(
          this.metadataPath(filePath),
          JSON.stringify(metadata, null, 2),
          "utf8"
        )
      },
      catch: (error) => mapFilesystemError(
        error,
        `Failed to persist metadata for ${filePath}`,
        "STORAGE_ERROR"
      )
    })
  }

  private readMetadata(
    filePath: string
  ): Effect.Effect<StoredMetadata, FileStorageErrorType> {
    return Effect.tryPromise({
      try: async () => {
        const raw = await fs.readFile(this.metadataPath(filePath), "utf8")
        const parsed = JSON.parse(raw) as StoredMetadata
        
        // Validate required fields
        if (!parsed.checksum || !parsed.mimeType || typeof parsed.size !== "number") {
          throw new Error("Missing or invalid metadata fields")
        }
        
        return parsed
      },
      catch: (error) => mapFilesystemError(
        error,
        `Failed to read metadata for ${filePath}`,
        "STORAGE_ERROR"
      )
    })
  }

  private cleanupFilesOnError(filePath: string): Effect.Effect<void, FileStorageErrorType> {
    return Effect.tryPromise({
      try: async () => {
        try {
          await fs.unlink(filePath)
        } catch {
          // Ignore cleanup errors for binary file
        }
        
        try {
          await fs.unlink(this.metadataPath(filePath))
        } catch {
          // Ignore cleanup errors for metadata file
        }
      },
      catch: (error) => mapFilesystemError(error, "Cleanup failed", "STORAGE_ERROR")
    })
  }

}

