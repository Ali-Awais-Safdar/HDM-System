import { DomainError } from "@domain/utils/base.errors"

/**
 * User-specific domain errors.
 * Provides fine-grained error handling for user-related operations.
 * All errors follow consistent pattern: field, value, optional details.
 */

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

export class UserEmailInvalidError extends DomainError {
  readonly _tag = "UserEmailInvalidError" as const
  readonly code = "USER_EMAIL_INVALID"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Invalid email for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class UserPasswordInvalidError extends DomainError {
  readonly _tag = "UserPasswordInvalidError" as const
  readonly code = "USER_PASSWORD_INVALID"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Invalid password for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class UserRoleInvalidError extends DomainError {
  readonly _tag = "UserRoleInvalidError" as const
  readonly code = "USER_ROLE_INVALID"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Invalid role for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class UserAuthenticationError extends DomainError {
  readonly _tag = "UserAuthenticationError" as const
  readonly code = "USER_AUTHENTICATION_ERROR"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Authentication failed for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class UserAuthorizationError extends DomainError {
  readonly _tag = "UserAuthorizationError" as const
  readonly code = "USER_AUTHORIZATION_ERROR"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Authorization failed for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

// Union type for all user errors
export type UserErrorType =
  | UserNotFoundError
  | UserAlreadyExistsError
  | UserValidationError
  | UserEmailInvalidError
  | UserPasswordInvalidError
  | UserRoleInvalidError
  | UserAuthenticationError
  | UserAuthorizationError
