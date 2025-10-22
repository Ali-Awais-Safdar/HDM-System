import { DomainError } from "@domain/utils/base.errors"

export class DocumentNotFoundError extends DomainError {
  readonly _tag = "DocumentNotFoundError" as const
  readonly code = "DOCUMENT_NOT_FOUND"
  
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    details?: Record<string, unknown>
  ) {
    super(message, { field, value, ...details })
  }
}


export class DocumentValidationError extends DomainError {
  readonly _tag = "DocumentValidationError" as const
  readonly code = "DOCUMENT_VALIDATION_ERROR"
  
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    details?: Record<string, unknown>
  ) {
    super(message, { field, value, ...details })
  }
}

export type DocumentErrorType =
  | DocumentNotFoundError
  | DocumentValidationError
