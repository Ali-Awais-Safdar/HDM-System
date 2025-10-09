import { DomainError } from "@domain/utils/base.errors"

/**
 * AccessPolicy-specific domain errors.
 * Provides fine-grained error handling for access policy operations.
 * All errors follow consistent pattern: field, value, optional details.
 */

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

export class AccessPolicySubjectTypeInvalidError extends DomainError {
  readonly _tag = "AccessPolicySubjectTypeInvalidError" as const
  readonly code = "ACCESS_POLICY_SUBJECT_TYPE_INVALID"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Invalid access policy subject type for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class AccessPolicyActionInvalidError extends DomainError {
  readonly _tag = "AccessPolicyActionInvalidError" as const
  readonly code = "ACCESS_POLICY_ACTION_INVALID"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Invalid access policy action for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class AccessPolicyRoleInvalidError extends DomainError {
  readonly _tag = "AccessPolicyRoleInvalidError" as const
  readonly code = "ACCESS_POLICY_ROLE_INVALID"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Invalid role in access policy for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

// Union type for all access policy errors
export type AccessPolicyErrorType =
  | AccessPolicyNotFoundError
  | AccessPolicyValidationError
  | AccessPolicyConflictError
  | AccessPolicySubjectTypeInvalidError
  | AccessPolicyActionInvalidError
  | AccessPolicyRoleInvalidError
