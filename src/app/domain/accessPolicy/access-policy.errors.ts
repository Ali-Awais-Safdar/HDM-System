import { DomainError } from "@domain/utils/domain.errors"

/**
 * AccessPolicy-specific domain errors.
 * Provides fine-grained error handling for access policy operations.
 */

export class AccessPolicyNotFoundError extends DomainError {
  readonly _tag = "AccessPolicyNotFoundError" as const
  readonly code = "ACCESS_POLICY_NOT_FOUND"
  
  constructor(
    public readonly policyId: string,
    details?: Record<string, unknown>
  ) {
    super(`Access policy with id '${policyId}' not found`, { policyId, ...details })
  }
}

export class AccessPolicyValidationError extends DomainError {
  readonly _tag = "AccessPolicyValidationError" as const
  readonly code = "ACCESS_POLICY_VALIDATION_ERROR"
  
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    details?: Record<string, unknown>
  ) {
    super(message, { field, value, ...details })
  }
}

export class AccessPolicyConflictError extends DomainError {
  readonly _tag = "AccessPolicyConflictError" as const
  readonly code = "ACCESS_POLICY_CONFLICT"
  
  constructor(
    message: string,
    public readonly resourceId: string,
    public readonly subjectId: string,
    details?: Record<string, unknown>
  ) {
    super(message, { resourceId, subjectId, ...details })
  }
}

export class AccessPolicySubjectTypeInvalidError extends DomainError {
  readonly _tag = "AccessPolicySubjectTypeInvalidError" as const
  readonly code = "ACCESS_POLICY_SUBJECT_TYPE_INVALID"
  
  constructor(
    public readonly subjectType: string,
    details?: Record<string, unknown>
  ) {
    super(`Invalid access policy subject type: '${subjectType}'`, { subjectType, ...details })
  }
}

export class AccessPolicyActionInvalidError extends DomainError {
  readonly _tag = "AccessPolicyActionInvalidError" as const
  readonly code = "ACCESS_POLICY_ACTION_INVALID"
  
  constructor(
    public readonly action: string,
    details?: Record<string, unknown>
  ) {
    super(`Invalid access policy action: '${action}'`, { action, ...details })
  }
}

export class AccessPolicyRoleInvalidError extends DomainError {
  readonly _tag = "AccessPolicyRoleInvalidError" as const
  readonly code = "ACCESS_POLICY_ROLE_INVALID"
  
  constructor(
    public readonly role: string,
    details?: Record<string, unknown>
  ) {
    super(`Invalid role in access policy: '${role}'`, { role, ...details })
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
