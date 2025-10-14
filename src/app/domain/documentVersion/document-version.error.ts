import { DomainError } from "@domain/utils/base.errors"

export class DocumentVersionNotFoundError extends DomainError {
  readonly _tag = "DocumentVersionNotFoundError" as const
  readonly code = "DOCUMENT_VERSION_NOT_FOUND"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Document version not found for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class DocumentVersionValidationError extends DomainError {
  readonly _tag = "DocumentVersionValidationError" as const
  readonly code = "DOCUMENT_VERSION_VALIDATION_ERROR"
  
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown
  ) {
    super(message, { field, value })
  }
}

export type DocumentVersionErrorType =
  | DocumentVersionNotFoundError
  | DocumentVersionValidationError
