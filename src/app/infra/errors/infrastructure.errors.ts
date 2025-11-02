/**
 * Infrastructure Layer Error ADT
 * 
 * Defines errors specific to infrastructure concerns (database, storage, etc.)
 * Expected errors are business-rule violations (constraints, validation)
 * Unexpected errors are systemic failures (connection, timeout, etc.)
 */

// Base infrastructure error class
export abstract class InfrastructureError extends Error {
  abstract readonly _tag: string
  abstract readonly code: string

  constructor(
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = this.constructor.name
  }
}

// ===== EXPECTED INFRASTRUCTURE ERRORS =====

/**
 * Infrastructure conflict error (e.g., unique constraint violation)
 * Expected error that represents a business rule violation at the infrastructure level
 */
export class InfraConflict extends InfrastructureError {
  readonly _tag = "InfraConflict" as const
  readonly code = "INFRA_CONFLICT"

  constructor(
    message: string,
    public readonly constraint?: string,
    public readonly entityType?: string,
    details?: Record<string, unknown>
  ) {
    super(message, { constraint, entityType, ...details })
  }
}

/**
 * Infrastructure validation error (e.g., foreign key violation, not null violation)
 * Expected error that represents a validation failure at the infrastructure level
 */
export class InfraValidation extends InfrastructureError {
  readonly _tag = "InfraValidation" as const
  readonly code = "INFRA_VALIDATION"

  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    public readonly constraint?: string,
    details?: Record<string, unknown>
  ) {
    super(message, { field, value, constraint, ...details })
  }
}

/**
 * Infrastructure not found error (e.g., entity not found in database)
 * Expected error that represents a missing resource
 */
export class InfraNotFound extends InfrastructureError {
  readonly _tag = "InfraNotFound" as const
  readonly code = "INFRA_NOT_FOUND"

  constructor(
    message: string,
    public readonly entityType?: string,
    public readonly field?: string,
    public readonly value?: unknown,
    details?: Record<string, unknown>
  ) {
    super(message, { entityType, field, value, ...details })
  }
}

// ===== UNEXPECTED INFRASTRUCTURE ERRORS =====

/**
 * Unexpected infrastructure error (e.g., connection failure, timeout)
 * Systemic failures that should fail fast without wrapping
 */
export class InfraUnexpected extends InfrastructureError {
  readonly _tag = "InfraUnexpected" as const
  readonly code = "INFRA_UNEXPECTED"

  constructor(
    message: string,
    public readonly errorType?: "CONNECTION" | "TIMEOUT" | "UNKNOWN",
    public readonly originalError?: unknown,
    details?: Record<string, unknown>
  ) {
    super(message, { errorType, originalError, ...details })
  }
}

// ===== INFRASTRUCTURE ERROR UNION =====

export type InfrastructureErrorType =
  | InfraConflict
  | InfraValidation
  | InfraNotFound
  | InfraUnexpected

