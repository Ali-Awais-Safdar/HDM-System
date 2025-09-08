import { z } from "zod";
import { MimeType, FileSize, asMimeType, asFileSize } from "../../shared/types/brand";
import { Result, ok, err } from "../../shared/result/result";

export interface FileUploadData {
  readonly originalName: string;
  readonly mimeType: MimeType;
  readonly size: FileSize;
  readonly data: Buffer;
}

// Constants
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Allowed MIME types for file uploads.
 */
const ALLOWED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/rtf',
  
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  
  // Archives
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  
  // Other
  'application/json',
  'application/xml',
  'text/xml'
] as const;

/**
 * File upload validation schema using Zod for consistent validation.
 */
const fileUploadSchema = z.object({
  originalName: z
    .string()
    .min(1, "File name cannot be empty")
    .max(255, "File name cannot exceed 255 characters"),
  mimeType: z
    .string()
    .min(1, "MIME type is required")
    .refine(
      (type) => ALLOWED_MIME_TYPES.includes(type.toLowerCase() as any),
      { message: "MIME type is not allowed" }
    ),
  size: z
    .number()
    .positive("File size must be positive")
    .max(MAX_FILE_SIZE, `File size cannot exceed ${MAX_FILE_SIZE / 1024 / 1024}MB`),
  data: z
    .instanceof(Buffer)
    .refine(
      (data) => data.length > 0,
      "File data cannot be empty"
    )
});

/**
 * File upload value object with validation rules.
 * Ensures uploaded files meet security and business requirements using Zod schemas.
 */
export class FileUpload {
  private constructor(
    private readonly _originalName: string,
    private readonly _mimeType: MimeType,
    private readonly _size: FileSize,
    private readonly _data: Buffer
  ) {}

  static create(
    originalName: string,
    mimeType: string,
    size: number,
    data: Buffer
  ): Result<FileUpload, Error> {
    // Additional validation for MIME type with custom error message
    if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase() as any)) {
      return err(new Error(`MIME type '${mimeType || 'undefined'}' is not allowed`));
    }

    // Additional validation for size mismatch
    if (data.length !== size) {
      return err(new Error("File size mismatch with actual data length"));
    }

    try {
      const validatedData = fileUploadSchema.parse({
        originalName,
        mimeType,
        size,
        data
      });
      
      return ok(new FileUpload(
        FileUpload.sanitizeFileName(validatedData.originalName),
        asMimeType(validatedData.mimeType),
        asFileSize(validatedData.size),
        validatedData.data
      ));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return err(new Error(error.issues[0]?.message || "Validation error"));
      }
      return err(error as Error);
    }
  }

  private static sanitizeFileName(fileName: string): string {
    // Remove potentially dangerous characters
    const dangerousChars = /[<>:"/\\|?*]/g;
    const controlChars = /[\x00-\x1f]/g; // eslint-disable-line no-control-regex
    
    return fileName
      .trim()
      .replace(dangerousChars, '_') // Replace dangerous chars with underscore
      .replace(controlChars, '_') // Replace control characters
      .replace(/\s+/g, '_') // Replace spaces with underscore
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
  }

  // Getters
  get originalName(): string {
    return this._originalName;
  }

  get mimeType(): MimeType {
    return this._mimeType;
  }

  get size(): FileSize {
    return this._size;
  }

  get data(): Buffer {
    return this._data;
  }

  get sanitizedName(): string {
    return this._originalName;
  }

  get fileExtension(): string {
    const lastDotIndex = this._originalName.lastIndexOf('.');
    return lastDotIndex !== -1 ? this._originalName.substring(lastDotIndex) : '';
  }

  get isImage(): boolean {
    return this._mimeType.startsWith('image/');
  }

  get isDocument(): boolean {
    return this._mimeType.startsWith('application/') || this._mimeType.startsWith('text/');
  }

  toData(): FileUploadData {
    return {
      originalName: this._originalName,
      mimeType: this._mimeType,
      size: this._size,
      data: this._data
    };
  }
}
