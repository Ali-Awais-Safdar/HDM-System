import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { Result, ok, err } from "../../shared/result/result";
import { FileStorage } from "../../domain/services/document.service";
import { env } from "../../env/env";
import { createServiceLogger } from "../../shared/logging/logger";

/**
 * Local file system implementation of file storage.
 * Stores files on the local disk with proper directory structure.
 */
export class LocalFileStorage implements FileStorage {
  private readonly logger = createServiceLogger('LocalFileStorage');
  
  constructor(private readonly baseDirectory: string = env.STORAGE_PATH) {}

  async store(key: string, data: Buffer): Promise<Result<string, Error>> {
    try {
      const fullPath = join(this.baseDirectory, key);
      const directory = dirname(fullPath);

      this.logger.debug({ 
        key, 
        fullPath, 
        size: data.length 
      }, "Storing file");

      // Ensure directory exists
      await fs.mkdir(directory, { recursive: true });

      // Write file
      await fs.writeFile(fullPath, data);

      this.logger.info({ 
        key, 
        fullPath, 
        size: data.length 
      }, "File stored successfully");

      return ok(fullPath);
    } catch (error) {
      this.logger.error({ 
        key, 
        error: error instanceof Error ? error.message : 'Unknown error'
      }, "Failed to store file");
      
      return err(new Error(`Failed to store file: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  async retrieve(key: string): Promise<Result<Buffer, Error>> {
    try {
      const fullPath = join(this.baseDirectory, key);
      const data = await fs.readFile(fullPath);
      return ok(data);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return err(new Error('File not found'));
      }
      return err(new Error(`Failed to retrieve file: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  async delete(key: string): Promise<Result<void, Error>> {
    try {
      const fullPath = join(this.baseDirectory, key);
      await fs.unlink(fullPath);
      return ok(undefined);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // File doesn't exist, consider it successfully deleted
        return ok(undefined);
      }
      return err(new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  async exists(key: string): Promise<Result<boolean, Error>> {
    try {
      const fullPath = join(this.baseDirectory, key);
      await fs.access(fullPath);
      return ok(true);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return ok(false);
      }
      return err(new Error(`Failed to check file existence: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  /**
   * Get the full path for a storage key
   */
  getFullPath(key: string): string {
    return join(this.baseDirectory, key);
  }

  /**
   * Initialize storage directory
   */
  async initialize(): Promise<Result<void, Error>> {
    try {
      await fs.mkdir(this.baseDirectory, { recursive: true });
      return ok(undefined);
    } catch (error) {
      return err(new Error(`Failed to initialize storage directory: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(key: string): Promise<Result<{ size: number; createdAt: Date; modifiedAt: Date }, Error>> {
    try {
      const fullPath = join(this.baseDirectory, key);
      const stats = await fs.stat(fullPath);
      
      return ok({
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return err(new Error('File not found'));
      }
      return err(new Error(`Failed to get file stats: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }
}
