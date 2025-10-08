import { DomainError } from "@domain/utils/domain.errors"

/**
 * Document-specific domain errors.
 * Provides fine-grained error handling for document-related operations.
 */

export class DocumentNotFoundError extends DomainError {
  readonly _tag = "DocumentNotFoundError" as const
  readonly code = "DOCUMENT_NOT_FOUND"
  
  constructor(
    public readonly documentId: string,
    details?: Record<string, unknown>
  ) {
    super(`Document with id '${documentId}' not found`, { documentId, ...details })
  }
}

export class DocumentVersionNotFoundError extends DomainError {
  readonly _tag = "DocumentVersionNotFoundError" as const
  readonly code = "DOCUMENT_VERSION_NOT_FOUND"
  
  constructor(
    public readonly versionId: string,
    details?: Record<string, unknown>
  ) {
    super(`Document version with id '${versionId}' not found`, { versionId, ...details })
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

export class DocumentTitleInvalidError extends DomainError {
  readonly _tag = "DocumentTitleInvalidError" as const
  readonly code = "DOCUMENT_TITLE_INVALID"
  
  constructor(
    public readonly title: string,
    details?: Record<string, unknown>
  ) {
    super(`Invalid document title: '${title}'`, { title, ...details })
  }
}

export class DocumentTagsInvalidError extends DomainError {
  readonly _tag = "DocumentTagsInvalidError" as const
  readonly code = "DOCUMENT_TAGS_INVALID"
  
  constructor(
    message: string,
    public readonly tags: string[],
    details?: Record<string, unknown>
  ) {
    super(message, { tags, ...details })
  }
}

export class DocumentVersionMismatchError extends DomainError {
  readonly _tag = "DocumentVersionMismatchError" as const
  readonly code = "DOCUMENT_VERSION_MISMATCH"
  
  constructor(
    public readonly documentId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
    details?: Record<string, unknown>
  ) {
    super(
      `Version mismatch for document '${documentId}': expected ${expectedVersion}, got ${actualVersion}`,
      { documentId, expectedVersion, actualVersion, ...details }
    )
  }
}

export class DocumentStorageError extends DomainError {
  readonly _tag = "DocumentStorageError" as const
  readonly code = "DOCUMENT_STORAGE_ERROR"
  
  constructor(
    message: string,
    public readonly documentId?: string,
    details?: Record<string, unknown>
  ) {
    super(message, { documentId, ...details })
  }
}

export class DocumentChecksumMismatchError extends DomainError {
  readonly _tag = "DocumentChecksumMismatchError" as const
  readonly code = "DOCUMENT_CHECKSUM_MISMATCH"
  
  constructor(
    public readonly documentId: string,
    public readonly expectedChecksum: string,
    public readonly actualChecksum: string,
    details?: Record<string, unknown>
  ) {
    super(
      `Checksum mismatch for document '${documentId}': expected ${expectedChecksum}, got ${actualChecksum}`,
      { documentId, expectedChecksum, actualChecksum, ...details }
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
