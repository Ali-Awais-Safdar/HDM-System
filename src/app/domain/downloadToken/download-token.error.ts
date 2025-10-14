import { DomainError } from "@domain/utils/base.errors"

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

export type DownloadTokenErrorType =
  | DownloadTokenNotFoundError
  | DownloadTokenValidationError
  | DownloadTokenAlreadyUsedError
