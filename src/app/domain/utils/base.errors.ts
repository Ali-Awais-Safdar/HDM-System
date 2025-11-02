// Import module-specific domain errors
import type { DocumentNotFoundError, DocumentValidationError } from "@domain/document/document.error"
import type { DocumentVersionNotFoundError, DocumentVersionValidationError } from "@domain/documentVersion/document-version.error"
import type { AccessPolicyNotFoundError, AccessPolicyValidationError, AccessPolicyConflictError } from "@domain/accessPolicy/access-policy.error"
import type { DocumentAccessDeniedError, DocumentAccessInsufficientPermissionsError, DocumentAccessContextInvalidError } from "@domain/accessPolicy/document-access.error"
import type { DownloadTokenNotFoundError, DownloadTokenValidationError, DownloadTokenAlreadyUsedError } from "@domain/downloadToken/download-token.error"
import type { UserNotFoundError, UserAlreadyExistsError, UserValidationError } from "@domain/user/user.error"

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


/**
 * Domain error type union.
 * 
 * Represents errors that originate from domain logic violations:
 * - ValidationError: Input validation failures (invalid data format, constraints)
 * - BusinessRuleViolationError: Business logic violations (state transitions, invariants)
 * - Module-specific errors: Document, AccessPolicy, DownloadToken, User, DocumentVersion, DocumentAccess
 * 
 * **Layer Isolation:**
 * - Domain errors represent business/validation failures
 * - Infrastructure errors (InfrastructureErrorType) represent technical failures
 * - Application errors (ApplicationErrorType) represent workflow orchestration failures
 */
export type DomainErrorType = 
  | ValidationError
  | BusinessRuleViolationError
  // Document errors
  | DocumentNotFoundError
  | DocumentValidationError
  // Document version errors
  | DocumentVersionNotFoundError
  | DocumentVersionValidationError
  // Access policy errors
  | AccessPolicyNotFoundError
  | AccessPolicyValidationError
  | AccessPolicyConflictError
  // Document access errors
  | DocumentAccessDeniedError
  | DocumentAccessInsufficientPermissionsError
  | DocumentAccessContextInvalidError
  // Download token errors
  | DownloadTokenNotFoundError
  | DownloadTokenValidationError
  | DownloadTokenAlreadyUsedError
  // User errors
  | UserNotFoundError
  | UserAlreadyExistsError
  | UserValidationError