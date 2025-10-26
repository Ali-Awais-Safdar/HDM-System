import { DomainError } from "@domain/utils/base.errors"

// ===== WORKFLOW ORCHESTRATION ERRORS =====

export abstract class WorkflowError extends DomainError {
  abstract readonly _tag: string
  abstract readonly code: string
}

export class WorkflowDependencyError extends WorkflowError {
  readonly _tag = "WorkflowDependencyError" as const
  readonly code = "WORKFLOW_DEPENDENCY_ERROR"
  
  constructor(
    message: string,
    public readonly dependency: string,
    public readonly operation: string,
    details?: Record<string, unknown>
  ) {
    super(message, { dependency, operation, ...details })
  }
}

// ===== UPLOAD WORKFLOW ERRORS =====


export abstract class UploadError extends WorkflowError {
  abstract readonly _tag: string
  abstract readonly code: string
}


export class UploadInitiationError extends UploadError {
  readonly _tag = "UploadInitiationError" as const
  readonly code = "UPLOAD_INITIATION_ERROR"
  
  constructor(
    message: string,
    public readonly documentId: string,
    public readonly fileName: string,
    details?: Record<string, unknown>
  ) {
    super(message, { documentId, fileName, ...details })
  }
}


export class UploadConfirmationError extends UploadError {
  readonly _tag = "UploadConfirmationError" as const
  readonly code = "UPLOAD_CONFIRMATION_ERROR"
  
  constructor(
    message: string,
    public readonly documentId: string,
    public readonly versionId: string,
    public readonly reason: "FILE_NOT_FOUND" | "CHECKSUM_MISMATCH" | "SIZE_MISMATCH" | "MIME_TYPE_MISMATCH" | "CONTENT_REF_MISMATCH",
    details?: Record<string, unknown>
  ) {
    super(message, { documentId, versionId, reason, ...details })
  }
}

export class FileNotFoundError extends UploadError {
  readonly _tag = "FileNotFoundError" as const
  readonly code = "FILE_NOT_FOUND"
  
  constructor(
    message: string,
    public readonly fileKey: string,
    details?: Record<string, unknown>
  ) {
    super(message, { fileKey, ...details })
  }
}

export class ChecksumValidationError extends UploadError {
  readonly _tag = "ChecksumValidationError" as const
  readonly code = "CHECKSUM_VALIDATION_ERROR"
  
  constructor(
    message: string,
    public readonly expectedChecksum: string,
    public readonly actualChecksum: string,
    public readonly fileKey: string,
    details?: Record<string, unknown>
  ) {
    super(message, { expectedChecksum, actualChecksum, fileKey, ...details })
  }
}

// ===== ACCESS CONTROL WORKFLOW ERRORS =====

export abstract class AccessControlError extends WorkflowError {
  abstract readonly _tag: string
  abstract readonly code: string
}

export class AccessPolicyCreationError extends AccessControlError {
  readonly _tag = "AccessPolicyCreationError" as const
  readonly code = "ACCESS_POLICY_CREATION_ERROR"
  
  constructor(
    message: string,
    public readonly documentId: string,
    public readonly subjectId: string,
    public readonly role: string,
    details?: Record<string, unknown>
  ) {
    super(message, { documentId, subjectId, role, ...details })
  }
}

export class PermissionCheckError extends AccessControlError {
  readonly _tag = "PermissionCheckError" as const
  readonly code = "PERMISSION_CHECK_ERROR"
  
  constructor(
    message: string,
    public readonly documentId: string,
    public readonly userId: string,
    public readonly requiredPermission: string,
    details?: Record<string, unknown>
  ) {
    super(message, { documentId, userId, requiredPermission, ...details })
  }
}

// ===== DOWNLOAD TOKEN WORKFLOW ERRORS =====

export abstract class DownloadTokenWorkflowError extends WorkflowError {
  abstract readonly _tag: string
  abstract readonly code: string
}

export class DownloadTokenGenerationError extends DownloadTokenWorkflowError {
  readonly _tag = "DownloadTokenGenerationError" as const
  readonly code = "DOWNLOAD_TOKEN_GENERATION_ERROR"
  
  constructor(
    message: string,
    public readonly documentId: string,
    public readonly userId: string,
    details?: Record<string, unknown>
  ) {
    super(message, { documentId, userId, ...details })
  }
}

export class DownloadTokenValidationError extends DownloadTokenWorkflowError {
  readonly _tag = "DownloadTokenValidationError" as const
  readonly code = "DOWNLOAD_TOKEN_VALIDATION_ERROR"
  
  constructor(
    message: string,
    public readonly token: string,
    public readonly reason: "EXPIRED" | "INVALID" | "ALREADY_USED" | "NOT_FOUND",
    details?: Record<string, unknown>
  ) {
    super(message, { token, reason, ...details })
  }
}

// ===== ERROR TYPE UNIONS =====

export type ApplicationError = 
  | WorkflowDependencyError
  | UploadInitiationError
  | UploadConfirmationError
  | FileNotFoundError
  | ChecksumValidationError
  | AccessPolicyCreationError
  | PermissionCheckError
  | DownloadTokenGenerationError
  | DownloadTokenValidationError

export type UploadWorkflowError = 
  | UploadInitiationError
  | UploadConfirmationError
  | FileNotFoundError
  | ChecksumValidationError

export type AccessControlWorkflowError = 
  | AccessPolicyCreationError
  | PermissionCheckError

export type DownloadTokenWorkflowErrorType = 
  | DownloadTokenGenerationError
  | DownloadTokenValidationError
