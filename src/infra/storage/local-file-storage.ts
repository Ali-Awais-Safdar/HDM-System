import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { Effect } from "effect"
import { FileStoragePort, FileStorageError } from "../../domain/ports/file-storage.port"
import { env } from "../../env/env"
import { createServiceLogger } from "../../shared/logging/logger"

/**
 * Local file system implementation of FileStoragePort.
 */
export class LocalFileStorage extends FileStoragePort {
  private readonly logger = createServiceLogger('LocalFileStorage')
  
  constructor(private readonly baseDirectory: string = env.STORAGE_PATH) {
    super()
  }

  store(key: string, data: Buffer): Effect.Effect<string, FileStorageError> {
    return Effect.tryPromise({
      try: async () => {
        const fullPath = join(this.baseDirectory, key)
        const directory = dirname(fullPath)

        this.logger.debug({ 
          key, 
          fullPath, 
          size: data.length 
        }, "Storing file")

        await fs.mkdir(directory, { recursive: true })
        await fs.writeFile(fullPath, data)

        this.logger.info({ 
          key, 
          fullPath, 
          size: data.length 
        }, "File stored successfully")

        return fullPath
      },
      catch: (error) => {
        this.logger.error({ 
          key, 
          error: error instanceof Error ? error.message : 'Unknown error'
        }, "Failed to store file")
        
        return new FileStorageError(
          `Failed to store file: ${error instanceof Error ? error.message : 'Unknown error'}`,
          "STORAGE_ERROR",
          error
        )
      }
    })
  }

  retrieve(key: string): Effect.Effect<Buffer, FileStorageError> {
    return Effect.tryPromise({
      try: async () => {
        const fullPath = join(this.baseDirectory, key)
        return await fs.readFile(fullPath)
      },
      catch: (error) => {
        const code = error instanceof Error && 'code' in error && error.code === 'ENOENT' 
          ? "NOT_FOUND" as const
          : "STORAGE_ERROR" as const
          
        return new FileStorageError(
          code === "NOT_FOUND" 
            ? 'File not found' 
            : `Failed to retrieve file: ${error instanceof Error ? error.message : 'Unknown error'}`,
          code,
          error
        )
      }
    })
  }

  delete(key: string): Effect.Effect<void, FileStorageError> {
    return Effect.tryPromise({
      try: async () => {
        const fullPath = join(this.baseDirectory, key)
        try {
          await fs.unlink(fullPath)
        } catch (error) {
          // If file doesn't exist, consider it successfully deleted
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return
          }
          throw error
        }
      },
      catch: (error) => {
        return new FileStorageError(
          `Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`,
          "STORAGE_ERROR",
          error
        )
      }
    })
  }

  exists(key: string): Effect.Effect<boolean, FileStorageError> {
    return Effect.tryPromise({
      try: async () => {
        const fullPath = join(this.baseDirectory, key)
        try {
          await fs.access(fullPath)
          return true
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return false
          }
          throw error
        }
      },
      catch: (error) => {
        return new FileStorageError(
          `Failed to check file existence: ${error instanceof Error ? error.message : 'Unknown error'}`,
          "STORAGE_ERROR",
          error
        )
      }
    })
  }

  // Helper methods (not part of the port interface)
  
  getFullPath(key: string): string {
    return join(this.baseDirectory, key)
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.baseDirectory, { recursive: true })
    } catch (error) {
      throw new Error(`Failed to initialize storage directory: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async getStats(key: string): Promise<{ size: number; createdAt: Date; modifiedAt: Date }> {
    try {
      const fullPath = join(this.baseDirectory, key)
      const stats = await fs.stat(fullPath)
      
      return {
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new Error('File not found')
      }
      throw new Error(`Failed to get file stats: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
