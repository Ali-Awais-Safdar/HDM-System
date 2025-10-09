import { Schema as S } from "effect"

/**
 * All domain errors should extend this class for consistent error handling.
 */
export abstract class DomainError extends Error {
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

/**
 * Validation error for schema validation failures.
 */
export class ValidationError extends DomainError {
  readonly _tag = "ValidationError" as const
  readonly code = "VALIDATION_ERROR"
  
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    details?: Record<string, unknown>
  ) {
    super(message, { field, value, ...details })
  }
}

/**
 * Entity not found error.
 */
export class NotFoundError extends DomainError {
  readonly _tag = "NotFoundError" as const
  readonly code = "NOT_FOUND"

  constructor(
    resource: string,
    public readonly identifier?: string,
    details?: Record<string, unknown>
  ) {
    super(
      identifier ? `${resource} '${identifier}' not found` : `${resource} not found`,
      { resource, identifier, ...details }
    )
  }
}

/**
 * Entity not found error.
 * Extends NotFoundError with entity-specific semantics.
 */
export class EntityNotFoundError extends NotFoundError {
  constructor(
    entityType: string,
    public readonly id: string,
    details?: Record<string, unknown>
  ) {
    super(entityType, id, { entityType, id, ...details })
  }
}

/**
 * Already exists error for duplicate entities.
 */
export class AlreadyExistsError extends DomainError {
  readonly _tag = "AlreadyExistsError" as const
  readonly code = "ALREADY_EXISTS"

  constructor(
    resource: string,
    public readonly identifier?: string,
    details?: Record<string, unknown>
  ) {
    super(
      identifier
        ? `${resource} '${identifier}' already exists`
        : `${resource} already exists`,
      { resource, identifier, ...details }
    )
  }
}

/**
 * Business rule violation error.
 */
export class BusinessRuleViolationError extends DomainError {
  readonly _tag = "BusinessRuleViolationError" as const
  readonly code = "BUSINESS_RULE_VIOLATION"
  
  constructor(
    rule: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message, { rule, ...details })
  }
}

/**
 * Permission denied error.
 */
export class PermissionDeniedError extends DomainError {
  readonly _tag = "PermissionDeniedError" as const
  readonly code = "PERMISSION_DENIED"
  
  constructor(
    action: string,
    resource: string,
    details?: Record<string, unknown>
  ) {
    super(`Permission denied for action '${action}' on resource '${resource}'`, 
      { action, resource, ...details })
  }
}

/**
 * Conflict error for when operations cannot be completed due to state conflicts.
 */
export class ConflictError extends DomainError {
  readonly _tag = "ConflictError" as const
  readonly code = "CONFLICT"
  
  constructor(
    message: string,
    public readonly conflictingField?: string,
    details?: Record<string, unknown>
  ) {
    super(message, { conflictingField, ...details })
  }
}

// Union type for common/base domain errors
export type DomainErrorType = 
  | ValidationError
  | NotFoundError
  | EntityNotFoundError
  | AlreadyExistsError
  | BusinessRuleViolationError
  | PermissionDeniedError
  | ConflictError

// Schema for domain errors (useful for serialization)
export const DomainErrorSchema = S.Union(
  S.Struct({
    _tag: S.Literal("ValidationError"),
    code: S.Literal("VALIDATION_ERROR"),
    message: S.String,
    field: S.optional(S.String),
    value: S.optional(S.Unknown),
    details: S.optional(S.Record({ key: S.String, value: S.Unknown }))
  }),
  S.Struct({
    _tag: S.Literal("NotFoundError"),
    code: S.Literal("NOT_FOUND"),
    message: S.String,
    resource: S.String,
    identifier: S.optional(S.String),
    details: S.optional(S.Record({ key: S.String, value: S.Unknown }))
  }),
  S.Struct({
    _tag: S.Literal("EntityNotFoundError"),
    code: S.Literal("ENTITY_NOT_FOUND"),
    message: S.String,
    entityType: S.String,
    id: S.String,
    details: S.optional(S.Record({ key: S.String, value: S.Unknown }))
  }),
  S.Struct({
    _tag: S.Literal("AlreadyExistsError"),
    code: S.Literal("ALREADY_EXISTS"),
    message: S.String,
    resource: S.String,
    identifier: S.optional(S.String),
    details: S.optional(S.Record({ key: S.String, value: S.Unknown }))
  }),
  S.Struct({
    _tag: S.Literal("BusinessRuleViolationError"),
    code: S.Literal("BUSINESS_RULE_VIOLATION"),
    message: S.String,
    rule: S.String,
    details: S.optional(S.Record({ key: S.String, value: S.Unknown }))
  }),
  S.Struct({
    _tag: S.Literal("PermissionDeniedError"),
    code: S.Literal("PERMISSION_DENIED"),
    message: S.String,
    action: S.String,
    resource: S.String,
    details: S.optional(S.Record({ key: S.String, value: S.Unknown }))
  }),
  S.Struct({
    _tag: S.Literal("ConflictError"),
    code: S.Literal("CONFLICT"),
    message: S.String,
    conflictingField: S.optional(S.String),
    details: S.optional(S.Record({ key: S.String, value: S.Unknown }))
  })
)
