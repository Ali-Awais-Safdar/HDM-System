import { DatabaseError } from "@domain/utils/base.errors"

export const isDatabaseError = (error: unknown): error is Error => {
  return error instanceof Error
}

export const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error)
}

export const isUniqueConstraintError = (error: unknown): boolean => {
  const message = getErrorMessage(error)
  return message.toLowerCase().includes('unique') || 
         message.toLowerCase().includes('duplicate') ||
         message.toLowerCase().includes('constraint')
}

export const isForeignKeyError = (error: unknown): boolean => {
  const message = getErrorMessage(error)
  return message.toLowerCase().includes('foreign key') ||
         message.toLowerCase().includes('violates foreign key')
}

export const isNotNullError = (error: unknown): boolean => {
  const message = getErrorMessage(error)
  return message.toLowerCase().includes('not null') ||
         message.toLowerCase().includes('violates not-null')
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

export const translateDbError = <TConflictError, TNotFoundError, TValidationError>(
  error: unknown,
  context: {
    operation: string
    entityType: string
    entityId?: string
  },
  creators: {
    createConflictError: (message: string) => TConflictError
    createNotFoundError: (field: string, value: string, details?: string) => TNotFoundError
    createValidationError: (message: string, field: string, value: string) => TValidationError
  }
): TConflictError | TNotFoundError | TValidationError | DatabaseError => {
  // Unique constraint violations → Conflict errors
  if (isUniqueConstraintError(error)) {
    const constraint = extractConstraintName(error)
    return creators.createConflictError(
      `${context.entityType} already exists${constraint ? ` (constraint: ${constraint})` : ''}`
    )
  }
  
  // Foreign key violations → Validation errors (referential integrity)
  if (isForeignKeyError(error)) {
    const constraint = extractConstraintName(error)
    return creators.createValidationError(
      `Foreign key constraint violation${constraint ? ` (${constraint})` : ''}`,
      "foreignKey",
      constraint || "unknown"
    )
  }
  
  // Not-null violations → Validation errors
  if (isNotNullError(error)) {
    return creators.createValidationError(
      "Required field missing",
      "notNull",
      "null"
    )
  }
  
  // Unexpected database errors → DatabaseError with diagnostics
  const constraint = extractConstraintName(error)
  const table = extractTableName(error)
  const code = (error as any)?.code
  
  return new DatabaseError(
    `Database error during ${context.operation} on ${context.entityType}`,
    {
      ...(code !== undefined && { code }),
      ...(constraint !== undefined && { constraint }),
      ...(table !== undefined && { table }),
      originalError: error
    }
  )
}

export const translateQueryError = <TNotFoundError>(
  error: unknown,
  context: {
    operation: string
    entityType: string
    field: string
    value: string
  },
  createNotFoundError: (message: string, field?: string, value?: unknown, details?: Record<string, unknown>) => TNotFoundError
): TNotFoundError | DatabaseError => {
  // Suppress unused parameter warnings - field and value provide context for error messages  
  void context.field
  void context.value
  

  // Use translateDbError to properly categorize the error
  return translateDbError(
    error,
    { operation: context.operation, entityType: context.entityType },
    {
      // Constraint violations in queries are infrastructure issues
      createConflictError: (message) => new DatabaseError(message),
      // Let caller decide if empty result is NotFoundError
      createNotFoundError: (field, value, details) => createNotFoundError(
        `Database error during ${context.operation} on ${context.entityType}: ${field}=${value}`,
        field,
        value,
        details ? { details } : undefined
      ),
      // Validation errors in queries are infrastructure issues
      createValidationError: (message, field) =>
        new DatabaseError(message, { constraint: field })
    }
  )
}

