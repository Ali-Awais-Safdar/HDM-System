import { Effect, Schema as S } from "effect"
import {
  BusinessRuleViolationError,
  ValidationError
} from "@domain/utils/base.errors"

/**
 * Document domain guards for validation.
 * Guards can be used both in schemas and in domain logic.
 */
export class DocumentGuards {
  /**
   * Validates document title - required and max 255 characters.
   * Used in DocumentSchema to ensure data integrity at the schema level.
   */
  static readonly ValidTitle = S.filter(
    (title: string) => {
      if (typeof title !== 'string') return false
      const trimmed = title.trim()
      return trimmed.length > 0 && trimmed.length <= 255
    },
    { message: () => "Title is required and cannot exceed 255 characters" }
  )

  /**
   * Validates document description - optional, max 1000 characters.
   * Used in DocumentSchema for optional description validation.
   */
  static readonly ValidDescription = S.filter(
    (description: string) => {
      return typeof description === 'string' && description.length <= 1000
    },
    { message: () => "Description cannot exceed 1000 characters" }
  )

  /**
   * Validates tag list - max 20 tags, unique, valid format.
   * Used in DocumentSchema for tags validation.
   */
  static readonly ValidTagList = S.filter(
    (tags: readonly string[]) => {
      if (!Array.isArray(tags)) return false
      if (tags.length > 20) return false
      
      // Check all tags are valid
      if (!tags.every(tag => DocumentGuards.isValidTag(tag))) return false
      
      // Check for uniqueness (case-insensitive)
      const normalized = tags.map(tag => tag.trim().toLowerCase())
      return new Set(normalized).size === normalized.length
    },
    { message: () => "Invalid tag list: duplicate tags or too many tags" }
  )

  /**
   * Validates a single tag.
   */
  static isValidTag(tag: string): boolean {
    if (typeof tag !== 'string') return false
    const trimmed = tag.trim()
    return trimmed.length > 0 && trimmed.length <= 50 && /^[a-zA-Z0-9\-_\s]+$/.test(trimmed)
  }

  /**
   * Normalizes a tag by trimming and lowercasing it.
   */
  static normalizeTag(tag: string): string {
    return tag.trim().toLowerCase()
  }

  /**
   * Validates that new tags can be added to the existing list.
   * Returns the merged, normalized, unique tag list.
   */
  static prepareTagsForAddition(
    existingTags: readonly string[],
    candidateTags: readonly string[]
  ): Effect.Effect<readonly string[], ValidationError | BusinessRuleViolationError, never> {
    const normalizedNewTags = candidateTags
      .map(DocumentGuards.normalizeTag)
      .filter((tag) => tag.length > 0)

    if (normalizedNewTags.length === 0) {
      return Effect.fail(
        new BusinessRuleViolationError(
          "INVALID_TAGS",
          "No valid tags provided",
          { candidateTags }
        )
      )
    }

    const uniqueTags = Array.from(
      new Set([...existingTags, ...normalizedNewTags])
    )

    if (!DocumentGuards.isValidTagList(uniqueTags)) {
      return Effect.fail(
        new ValidationError(
          "Invalid tag list: duplicate tags or too many tags",
          "tags",
          uniqueTags
        )
      )
    }

    return Effect.succeed(uniqueTags)
  }

  /**
   * Validates tag removal and returns the remaining tags.
   */
  static prepareTagsForRemoval(
    existingTags: readonly string[],
    tagsToRemove: readonly string[]
  ): Effect.Effect<readonly string[], ValidationError, never> {
    const normalizedRemovals = tagsToRemove.map(DocumentGuards.normalizeTag)
    const remainingTags = existingTags.filter(
      (tag) => !normalizedRemovals.includes(DocumentGuards.normalizeTag(tag))
    )

    if (remainingTags.length > 0 && !DocumentGuards.isValidTagList(remainingTags)) {
      return Effect.fail(
        new ValidationError(
          "Invalid tag list after removal",
          "tags",
          remainingTags
        )
      )
    }

    return Effect.succeed(remainingTags)
  }

  /**
   * Validates document title (standalone function).
   */
  static isValidTitle(title: string): boolean {
    if (typeof title !== 'string') return false
    const trimmed = title.trim()
    return trimmed.length > 0 && trimmed.length <= 255
  }

  /**
   * Validates document description (standalone function).
   */
  static isValidDescription(description: string | undefined): boolean {
    if (description === undefined) return true
    return typeof description === 'string' && description.length <= 1000
  }

  /**
   * Validates tag list (standalone function).
   */
  static isValidTagList(tags: string[]): boolean {
    if (!Array.isArray(tags)) return false
    if (tags.length > 20) return false
    
    // Check all tags are valid
    if (!tags.every(tag => DocumentGuards.isValidTag(tag))) return false
    
    // Check for uniqueness (case-insensitive)
    const normalized = tags.map(tag => tag.trim().toLowerCase())
    return new Set(normalized).size === normalized.length
  }

  /**
   * Validates document version number.
   */
  static isValidVersion(version: number): boolean {
    return typeof version === 'number' && Number.isInteger(version) && version > 0
  }

  /**
   * Validates document checksum (SHA-256).
   */
  static isValidChecksum(checksum: string): boolean {
    if (typeof checksum !== 'string') return false
    const sha256Regex = /^[a-f0-9]{64}$/i
    return sha256Regex.test(checksum)
  }

  /**
   * Validates file size.
   */
  static isValidFileSize(size: number): boolean {
    return typeof size === 'number' && Number.isInteger(size) && size >= 0
  }

  /**
   * Validates MIME type.
   */
  static isValidMimeType(mimeType: string): boolean {
    if (typeof mimeType !== 'string') return false
    return mimeType.includes('/') && !mimeType.endsWith('/')
  }

  /**
   * Validates file key.
   */
  static isValidFileKey(fileKey: string): boolean {
    if (typeof fileKey !== 'string') return false
    return fileKey.trim().length > 0
  }

  /**
   * Checks if document has been modified.
   */
  static isDocumentModified(createdAt: Date, updatedAt: Date | null): boolean {
    if (!updatedAt) return false
    return updatedAt.getTime() > createdAt.getTime()
  }

  /**
   * Compares document versions.
   */
  static isNewerVersion(version1: number, version2: number): boolean {
    return version1 > version2
  }
}

// Export convenience functions for backward compatibility
export const isValidDocumentTitle = (title: string): boolean => DocumentGuards.isValidTitle(title)
export const isValidDocumentDescription = (description: string | undefined): boolean => DocumentGuards.isValidDescription(description)
export const isValidDocumentTag = (tag: string): boolean => DocumentGuards.isValidTag(tag)
export const isValidDocumentTagList = (tags: string[]): boolean => DocumentGuards.isValidTagList(tags)
export const isValidDocumentVersion = (version: number): boolean => DocumentGuards.isValidVersion(version)
export const isValidDocumentChecksum = (checksum: string): boolean => DocumentGuards.isValidChecksum(checksum)
export const isValidDocumentFileSize = (size: number): boolean => DocumentGuards.isValidFileSize(size)
export const isValidDocumentMimeType = (mimeType: string): boolean => DocumentGuards.isValidMimeType(mimeType)
export const isValidDocumentFileKey = (fileKey: string): boolean => DocumentGuards.isValidFileKey(fileKey)
export const isDocumentModified = (createdAt: Date, updatedAt: Date | null): boolean => DocumentGuards.isDocumentModified(createdAt, updatedAt)
export const isNewerDocumentVersion = (version1: number, version2: number): boolean => DocumentGuards.isNewerVersion(version1, version2)
export const isValidDocumentMetadata = (metadata: unknown): boolean => {
  if (metadata === null || metadata === undefined) return true
  if (typeof metadata !== 'object') return false
  return true
}
