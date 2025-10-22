import { DomainError } from "@domain/utils/base.errors"

export class UserNotFoundError extends DomainError {
  readonly _tag = "UserNotFoundError" as const
  readonly code = "USER_NOT_FOUND"
  
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    details?: Record<string, unknown>
  ) {
    super(message, { field, value, ...details })
  }
}

export class UserAlreadyExistsError extends DomainError {
  readonly _tag = "UserAlreadyExistsError" as const
  readonly code = "USER_ALREADY_EXISTS"
  
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    details?: Record<string, unknown>
  ) {
    super(message, { field, value, ...details })
  }
}

export class UserValidationError extends DomainError {
  readonly _tag = "UserValidationError" as const
  readonly code = "USER_VALIDATION_ERROR"
  
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    details?: Record<string, unknown>
  ) {
    super(message, { field, value, ...details })
  }
}

export type UserErrorType =
  | UserNotFoundError
  | UserAlreadyExistsError
  | UserValidationError
