/**
 * DownloadToken-specific guards for domain validation.
 */

/**
 * Validates token string format (minimum length for security).
 */
export const isValidTokenString = (value: string): boolean => {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed.length >= 32 // Minimum 32 characters for cryptographic security
}

/**
 * Validates token expiration date (must be in the future).
 */
export const isValidTokenExpiration = (expiresAt: Date): boolean => {
  if (!(expiresAt instanceof Date)) return false
  if (isNaN(expiresAt.getTime())) return false
  return expiresAt.getTime() > Date.now()
}

/**
 * Validates token expiration with grace period.
 */
export const isValidTokenExpirationWithGrace = (
  expiresAt: Date,
  gracePeriodMs: number = 0
): boolean => {
  if (!(expiresAt instanceof Date)) return false
  if (isNaN(expiresAt.getTime())) return false
  return expiresAt.getTime() + gracePeriodMs > Date.now()
}

/**
 * Checks if token is expired.
 */
export const isTokenExpired = (expiresAt: Date, clockSkewMs: number = 0): boolean => {
  if (!(expiresAt instanceof Date)) return true
  if (isNaN(expiresAt.getTime())) return true
  return Date.now() > expiresAt.getTime() + clockSkewMs
}

/**
 * Checks if used-at date is valid (must be in the past or now).
 */
export const isValidUsedAtDate = (usedAt: Date): boolean => {
  if (!(usedAt instanceof Date)) return false
  if (isNaN(usedAt.getTime())) return false
  return usedAt.getTime() <= Date.now()
}

/**
 * Validates token lifetime duration (in milliseconds).
 */
export const isValidTokenLifetime = (createdAt: Date, expiresAt: Date): boolean => {
  if (!(createdAt instanceof Date) || !(expiresAt instanceof Date)) return false
  if (isNaN(createdAt.getTime()) || isNaN(expiresAt.getTime())) return false
  
  const lifetime = expiresAt.getTime() - createdAt.getTime()
  const maxLifetime = 24 * 60 * 60 * 1000 // 24 hours
  const minLifetime = 60 * 1000 // 1 minute
  
  return lifetime >= minLifetime && lifetime <= maxLifetime
}

/**
 * Checks if token lifetime is reasonable for download tokens (typically 5-30 minutes).
 */
export const isReasonableDownloadTokenLifetime = (createdAt: Date, expiresAt: Date): boolean => {
  if (!(createdAt instanceof Date) || !(expiresAt instanceof Date)) return false
  if (isNaN(createdAt.getTime()) || isNaN(expiresAt.getTime())) return false
  
  const lifetime = expiresAt.getTime() - createdAt.getTime()
  const maxReasonable = 30 * 60 * 1000 // 30 minutes
  const minReasonable = 60 * 1000 // 1 minute
  
  return lifetime >= minReasonable && lifetime <= maxReasonable
}

