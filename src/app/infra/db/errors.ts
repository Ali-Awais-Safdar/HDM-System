import { Effect, Match } from "effect"
import {
  InfraConflict,
  InfraValidation,
  InfraNotFound,
  InfraUnexpected,
  type InfrastructureErrorType
} from "@infra/errors/infrastructure.errors"

// ===== HELPER PREDICATES =====

export const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error)
}

export const getErrorCode = (error: unknown): string | undefined => {
  return (error as any)?.code
}

/**
 * Check if error is a database connection error (fail-fast)
 */
export const isConnectionError = (error: unknown): boolean => {
  const message = getErrorMessage(error).toLowerCase()
  const code = getErrorCode(error)
  
  return (
    message.includes('connection') ||
    message.includes('connect econnrefused') ||
    message.includes('enotfound') ||
    message.includes('etimedout') ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT'
  )
}

/**
 * Check if error is a database timeout error (fail-fast)
 */
export const isTimeoutError = (error: unknown): boolean => {
  const message = getErrorMessage(error).toLowerCase()
  const code = getErrorCode(error)
  
  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    code === 'ETIMEDOUT' ||
    code === '57014' // PostgreSQL query_canceled
  )
}

/**
 * Check if error is a driver bug or unexpected database issue (fail-fast)
 */
export const isDriverBug = (error: unknown): boolean => {
  const message = getErrorMessage(error).toLowerCase()
  
  return (
    message.includes('driver') ||
    message.includes('protocol') ||
    message.includes('unexpected') ||
    message.includes('internal error')
  )
}

/**
 * Check if error is a serialization/deserialization error (fail-fast)
 */
export const isSerializationError = (error: unknown): boolean => {
  const message = getErrorMessage(error).toLowerCase()
  
  return (
    message.includes('serialization') ||
    message.includes('deserialization') ||
    message.includes('parse error') ||
    message.includes('invalid json')
  )
}

/**
 * Check if error is a unique constraint violation (expected)
 */
export const isUniqueConstraintError = (error: unknown): boolean => {
  const message = getErrorMessage(error).toLowerCase()
  const code = getErrorCode(error)
  
  return (
    message.includes('unique') ||
    message.includes('duplicate') ||
    (message.includes('constraint') && message.includes('violat')) ||
    code === '23505' // PostgreSQL unique_violation
  )
}

/**
 * Check if error is a foreign key violation (expected)
 */
export const isForeignKeyError = (error: unknown): boolean => {
  const message = getErrorMessage(error).toLowerCase()
  const code = getErrorCode(error)
  
  return (
    message.includes('foreign key') ||
    message.includes('violates foreign key') ||
    code === '23503' // PostgreSQL foreign_key_violation
  )
}

/**
 * Check if error is a not-null violation (expected)
 */
export const isNotNullError = (error: unknown): boolean => {
  const message = getErrorMessage(error).toLowerCase()
  const code = getErrorCode(error)
  
  return (
    message.includes('not null') ||
    message.includes('violates not-null') ||
    code === '23502' // PostgreSQL not_null_violation
  )
}

/**
 * Check if error is a check constraint violation (expected)
 */
export const isCheckConstraintError = (error: unknown): boolean => {
  const message = getErrorMessage(error).toLowerCase()
  const code = getErrorCode(error)
  
  return (
    message.includes('check constraint') ||
    message.includes('violates check') ||
    code === '23514' // PostgreSQL check_violation
  )
}

/**
 * Check if error indicates entity not found (expected)
 */
export const isNotFoundError = (error: unknown): boolean => {
  const message = getErrorMessage(error).toLowerCase()
  
  return (
    message.includes('not found') ||
    message.includes('does not exist') ||
    message.includes('no such')
  )
}

export const extractConstraintName = (error: unknown): string | undefined => {
  const errorMsg = getErrorMessage(error)
  const match = errorMsg.match(/constraint "([^"]+)"/)
  return match?.[1]
}

export const extractTableName = (error: unknown): string | undefined => {
  const errorMsg = getErrorMessage(error)
  const match = errorMsg.match(/table "([^"]+)"/)
  return match?.[1]
}

export const extractFieldName = (error: unknown): string | undefined => {
  const errorMsg = getErrorMessage(error)
  const match = errorMsg.match(/column "([^"]+)"/)
  return match?.[1]
}

// ===== INFRASTRUCTURE ERROR TRANSLATION =====

/**
 * Translate database errors to infrastructure errors using Effect pattern matching
 * 
 * This function implements fail-fast for unexpected errors:
 * - Connection errors → InfraUnexpected (fail fast)
 * - Timeout errors → InfraUnexpected (fail fast)
 * - Driver bugs → InfraUnexpected (fail fast)
 * - Unique constraint → InfraConflict (expected)
 * - Foreign key violation → InfraValidation (expected)
 * - Not-null violation → InfraValidation (expected)
 * - Not found → InfraNotFound (expected)
 * - Unknown errors → InfraUnexpected (fail fast)
 * 
 * @param error - The unknown error from database operation
 * @param context - Context about the operation (operation, entityType)
 * @returns Effect that fails with appropriate InfrastructureErrorType
 */
export const translateDbError = (
  error: unknown,
  context: {
    readonly operation: string
    readonly entityType: string
    readonly entityId?: string
  }
): Effect.Effect<never, InfrastructureErrorType> => {
  const errorMessage = getErrorMessage(error)
  const errorCode = getErrorCode(error)
  const constraint = extractConstraintName(error)
  const table = extractTableName(error)
  const field = extractFieldName(error)
  
  return Match.value(error).pipe(
    // FAIL FAST: Connection errors (systemic failure)
    Match.when(
      isConnectionError,
      () => Effect.fail(
        new InfraUnexpected(
          `Database connection failed during ${context.operation}`,
          "CONNECTION",
          error,
          {
            operation: context.operation,
            entityType: context.entityType,
            errorCode,
            errorMessage
          }
        )
      )
    ),
    
    // FAIL FAST: Timeout errors (systemic failure)
    Match.when(
      isTimeoutError,
      () => Effect.fail(
        new InfraUnexpected(
          `Database timeout during ${context.operation}`,
          "TIMEOUT",
          error,
          {
            operation: context.operation,
            entityType: context.entityType,
            errorCode,
            errorMessage
          }
        )
      )
    ),
    
    // FAIL FAST: Driver bugs (systemic failure)
    Match.when(
      isDriverBug,
      () => Effect.fail(
        new InfraUnexpected(
          `Database driver error during ${context.operation}`,
          "UNKNOWN",
          error,
          {
            operation: context.operation,
            entityType: context.entityType,
            errorCode,
            errorMessage
    }
  )
      )
    ),
    
    // EXPECTED: Unique constraint violation → Conflict
    Match.when(
      isUniqueConstraintError,
      () => Effect.fail(
        new InfraConflict(
          `${context.entityType} already exists${constraint ? ` (constraint: ${constraint})` : ''}`,
          constraint,
          context.entityType,
          {
            operation: context.operation,
            table,
            field,
            errorCode,
            originalError: errorMessage
          }
        )
      )
    ),
    
    // EXPECTED: Foreign key violation → Validation
    Match.when(
      isForeignKeyError,
      () => Effect.fail(
        new InfraValidation(
          `Foreign key constraint violation${constraint ? ` (${constraint})` : ''}`,
          field || "foreignKey",
          undefined,
          constraint,
          {
            operation: context.operation,
            entityType: context.entityType,
            table,
            errorCode,
            originalError: errorMessage
          }
        )
      )
    ),
    
    // EXPECTED: Not-null violation → Validation
    Match.when(
      isNotNullError,
      () => Effect.fail(
        new InfraValidation(
          `Required field missing${field ? ` (${field})` : ''}`,
          field || "notNull",
          null,
          "NOT_NULL",
          {
            operation: context.operation,
            entityType: context.entityType,
            table,
            errorCode,
            originalError: errorMessage
          }
        )
      )
    ),
    
    // EXPECTED: Not found → InfraNotFound
    Match.when(
      isNotFoundError,
      () => Effect.fail(
        new InfraNotFound(
          `${context.entityType} not found`,
          context.entityType,
          field,
          context.entityId,
          {
            operation: context.operation,
            errorCode,
            originalError: errorMessage
          }
        )
      )
    ),
    
    // FAIL FAST: Unknown errors (unexpected)
    Match.orElse(() =>
      Effect.fail(
        new InfraUnexpected(
          `Unexpected database error during ${context.operation} on ${context.entityType}`,
          "UNKNOWN",
    error,
          {
            operation: context.operation,
            entityType: context.entityType,
            entityId: context.entityId,
            errorCode,
            constraint,
            table,
        field,
            originalError: errorMessage
    }
        )
      )
    )
  )
}

