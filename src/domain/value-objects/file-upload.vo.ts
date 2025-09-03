import { MimeType, FileSize, asMimeType, asFileSize } from "../../shared/types/brand";

export interface FileUploadData {
  readonly originalName: string;
  readonly mimeType: MimeType;
  readonly size: FileSize;
  readonly data: Buffer;
}

/**
 * File upload value object with validation rules.
 * Ensures uploaded files meet security and business requirements.
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
    FileUpload.validate(originalName, mimeType, size, data);
    
    return new FileUpload(
      FileUpload.sanitizeFileName(originalName),
      asMimeType(mimeType),
      asFileSize(size),
      data
    );
  }

  private static validate(
    originalName: string,
    mimeType: string,
    size: number,
    data: Buffer
  ): void {
    if (!originalName || originalName.trim().length === 0) {
      throw new Error("File name cannot be empty");
    }

    if (originalName.length > 255) {
      throw new Error("File name cannot exceed 255 characters");
    }

    if (!mimeType || mimeType.trim().length === 0) {
      throw new Error("MIME type is required");
    }

    if (!FileUpload.isAllowedMimeType(mimeType)) {
      throw new Error(`MIME type '${mimeType}' is not allowed`);
    }

    if (size <= 0) {
      throw new Error("File size must be positive");
    }

    if (size > FileUpload.MAX_FILE_SIZE) {
      throw new Error(`File size cannot exceed ${FileUpload.MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    if (!data || data.length === 0) {
      throw new Error("File data cannot be empty");
    }

    if (data.length !== size) {
      throw new Error("File size mismatch with actual data length");
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

  private static isAllowedMimeType(mimeType: string): boolean {
    const allowedTypes = [
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
    ];

    return allowedTypes.includes(mimeType.toLowerCase());
  }

  // Constants
  private static readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

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
