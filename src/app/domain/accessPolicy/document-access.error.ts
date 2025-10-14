import { DomainError } from "@domain/utils/base.errors"


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

// Union type for all document access errors used in domain
export type DocumentAccessErrorType =
  | DocumentAccessDeniedError
  | DocumentAccessInsufficientPermissionsError
  | DocumentAccessContextInvalidError
