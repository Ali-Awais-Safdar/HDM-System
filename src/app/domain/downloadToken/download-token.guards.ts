import { Schema as S } from "effect"

/**
 * DownloadToken validation guards.
 * Centralizes validation logic for download token operations.
 * Provides both schema-integrated guards and standalone validation functions.
 */
export class DownloadTokenGuards {
  /**
   * Validates that a token string is properly formatted.
   * Used in DownloadToken schema to ensure data integrity at the schema level.
   */
  static readonly ValidToken = S.filter(
    (token: string) => {
      // Token should be URL-safe base64 without padding
      const urlSafeBase64Regex = /^[A-Za-z0-9_-]+$/
      return typeof token === 'string' && 
             token.length >= 32 && 
             token.length <= 64 && 
             urlSafeBase64Regex.test(token)
    },
    { message: () => "Token must be a valid URL-safe base64 string between 32-64 characters" }
  )

  /**
   * Validates that an expiry date is in the future.
   * Used in DownloadToken schema to ensure data integrity at the schema level.
   */
  static readonly ValidExpiryDate = S.filter(
    (date: Date) => {
      const now = new Date()
      const maxFuture = new Date(now.getTime() + 24 * 60 * 60 * 1000) // Max 24 hours in future
      return date > now && date <= maxFuture
    },
    { message: () => "Expiry date must be in the future but not more than 24 hours ahead" }
  )

  /**
   * Validates that a used date is not in the future.
   * Used in DownloadToken schema to ensure data integrity at the schema level.
   */
  static readonly ValidUsedDate = S.filter(
    (date: Date) => {
      const now = new Date()
      const maxPast = new Date(now.getTime() - 24 * 60 * 60 * 1000) // Max 24 hours in past
      return date <= now && date >= maxPast
    },
    { message: () => "Used date cannot be in the future or more than 24 hours in the past" }
  )

  // ========== Standalone Validation Functions ==========
  // These functions are used for imperative validation in domain logic

  /**
   * Validates a token string format.
   */
  static isValidToken(token: string): boolean {
    const urlSafeBase64Regex = /^[A-Za-z0-9_-]+$/
    return typeof token === 'string' && 
           token.length >= 32 && 
           token.length <= 64 && 
           urlSafeBase64Regex.test(token)
  }

  /**
   * Validates that a date is in the future.
   */
  static isFutureDate(date: Date): boolean {
    return date > new Date()
  }

  /**
   * Validates that a date is not in the future.
   */
  static isNotFutureDate(date: Date): boolean {
    return date <= new Date()
  }

  /**
   * Validates that an expiry date is reasonable (not too far in future).
   */
  static isReasonableExpiryDate(date: Date): boolean {
    const now = new Date()
    const maxFuture = new Date(now.getTime() + 24 * 60 * 60 * 1000) // Max 24 hours
    return date > now && date <= maxFuture
  }

  /**
   * Validates that a used date is reasonable (not too far in past).
   */
  static isReasonableUsedDate(date: Date): boolean {
    const now = new Date()
    const maxPast = new Date(now.getTime() - 24 * 60 * 60 * 1000) // Max 24 hours
    return date <= now && date >= maxPast
  }

  /**
   * Validates that a token is not expired.
   */
  static isNotExpired(expiresAt: Date, clockSkewToleranceMs: number = 0): boolean {
    const now = new Date()
    const adjustedExpiryTime = new Date(expiresAt.getTime() + clockSkewToleranceMs)
    return now <= adjustedExpiryTime
  }

  /**
   * Validates that a token has been used.
   */
  static isUsed(usedAt: Date | null | undefined): boolean {
    return usedAt != null
  }

  /**
   * Validates that a token belongs to a specific user.
   */
  static belongsToUser(issuedTo: string, userId: string): boolean {
    return issuedTo === userId
  }

  /**
   * Validates that a token is valid for use (not expired and not used).
   */
  static isValidForUse(
    expiresAt: Date, 
    usedAt: Date | null | undefined, 
    clockSkewToleranceMs: number = 0
  ): boolean {
    return this.isNotExpired(expiresAt, clockSkewToleranceMs) && !this.isUsed(usedAt)
  }

  /**
   * Validates that a token has sufficient time remaining.
   */
  static hasSufficientTimeRemaining(expiresAt: Date, minMinutesRemaining: number = 1): boolean {
    const now = new Date()
    const timeRemaining = expiresAt.getTime() - now.getTime()
    const minTimeRemaining = minMinutesRemaining * 60 * 1000
    return timeRemaining >= minTimeRemaining
  }
}

// ========== Convenience Exports ==========
// Export individual functions for backward compatibility

export const isValidToken = DownloadTokenGuards.isValidToken
export const isFutureDate = DownloadTokenGuards.isFutureDate
export const isNotFutureDate = DownloadTokenGuards.isNotFutureDate
export const isReasonableExpiryDate = DownloadTokenGuards.isReasonableExpiryDate
export const isReasonableUsedDate = DownloadTokenGuards.isReasonableUsedDate
export const isNotExpired = DownloadTokenGuards.isNotExpired
export const isUsed = DownloadTokenGuards.isUsed
export const belongsToUser = DownloadTokenGuards.belongsToUser
export const isValidForUse = DownloadTokenGuards.isValidForUse
export const hasSufficientTimeRemaining = DownloadTokenGuards.hasSufficientTimeRemaining