import { DomainError } from "@domain/utils/base.errors"

export class AccessPolicyNotFoundError extends DomainError {
  readonly _tag = "AccessPolicyNotFoundError" as const
  readonly code = "ACCESS_POLICY_NOT_FOUND"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Access policy not found for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class AccessPolicyValidationError extends DomainError {
  readonly _tag = "AccessPolicyValidationError" as const
  readonly code = "ACCESS_POLICY_VALIDATION_ERROR"
  
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown
  ) {
    super(message, { field, value })
  }
}

export class AccessPolicyConflictError extends DomainError {
  readonly _tag = "AccessPolicyConflictError" as const
  readonly code = "ACCESS_POLICY_CONFLICT"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Access policy conflict for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}


// Union type for all access policy errors
export type AccessPolicyErrorType =
  | AccessPolicyNotFoundError
  | AccessPolicyValidationError
  | AccessPolicyConflictError
