import { DomainError } from "@domain/utils/domain.errors"

/**
 * User-specific domain errors.
 */

export class UserNotFoundError extends DomainError {
  readonly _tag = "UserNotFoundError" as const
  readonly code = "USER_NOT_FOUND"
  
  constructor(
    public readonly userId: string,
    details?: Record<string, unknown>
  ) {
    super(`User with id '${userId}' not found`, { userId, ...details })
  }
}

export class UserAlreadyExistsError extends DomainError {
  readonly _tag = "UserAlreadyExistsError" as const
  readonly code = "USER_ALREADY_EXISTS"
  
  constructor(
    public readonly email: string,
    details?: Record<string, unknown>
  ) {
    super(`User with email '${email}' already exists`, { email, ...details })
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

export class UserEmailInvalidError extends DomainError {
  readonly _tag = "UserEmailInvalidError" as const
  readonly code = "USER_EMAIL_INVALID"
  
  constructor(
    public readonly email: string,
    details?: Record<string, unknown>
  ) {
    super(`Invalid email address: '${email}'`, { email, ...details })
  }
}

export class UserPasswordInvalidError extends DomainError {
  readonly _tag = "UserPasswordInvalidError" as const
  readonly code = "USER_PASSWORD_INVALID"
  
  constructor(
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message, details)
  }
}

export class UserRoleInvalidError extends DomainError {
  readonly _tag = "UserRoleInvalidError" as const
  readonly code = "USER_ROLE_INVALID"
  
  constructor(
    public readonly role: string,
    details?: Record<string, unknown>
  ) {
    super(`Invalid user role: '${role}'`, { role, ...details })
  }
}

export class UserAuthenticationError extends DomainError {
  readonly _tag = "UserAuthenticationError" as const
  readonly code = "USER_AUTHENTICATION_ERROR"
  
  constructor(
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message, details)
  }
}

export class UserAuthorizationError extends DomainError {
  readonly _tag = "UserAuthorizationError" as const
  readonly code = "USER_AUTHORIZATION_ERROR"
  
  constructor(
    message: string,
    public readonly userId: string,
    public readonly action: string,
    details?: Record<string, unknown>
  ) {
    super(message, { userId, action, ...details })
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
