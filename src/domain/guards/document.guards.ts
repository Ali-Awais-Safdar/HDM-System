import { Schema as S } from "effect"
import { Document } from "../schema/document.schema"

// reusable title guard (can be used outside decode flows)
export const isNonEmptyTitle = (s: string) => S.is(S.String.pipe(S.filter(x => x.trim().length > 0)))(s)

// Additional document-specific guards for common validation scenarios
export const isDocumentId = (s: string) => S.is(S.String.pipe(S.filter(x => x.trim().length > 0)))(s)

export const isValidDocumentTitle = (s: string) => {
  const trimmed = s.trim()
  return trimmed.length > 0 && trimmed.length <= 255
}

export const isValidDocumentDescription = (s: string | undefined) => {
  if (s === undefined) return true
  return s.length <= 1000 // Reasonable limit for descriptions
}

export const isValidTagList = (tags: string[] | undefined) => {
  if (!tags) return true
  if (tags.length > 20) return false
  
  return tags.every(tag => {
    const trimmed = tag.trim()
    return trimmed.length > 0 && 
           trimmed.length <= 50 && 
           /^[a-zA-Z0-9\-_\s]+$/.test(trimmed) // Allow letters, numbers, hyphens, underscores, spaces
  })
}

export const isDocument = (input: unknown) => S.is(Document)(input)
