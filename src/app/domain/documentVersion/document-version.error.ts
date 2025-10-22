import { DomainError } from "@domain/utils/base.errors"

export class DocumentVersionNotFoundError extends DomainError {
  readonly _tag = "DocumentVersionNotFoundError" as const
  readonly code = "DOCUMENT_VERSION_NOT_FOUND"
  
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    details?: Record<string, unknown>
  ) {
    super(message, { field, value, ...details })
  }
}

export class DocumentVersionValidationError extends DomainError {
  readonly _tag = "DocumentVersionValidationError" as const
  readonly code = "DOCUMENT_VERSION_VALIDATION_ERROR"
  
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    details?: Record<string, unknown>
  ) {
    super(message, { field, value, ...details })
  }
}

export type DocumentVersionErrorType =
  | DocumentVersionNotFoundError
  | DocumentVersionValidationError
