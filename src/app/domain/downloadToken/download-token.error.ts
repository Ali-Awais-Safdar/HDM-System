import { DomainError } from "@domain/utils/base.errors"

export class DownloadTokenNotFoundError extends DomainError {
  readonly _tag = "DownloadTokenNotFoundError" as const
  readonly code = "DOWNLOAD_TOKEN_NOT_FOUND"
  
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    details?: Record<string, unknown>
  ) {
    super(message, { field, value, ...details })
  }
}

export class DownloadTokenValidationError extends DomainError {
  readonly _tag = "DownloadTokenValidationError" as const
  readonly code = "DOWNLOAD_TOKEN_VALIDATION_ERROR"
  
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    details?: Record<string, unknown>
  ) {
    super(message, { field, value, ...details })
  }
}


export class DownloadTokenAlreadyUsedError extends DomainError {
  readonly _tag = "DownloadTokenAlreadyUsedError" as const
  readonly code = "DOWNLOAD_TOKEN_ALREADY_USED"
  
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    details?: Record<string, unknown>
  ) {
    super(message, { field, value, ...details })
  }
}

export type DownloadTokenErrorType =
  | DownloadTokenNotFoundError
  | DownloadTokenValidationError
  | DownloadTokenAlreadyUsedError
