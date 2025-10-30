import { Effect, Schema as S } from "effect"
import { BusinessRuleViolationError, ValidationError } from "@domain/utils/base.errors"

const ValidTag = S.String.pipe(
  S.filter((tag) => {
    if (typeof tag !== 'string') return false
    const trimmed = tag.trim()
    return trimmed.length > 0 && trimmed.length <= 50 && /^[a-zA-Z0-9\-_\s]+$/.test(trimmed)
  }, { message: () => "Tag must be 1-50 characters, alphanumeric with hyphens, underscores, or spaces" })
)

const ValidTagList = S.Array(ValidTag).pipe(
  S.filter((tags) => {
    if (!Array.isArray(tags)) return false
    if (tags.length > 20) return false
    
    // Check for uniqueness (case-insensitive)
    const normalized = tags.map(tag => tag.trim().toLowerCase())
    return new Set(normalized).size === normalized.length
  }, { message: () => "Invalid tag list: duplicate tags or too many tags" })
)

export const TagList = ValidTagList
export type TagList = S.Schema.Type<typeof TagList>

// Helper functions for tag operations
const normalizeTag = (tag: string): string => tag.trim().toLowerCase()

export const addTags = (
  existing: readonly string[],
  toAdd: readonly string[]
): Effect.Effect<readonly string[], ValidationError | BusinessRuleViolationError> => {
  const normalizedNewTags = toAdd
    .map(normalizeTag)
    .filter((tag) => tag.length > 0)

  if (normalizedNewTags.length === 0) {
    return Effect.fail(
      new BusinessRuleViolationError(
        "INVALID_TAGS",
        "No valid tags provided",
        { candidateTags: toAdd }
      )
    )
  }

  const uniqueTags = Array.from(
    new Set([...existing, ...normalizedNewTags])
  )

  // Use schema validation as single source of truth
  return S.decodeUnknown(TagList)(uniqueTags).pipe(
    Effect.mapError(() => new ValidationError(
      "Invalid tag list: duplicate tags or too many tags",
      "tags",
      uniqueTags
    ))
  )
}

export const removeTags = (
  existing: readonly string[],
  toRemove: readonly string[]
): Effect.Effect<readonly string[], ValidationError> => {
  if (toRemove.length === 0) {
    return Effect.succeed(existing)
  }
  const normalizedRemovals = toRemove.map(normalizeTag)
  const remainingTags = existing.filter(
    (tag) => !normalizedRemovals.includes(normalizeTag(tag))
  )

  // Use schema validation as single source of truth
  return S.decodeUnknown(TagList)(remainingTags).pipe(
    Effect.mapError(() => new ValidationError(
      "Invalid tag list after removal",
      "tags",
      remainingTags
    ))
  )
}


