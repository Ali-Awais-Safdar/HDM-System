import { Schema as S } from "effect"
import { ValidationError } from "../errors/domain.errors"

/**
 * Centralized domain guards for reusable validation logic.
 * These guards can be used both in schemas and in business logic.
 */

// String validation guards
export const isNonEmptyString = (value: string): boolean => {
  return typeof value === 'string' && value.trim().length > 0
}

export const isValidEmail = (value: string): boolean => {
  if (!isNonEmptyString(value)) return false
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(value) && value.length <= 254
}

export const isValidUuid = (value: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(value)
}

export const isValidPasswordHash = (value: string): boolean => {
  return isNonEmptyString(value) && value.length >= 60 // bcrypt hashes are typically 60+ chars
}

// Number validation guards
export const isPositiveNumber = (value: number): boolean => {
  return typeof value === 'number' && value > 0 && Number.isFinite(value)
}

export const isNonNegativeNumber = (value: number): boolean => {
  return typeof value === 'number' && value >= 0 && Number.isFinite(value)
}

export const isInteger = (value: number): boolean => {
  return Number.isInteger(value)
}

// Date validation guards
export const isValidDate = (value: Date): boolean => {
  return value instanceof Date && !isNaN(value.getTime())
}

export const isFutureDate = (value: Date): boolean => {
  return isValidDate(value) && value.getTime() > Date.now()
}

export const isPastDate = (value: Date): boolean => {
  return isValidDate(value) && value.getTime() < Date.now()
}

// Array validation guards
export const isNonEmptyArray = <T>(value: T[]): boolean => {
  return Array.isArray(value) && value.length > 0
}

export const hasUniqueValues = <T>(value: T[]): boolean => {
  return Array.isArray(value) && new Set(value).size === value.length
}

export const isValidStringArray = (value: string[]): boolean => {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && isNonEmptyString(item))
}

// Tag validation guards
export const isValidTag = (value: string): boolean => {
  if (!isNonEmptyString(value)) return false
  const trimmed = value.trim()
  return trimmed.length <= 50 && /^[a-zA-Z0-9\-_\s]+$/.test(trimmed)
}

export const isValidTagList = (tags: string[]): boolean => {
  if (!Array.isArray(tags)) return false
  if (tags.length > 20) return false
  return tags.every(isValidTag) && hasUniqueValues(tags.map(tag => tag.trim().toLowerCase()))
}

// Document validation guards
export const isValidDocumentTitle = (value: string): boolean => {
  return isNonEmptyString(value) && value.trim().length <= 255
}

export const isValidDocumentDescription = (value: string | undefined): boolean => {
  if (value === undefined) return true
  return typeof value === 'string' && value.length <= 1000
}

// Permission validation guards
export const isValidPermissionLevel = (value: string): boolean => {
  return ['read', 'write', 'admin'].includes(value)
}

export const isValidUserRole = (value: string): boolean => {
  return ['ADMIN', 'USER'].includes(value)
}

// Token validation guards
export const isValidToken = (value: string): boolean => {
  return isNonEmptyString(value) && value.length >= 32
}

// Schema-based guards using Effect Schema
export const isString = (value: unknown): value is string => {
  return S.is(S.String)(value)
}

export const isNumber = (value: unknown): value is number => {
  return S.is(S.Number)(value)
}

export const isBoolean = (value: unknown): value is boolean => {
  return S.is(S.Boolean)(value)
}

export const isDate = (value: unknown): value is Date => {
  return S.is(S.Date)(value)
}

// Composite validation functions
export const validateRequired = <T>(value: T | null | undefined, fieldName: string): T => {
  if (value == null) {
    throw new ValidationError(`${fieldName} is required`, fieldName, value)
  }
  return value
}

export const validateString = (value: unknown, fieldName: string): string => {
  if (!isString(value)) {
    throw new ValidationError(`${fieldName} must be a string`, fieldName, value)
  }
  return value
}

export const validateNonEmptyString = (value: unknown, fieldName: string): string => {
  const str = validateString(value, fieldName)
  if (!isNonEmptyString(str)) {
    throw new ValidationError(`${fieldName} cannot be empty`, fieldName, str)
  }
  return str
}

export const validateEmail = (value: unknown, fieldName: string): string => {
  const str = validateNonEmptyString(value, fieldName)
  if (!isValidEmail(str)) {
    throw new ValidationError(`${fieldName} must be a valid email address`, fieldName, str)
  }
  return str
}

export const validateUuid = (value: unknown, fieldName: string): string => {
  const str = validateString(value, fieldName)
  if (!isValidUuid(str)) {
    throw new ValidationError(`${fieldName} must be a valid UUID`, fieldName, str)
  }
  return str
}

export const validatePositiveNumber = (value: unknown, fieldName: string): number => {
  if (!isNumber(value)) {
    throw new ValidationError(`${fieldName} must be a number`, fieldName, value)
  }
  if (!isPositiveNumber(value)) {
    throw new ValidationError(`${fieldName} must be a positive number`, fieldName, value)
  }
  return value
}

export const validateDate = (value: unknown, fieldName: string): Date => {
  if (!isDate(value)) {
    throw new ValidationError(`${fieldName} must be a valid date`, fieldName, value)
  }
  return value
}

export const validateArray = <T>(value: unknown, fieldName: string, itemValidator?: (item: unknown) => T): T[] => {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array`, fieldName, value)
  }
  if (itemValidator) {
    return value.map((item, index) => {
      try {
        return itemValidator(item)
      } catch {
        throw new ValidationError(`${fieldName}[${index}] is invalid`, `${fieldName}[${index}]`, item)
      }
    })
  }
  return value as T[]
}

export const validateNonEmptyArray = <T>(value: unknown, fieldName: string, itemValidator?: (item: unknown) => T): T[] => {
  const arr = validateArray(value, fieldName, itemValidator)
  if (!isNonEmptyArray(arr)) {
    throw new ValidationError(`${fieldName} cannot be empty`, fieldName, arr)
  }
  return arr
}
