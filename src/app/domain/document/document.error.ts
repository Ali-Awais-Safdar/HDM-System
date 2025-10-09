import { DomainError } from "@domain/utils/base.errors"

/**
 * Document-specific domain errors.
 * Provides fine-grained error handling for document-related operations.
 * All errors follow consistent pattern: field, value, optional details.
 */

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

export class DocumentTitleInvalidError extends DomainError {
  readonly _tag = "DocumentTitleInvalidError" as const
  readonly code = "DOCUMENT_TITLE_INVALID"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Invalid document title for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class DocumentTagsInvalidError extends DomainError {
  readonly _tag = "DocumentTagsInvalidError" as const
  readonly code = "DOCUMENT_TAGS_INVALID"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Invalid document tags for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class DocumentVersionMismatchError extends DomainError {
  readonly _tag = "DocumentVersionMismatchError" as const
  readonly code = "DOCUMENT_VERSION_MISMATCH"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Document version mismatch for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class DocumentStorageError extends DomainError {
  readonly _tag = "DocumentStorageError" as const
  readonly code = "DOCUMENT_STORAGE_ERROR"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Document storage error for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class DocumentChecksumMismatchError extends DomainError {
  readonly _tag = "DocumentChecksumMismatchError" as const
  readonly code = "DOCUMENT_CHECKSUM_MISMATCH"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Document checksum mismatch for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

// Union type for all document errors
export type DocumentErrorType =
  | DocumentNotFoundError
  | DocumentVersionNotFoundError
  | DocumentValidationError
  | DocumentTitleInvalidError
  | DocumentTagsInvalidError
  | DocumentVersionMismatchError
  | DocumentStorageError
  | DocumentChecksumMismatchError
