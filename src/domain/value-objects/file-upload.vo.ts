import { Schema as S } from "effect"
import { MimeType, FileSize, makeMimeTypeSync, makeFileSizeSync } from "./file-ref.vo"

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
 * File upload validation schema using Effect Schema for consistent validation.
 */
export const FileUploadSchema = S.Struct({
  originalName: S.String.pipe(
    S.filter((s) => s.trim().length > 0, { message: () => "File name cannot be empty" }),
    S.filter((s) => s.length <= 255, { message: () => "File name cannot exceed 255 characters" })
  ),
  mimeType: S.String.pipe(
    S.filter((s) => s.trim().length > 0, { message: () => "MIME type is required" }),
    S.filter((s) => ALLOWED_MIME_TYPES.includes(s.toLowerCase() as any), { message: () => "MIME type is not allowed" })
  ),
  size: S.Number.pipe(
    S.filter((n) => n > 0, { message: () => "File size must be positive" }),
    S.filter((n) => n <= MAX_FILE_SIZE, { message: () => `File size cannot exceed ${MAX_FILE_SIZE / 1024 / 1024}MB` })
  ),
  data: S.instanceOf(Buffer).pipe(
    S.filter((data: Buffer) => data.length > 0, { message: () => "File data cannot be empty" })
  )
})
export type FileUploadSchema = S.Schema.Type<typeof FileUploadSchema>

// Factory function for creating FileUploadSchema from unknown input using Effect pipeline
export const makeFileUploadSchema = (input: unknown) => S.decodeUnknown(FileUploadSchema)(input)

/**
 * File upload value object with validation rules.
 * Ensures uploaded files meet security and business requirements using Effect Schema.
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
  ): FileUpload {
    // Use schema validation instead of throwing errors
    const validatedData = S.decodeUnknownSync(FileUploadSchema)({
      originalName,
      mimeType,
      size,
      data
    });
    
    // Additional validation for size mismatch using schema
    const sizeMismatchSchema = S.Struct({
      size: S.Number,
      dataLength: S.Number
    }).pipe(
      S.filter(
        ({ size, dataLength }) => size === dataLength,
        { message: () => "File size mismatch with actual data length" }
      )
    );
    
    S.decodeUnknownSync(sizeMismatchSchema)({ size: validatedData.size, dataLength: validatedData.data.length });
    
    return new FileUpload(
      FileUpload.sanitizeFileName(validatedData.originalName),
      makeMimeTypeSync(validatedData.mimeType),
      makeFileSizeSync(validatedData.size),
      validatedData.data
    );
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
