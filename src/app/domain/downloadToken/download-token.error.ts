import { DomainError } from "@domain/utils/base.errors"

/**
 * DownloadToken-specific domain errors.
 * Provides fine-grained error handling for download token operations.
 * All errors follow consistent pattern: field, value, optional details.
 */

export class DownloadTokenNotFoundError extends DomainError {
  readonly _tag = "DownloadTokenNotFoundError" as const
  readonly code = "DOWNLOAD_TOKEN_NOT_FOUND"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Download token not found for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class DownloadTokenValidationError extends DomainError {
  readonly _tag = "DownloadTokenValidationError" as const
  readonly code = "DOWNLOAD_TOKEN_VALIDATION_ERROR"
  
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown
  ) {
    super(message, { field, value })
  }
}

export class DownloadTokenExpiredError extends DomainError {
  readonly _tag = "DownloadTokenExpiredError" as const
  readonly code = "DOWNLOAD_TOKEN_EXPIRED"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Download token expired for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class DownloadTokenAlreadyUsedError extends DomainError {
  readonly _tag = "DownloadTokenAlreadyUsedError" as const
  readonly code = "DOWNLOAD_TOKEN_ALREADY_USED"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Download token already used for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class DownloadTokenUserMismatchError extends DomainError {
  readonly _tag = "DownloadTokenUserMismatchError" as const
  readonly code = "DOWNLOAD_TOKEN_USER_MISMATCH"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Download token user mismatch for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class DownloadTokenInvalidFormatError extends DomainError {
  readonly _tag = "DownloadTokenInvalidFormatError" as const
  readonly code = "DOWNLOAD_TOKEN_INVALID_FORMAT"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Download token invalid format for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class DownloadTokenExpiryInvalidError extends DomainError {
  readonly _tag = "DownloadTokenExpiryInvalidError" as const
  readonly code = "DOWNLOAD_TOKEN_EXPIRY_INVALID"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Download token expiry invalid for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

export class DownloadTokenAlreadyExistsError extends DomainError {
  readonly _tag = "DownloadTokenAlreadyExistsError" as const
  readonly code = "DOWNLOAD_TOKEN_ALREADY_EXISTS"
  
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    details?: string
  ) {
    super(
      `Download token already exists for ${field}: ${value}${details ? ` - ${details}` : ""}`,
      { field, value }
    )
  }
}

// Union type for all download token errors
export type DownloadTokenErrorType =
  | DownloadTokenNotFoundError
  | DownloadTokenValidationError
  | DownloadTokenExpiredError
  | DownloadTokenAlreadyUsedError
  | DownloadTokenUserMismatchError
  | DownloadTokenInvalidFormatError
  | DownloadTokenExpiryInvalidError
  | DownloadTokenAlreadyExistsError
