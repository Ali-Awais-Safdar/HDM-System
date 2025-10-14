import { DomainError } from "@domain/utils/base.errors"

export class UserNotFoundError extends DomainError {
  readonly _tag = "UserNotFoundError" as const
  readonly code = "USER_NOT_FOUND"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `User not found for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class UserAlreadyExistsError extends DomainError {
  readonly _tag = "UserAlreadyExistsError" as const
  readonly code = "USER_ALREADY_EXISTS"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `User already exists for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class UserValidationError extends DomainError {
  readonly _tag = "UserValidationError" as const
  readonly code = "USER_VALIDATION_ERROR"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `User validation failed for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export type UserErrorType =
  | UserNotFoundError
  | UserAlreadyExistsError
  | UserValidationError
