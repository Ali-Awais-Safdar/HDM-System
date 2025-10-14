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

export type DomainErrorType = 
  | ValidationError
  | BusinessRuleViolationError