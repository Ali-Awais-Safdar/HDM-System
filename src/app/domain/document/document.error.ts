import { DomainError } from "@domain/utils/base.errors"

export class DocumentNotFoundError extends DomainError {
  readonly _tag = "DocumentNotFoundError" as const
  readonly code = "DOCUMENT_NOT_FOUND"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Document not found for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}


export class DocumentValidationError extends DomainError {
  readonly _tag = "DocumentValidationError" as const
  readonly code = "DOCUMENT_VALIDATION_ERROR"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Document validation failed for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export type DocumentErrorType =
  | DocumentNotFoundError
  | DocumentValidationError
