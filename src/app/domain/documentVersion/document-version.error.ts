import { DomainError } from "@domain/utils/base.errors"

/**
 * DocumentVersion-specific domain errors.
 * Provides fine-grained error handling for document version operations.
 * All errors follow consistent pattern: field, value, optional details.
 */

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

export class DocumentVersionConflictError extends DomainError {
  readonly _tag = "DocumentVersionConflictError" as const
  readonly code = "DOCUMENT_VERSION_CONFLICT"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Document version conflict for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class DocumentVersionChecksumMismatchError extends DomainError {
  readonly _tag = "DocumentVersionChecksumMismatchError" as const
  readonly code = "DOCUMENT_VERSION_CHECKSUM_MISMATCH"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Document version checksum mismatch for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class DocumentVersionFileSizeInvalidError extends DomainError {
  readonly _tag = "DocumentVersionFileSizeInvalidError" as const
  readonly code = "DOCUMENT_VERSION_FILE_SIZE_INVALID"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Document version file size invalid for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class DocumentVersionMimeTypeInvalidError extends DomainError {
  readonly _tag = "DocumentVersionMimeTypeInvalidError" as const
  readonly code = "DOCUMENT_VERSION_MIME_TYPE_INVALID"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Document version MIME type invalid for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class DocumentVersionVersionInvalidError extends DomainError {
  readonly _tag = "DocumentVersionVersionInvalidError" as const
  readonly code = "DOCUMENT_VERSION_VERSION_INVALID"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Document version number invalid for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class DocumentVersionAlreadyExistsError extends DomainError {
  readonly _tag = "DocumentVersionAlreadyExistsError" as const
  readonly code = "DOCUMENT_VERSION_ALREADY_EXISTS"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Document version already exists for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

// Union type for all document version errors
export type DocumentVersionErrorType =
  | DocumentVersionNotFoundError
  | DocumentVersionValidationError
  | DocumentVersionConflictError
  | DocumentVersionChecksumMismatchError
  | DocumentVersionFileSizeInvalidError
  | DocumentVersionMimeTypeInvalidError
  | DocumentVersionVersionInvalidError
  | DocumentVersionAlreadyExistsError
