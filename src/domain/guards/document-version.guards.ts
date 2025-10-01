/**
 * DocumentVersion-specific guards for domain validation.
 */

/**
 * Validates version number (must be a positive integer).
 */
export const isValidVersionNumber = (version: number): boolean => {
  return typeof version === 'number' && 
         Number.isInteger(version) && 
         version > 0 && 
         Number.isFinite(version)
}

/**
 * Validates version number is sequential (next version).
 */
export const isSequentialVersion = (currentVersion: number, newVersion: number): boolean => {
  return isValidVersionNumber(currentVersion) && 
         isValidVersionNumber(newVersion) && 
         newVersion === currentVersion + 1
}

/**
 * Validates file checksum format (SHA-256).
 */
export const isValidChecksum = (checksum: string): boolean => {
  if (typeof checksum !== 'string') return false
  const sha256Regex = /^[a-f0-9]{64}$/i
  return sha256Regex.test(checksum)
}

/**
 * Validates file size (must be positive and within limits).
 */
export const isValidFileSize = (size: number, maxSize: number = 50 * 1024 * 1024): boolean => {
  return typeof size === 'number' && 
         Number.isInteger(size) && 
         size > 0 && 
         size <= maxSize && 
         Number.isFinite(size)
}

/**
 * Validates MIME type format.
 */
export const isValidMimeType = (mimeType: string): boolean => {
  if (typeof mimeType !== 'string') return false
  return mimeType.includes('/') && !mimeType.endsWith('/')
}

/**
 * Validates file key format (storage path).
 */
export const isValidFileKey = (fileKey: string): boolean => {
  if (typeof fileKey !== 'string') return false
  const trimmed = fileKey.trim()
  return trimmed.length > 0 && trimmed.length <= 1024
}

/**
 * Checks if version is newer than another.
 */
export const isNewerVersion = (version: number, olderVersion: number): boolean => {
  return isValidVersionNumber(version) && 
         isValidVersionNumber(olderVersion) && 
         version > olderVersion
}

/**
 * Checks if version is the first version.
 */
export const isFirstVersion = (version: number): boolean => {
  return version === 1
}

/**
 * Validates version creation date.
 */
export const isValidVersionCreationDate = (createdAt: Date): boolean => {
  if (!(createdAt instanceof Date)) return false
  if (isNaN(createdAt.getTime())) return false
  // Version must be created in the past or now
  return createdAt.getTime() <= Date.now()
}

/**
 * Checks if two versions belong to the same document.
 */
export const isSameDocument = (documentId1: string, documentId2: string): boolean => {
  return typeof documentId1 === 'string' && 
         typeof documentId2 === 'string' && 
         documentId1 === documentId2
}

/**
 * Validates version gap (versions should be continuous).
 */
export const hasValidVersionGap = (version1: number, version2: number): boolean => {
  if (!isValidVersionNumber(version1) || !isValidVersionNumber(version2)) return false
  const gap = Math.abs(version2 - version1)
  return gap === 1 // Versions should be continuous
}

