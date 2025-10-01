export const isValidDocumentTitle = (title: string): boolean => {
  if (typeof title !== 'string') return false
  const trimmed = title.trim()
  return trimmed.length > 0 && trimmed.length <= 255
}

export const isValidDocumentDescription = (description: string | undefined): boolean => {
  if (description === undefined) return true
  return typeof description === 'string' && description.length <= 1000
}

export const isValidDocumentTag = (tag: string): boolean => {
  if (typeof tag !== 'string') return false
  const trimmed = tag.trim()
  return trimmed.length > 0 && trimmed.length <= 50 && /^[a-zA-Z0-9\-_\s]+$/.test(trimmed)
}

export const isValidDocumentTagList = (tags: string[]): boolean => {
  if (!Array.isArray(tags)) return false
  if (tags.length > 20) return false
  
  // Check all tags are valid
  if (!tags.every(isValidDocumentTag)) return false
  
  // Check for uniqueness (case-insensitive)
  const normalized = tags.map(tag => tag.trim().toLowerCase())
  return new Set(normalized).size === normalized.length
}

export const isValidDocumentVersion = (version: number): boolean => {
  return typeof version === 'number' && Number.isInteger(version) && version > 0
}

export const isValidDocumentChecksum = (checksum: string): boolean => {
  if (typeof checksum !== 'string') return false
  const sha256Regex = /^[a-f0-9]{64}$/i
  return sha256Regex.test(checksum)
}

export const isValidDocumentFileSize = (size: number): boolean => {
  return typeof size === 'number' && Number.isInteger(size) && size >= 0
}

export const isValidDocumentMimeType = (mimeType: string): boolean => {
  if (typeof mimeType !== 'string') return false
  return mimeType.includes('/') && !mimeType.endsWith('/')
}

export const isValidDocumentFileKey = (fileKey: string): boolean => {
  if (typeof fileKey !== 'string') return false
  return fileKey.trim().length > 0
}

export const isDocumentModified = (createdAt: Date, updatedAt: Date | null): boolean => {
  if (!updatedAt) return false
  return updatedAt.getTime() > createdAt.getTime()
}

export const isNewerDocumentVersion = (version1: number, version2: number): boolean => {
  return version1 > version2
}

export const isValidDocumentMetadata = (metadata: unknown): boolean => {
  if (metadata === null || metadata === undefined) return true
  if (typeof metadata !== 'object') return false
  return true
}

