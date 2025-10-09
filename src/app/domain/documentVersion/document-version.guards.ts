import { Schema as S } from "effect"

/**
 * DocumentVersion validation guards.
 * Centralizes validation logic for document version operations.
 * Provides both schema-integrated guards and standalone validation functions.
 */
export class DocumentVersionGuards {
  /**
   * Validates that a version number is positive.
   * Used in DocumentVersion schema to ensure data integrity at the schema level.
   */
  static readonly ValidVersion = S.filter(
    (version: number) => Number.isInteger(version) && version > 0,
    { message: () => "Version must be a positive integer" }
  )

  /**
   * Validates that a file size is within reasonable bounds.
   * Used in DocumentVersion schema to ensure data integrity at the schema level.
   */
  static readonly ValidFileSize = S.filter(
    (size: number) => size > 0 && size <= 100 * 1024 * 1024, // Max 100MB
    { message: () => "File size must be between 1 byte and 100MB" }
  )

  /**
   * Validates that a MIME type is supported.
   * Used in DocumentVersion schema to ensure data integrity at the schema level.
   */
  static readonly ValidMimeType = S.filter(
    (mimeType: string) => {
      const supportedTypes = [
        'application/pdf',
        'text/plain',
        'text/markdown',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp'
      ]
      return supportedTypes.includes(mimeType)
    },
    { message: () => "MIME type must be supported" }
  )

  /**
   * Validates that a checksum is a valid SHA-256 hash.
   * Used in DocumentVersion schema to ensure data integrity at the schema level.
   */
  static readonly ValidChecksum = S.filter(
    (checksum: string) => /^[a-f0-9]{64}$/i.test(checksum),
    { message: () => "Checksum must be a valid SHA-256 hash" }
  )

  // ========== Standalone Validation Functions ==========
  // These functions are used for imperative validation in domain logic

  /**
   * Validates a version number.
   */
  static isValidVersion(version: number): boolean {
    return Number.isInteger(version) && version > 0
  }

  /**
   * Validates a file size.
   */
  static isValidFileSize(size: number): boolean {
    return size > 0 && size <= 100 * 1024 * 1024 // Max 100MB
  }

  /**
   * Validates a MIME type.
   */
  static isValidMimeType(mimeType: string): boolean {
    const supportedTypes = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp'
    ]
    return supportedTypes.includes(mimeType)
  }

  /**
   * Validates a SHA-256 checksum.
   */
  static isValidChecksum(checksum: string): boolean {
    return /^[a-f0-9]{64}$/i.test(checksum)
  }

  /**
   * Validates that a version is newer than another.
   */
  static isNewerVersion(currentVersion: number, otherVersion: number): boolean {
    return currentVersion > otherVersion
  }

  /**
   * Validates that a version is older than another.
   */
  static isOlderVersion(currentVersion: number, otherVersion: number): boolean {
    return currentVersion < otherVersion
  }

  /**
   * Validates that a version is the first version.
   */
  static isFirstVersion(version: number): boolean {
    return version === 1
  }

  /**
   * Validates that a file size is within a specific range.
   */
  static isFileSizeInRange(size: number, minBytes: number, maxBytes: number): boolean {
    return size >= minBytes && size <= maxBytes
  }

  /**
   * Validates that a MIME type is an image.
   */
  static isImageMimeType(mimeType: string): boolean {
    return mimeType.startsWith('image/')
  }

  /**
   * Validates that a MIME type is a document.
   */
  static isDocumentMimeType(mimeType: string): boolean {
    return mimeType.startsWith('application/') || mimeType.startsWith('text/')
  }
}

// ========== Convenience Exports ==========
// Export individual functions for backward compatibility

export const isValidVersion = DocumentVersionGuards.isValidVersion
export const isValidFileSize = DocumentVersionGuards.isValidFileSize
export const isValidMimeType = DocumentVersionGuards.isValidMimeType
export const isValidChecksum = DocumentVersionGuards.isValidChecksum
export const isNewerVersion = DocumentVersionGuards.isNewerVersion
export const isOlderVersion = DocumentVersionGuards.isOlderVersion
export const isFirstVersion = DocumentVersionGuards.isFirstVersion
export const isFileSizeInRange = DocumentVersionGuards.isFileSizeInRange
export const isImageMimeType = DocumentVersionGuards.isImageMimeType
export const isDocumentMimeType = DocumentVersionGuards.isDocumentMimeType
