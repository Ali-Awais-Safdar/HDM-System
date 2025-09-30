import { Schema as S, Option } from "effect"
import { Document } from "../schema/document.schema"

// Document-specific guards using centralized validation logic
export const isDocumentId = (s: string): boolean => {
  return typeof s === 'string' && s.trim().length > 0
}

export const isValidDocumentTitle = (s: string): boolean => {
  const trimmed = s.trim()
  return trimmed.length > 0 && trimmed.length <= 255
}

export const isValidDocumentDescription = (s: string | undefined): boolean => {
  if (s === undefined) return true
  return s.length <= 1000 // Reasonable limit for descriptions
}

export const isValidTagList = (tags: string[] | undefined): boolean => {
  if (!tags) return true
  if (tags.length > 20) return false
  
  return tags.every(tag => {
    const trimmed = tag.trim()
    return trimmed.length > 0 && 
           trimmed.length <= 50 && 
           /^[a-zA-Z0-9\-_\s]+$/.test(trimmed) // Allow letters, numbers, hyphens, underscores, spaces
  })
}

export const isDocument = (input: unknown): input is Document => S.is(Document)(input)

// Business logic guards
export const isDocumentOwner = (document: Document, userId: string): boolean => {
  return document.ownerId === userId
}

export const hasValidVersion = (document: Document): boolean => {
  return document.currentVersionId !== null && document.currentVersionId !== undefined
}

export const hasDescription = (document: Document): boolean => {
  return document.description !== null && document.description !== undefined
}

export const hasTags = (document: Document): boolean => {
  return Option.isSome(document.tags) && Option.getOrElse(document.tags, () => []).length > 0
}
