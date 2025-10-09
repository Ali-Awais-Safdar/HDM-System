import { DomainError } from "@domain/utils/base.errors"

/**
 * DocumentAccess-specific domain errors.
 * Provides fine-grained error handling for document access control operations.
 */

export class DocumentAccessDeniedError extends DomainError {
  readonly _tag = "DocumentAccessDeniedError" as const
  readonly code = "DOCUMENT_ACCESS_DENIED"
  
  constructor(
    public readonly userId: string,
    public readonly documentId: string,
    public readonly requiredLevel: string,
    public readonly reason: string,
    details?: Record<string, unknown>
  ) {
    super(
      `Access denied for user '${userId}' to document '${documentId}': ${reason}`,
      { userId, documentId, requiredLevel, reason, ...details }
    )
  }
}

export class DocumentAccessInsufficientPermissionsError extends DomainError {
  readonly _tag = "DocumentAccessInsufficientPermissionsError" as const
  readonly code = "DOCUMENT_ACCESS_INSUFFICIENT_PERMISSIONS"
  
  constructor(
    public readonly userId: string,
    public readonly documentId: string,
    public readonly currentLevel: string,
    public readonly requiredLevel: string,
    details?: Record<string, unknown>
  ) {
    super(
      `Insufficient permissions for user '${userId}' on document '${documentId}': has ${currentLevel}, requires ${requiredLevel}`,
      { userId, documentId, currentLevel, requiredLevel, ...details }
    )
  }
}

export class DocumentAccessEvaluationError extends DomainError {
  readonly _tag = "DocumentAccessEvaluationError" as const
  readonly code = "DOCUMENT_ACCESS_EVALUATION_ERROR"
  
  constructor(
    message: string,
    public readonly userId: string,
    public readonly documentId: string,
    details?: Record<string, unknown>
  ) {
    super(message, { userId, documentId, ...details })
  }
}

export class DocumentAccessContextInvalidError extends DomainError {
  readonly _tag = "DocumentAccessContextInvalidError" as const
  readonly code = "DOCUMENT_ACCESS_CONTEXT_INVALID"
  
  constructor(
    message: string,
    public readonly field?: string,
    details?: Record<string, unknown>
  ) {
    super(message, { field, ...details })
  }
}

export class DocumentAccessPermissionLevelInvalidError extends DomainError {
  readonly _tag = "DocumentAccessPermissionLevelInvalidError" as const
  readonly code = "DOCUMENT_ACCESS_PERMISSION_LEVEL_INVALID"
  
  constructor(
    public readonly level: string,
    details?: Record<string, unknown>
  ) {
    super(`Invalid permission level: '${level}'`, { level, ...details })
  }
}

// Union type for all document access errors
export type DocumentAccessErrorType =
  | DocumentAccessDeniedError
  | DocumentAccessInsufficientPermissionsError
  | DocumentAccessEvaluationError
  | DocumentAccessContextInvalidError
  | DocumentAccessPermissionLevelInvalidError
