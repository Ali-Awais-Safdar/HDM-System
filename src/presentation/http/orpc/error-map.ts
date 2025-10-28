import { ORPCError } from "@orpc/server"
import { ParseResult } from "effect"

// Application errors
import {
  type WorkflowError,
  WorkflowDependencyError,
  PermissionCheckError,
  AccessPolicyCreationError,
  UploadInitiationError,
  UploadConfirmationError,
  FileNotFoundError,
  ChecksumValidationError,
  DownloadTokenGenerationError,
  DownloadTokenValidationError as AppDownloadTokenValidationError
} from "@application/errors/application.errors"

// Domain base errors
import {
  ValidationError,
  BusinessRuleViolationError,
  DatabaseError
} from "@domain/utils/base.errors"

// Document errors
import {
  DocumentNotFoundError,
  DocumentValidationError
} from "@domain/document/document.error"

// Document version errors
import {
  DocumentVersionNotFoundError,
  DocumentVersionValidationError
} from "@domain/documentVersion/document-version.error"

// User errors
import {
  UserNotFoundError,
  UserAlreadyExistsError,
  UserValidationError
} from "@domain/user/user.error"

// Access policy errors
import {
  AccessPolicyNotFoundError,
  AccessPolicyValidationError,
  AccessPolicyConflictError
} from "@domain/accessPolicy/access-policy.error"

// Document access errors
import {
  DocumentAccessDeniedError,
  DocumentAccessInsufficientPermissionsError,
  DocumentAccessContextInvalidError
} from "@domain/accessPolicy/document-access.error"

// Download token errors
import {
  DownloadTokenNotFoundError,
  DownloadTokenValidationError as DomainDownloadTokenValidationError,
  DownloadTokenAlreadyUsedError
} from "@domain/downloadToken/download-token.error"


export interface ErrorMappingOptions {
  requestId?: string
  actorId?: string
  logDetails?: boolean
}

function enrichErrorData(data: Record<string, unknown>, options?: ErrorMappingOptions): Record<string, unknown> {
  const enriched = { ...data }
  
  if (options?.requestId) {
    enriched.requestId = options.requestId
  }
  
  return enriched
}

export function mapToORPCError(error: unknown, options?: ErrorMappingOptions): ORPCError<string, unknown> {
  if (error instanceof ORPCError) {
    if (options?.requestId && error.data) {
      return new ORPCError(error.code, {
        message: error.message,
        status: error.status,
        data: enrichErrorData(error.data as Record<string, unknown>, options)
      })
    }
    return error
  }

  // PermissionCheckError - user is authenticated but lacks permission (403 FORBIDDEN)
  if (error instanceof PermissionCheckError) {
    return new ORPCError("FORBIDDEN", {
      message: error.message,
      status: 403,
      data: enrichErrorData({
        code: error.code,
        documentId: error.documentId,
        userId: error.userId,
        requiredPermission: error.requiredPermission,
        details: error.details
      }, options)
    })
  }

  if (error instanceof DocumentAccessDeniedError) {
    return new ORPCError("FORBIDDEN", {
      message: error.message,
      status: 403,
      data: enrichErrorData({
        code: error.code,
        userId: error.userId,
        documentId: error.documentId,
        requiredLevel: error.requiredLevel,
        reason: error.reason
      }, options)
    })
  }

  if (error instanceof DocumentAccessInsufficientPermissionsError) {
    return new ORPCError("FORBIDDEN", {
      message: error.message,
      status: 403,
      data: enrichErrorData({
        code: error.code,
        userId: error.userId,
        documentId: error.documentId,
        currentLevel: error.currentLevel,
        requiredLevel: error.requiredLevel
      }, options)
    })
  }

  // WorkflowDependencyError - check if it wraps a not-found scenario
  if (error instanceof WorkflowDependencyError) {
    const isNotFoundWrapper = isNotFoundDependency(error)
    if (isNotFoundWrapper) {
      return new ORPCError("NOT_FOUND", {
        message: error.message,
        status: 404,
        data: enrichErrorData({
          code: error.code,
          dependency: error.dependency,
          operation: error.operation,
          details: error.details
        }, options)
      })
    }
    // Otherwise treat as internal server error
    return new ORPCError("INTERNAL_SERVER_ERROR", {
      message: error.message,
      status: 500,
      data: enrichErrorData({
        code: error.code,
        dependency: error.dependency,
        operation: error.operation,
        details: error.details
      }, options)
    })
  }

  // Document not found
  if (error instanceof DocumentNotFoundError) {
    return new ORPCError("NOT_FOUND", {
      message: error.message,
      status: 404,
      data: enrichErrorData({
        code: error.code,
        field: error.field,
        value: error.value,
        details: error.details
      }, options)
    })
  }

  // Document version not found
  if (error instanceof DocumentVersionNotFoundError) {
    return new ORPCError("NOT_FOUND", {
      message: error.message,
      status: 404,
      data: enrichErrorData({
        code: error.code,
        field: error.field,
        value: error.value,
        details: error.details
      }, options)
    })
  }

  // User not found
  if (error instanceof UserNotFoundError) {
    return new ORPCError("NOT_FOUND", {
      message: error.message,
      status: 404,
      data: enrichErrorData({
        code: error.code,
        field: error.field,
        value: error.value,
        details: error.details
      }, options)
    })
  }

  // Access policy not found
  if (error instanceof AccessPolicyNotFoundError) {
    return new ORPCError("NOT_FOUND", {
      message: error.message,
      status: 404,
      data: enrichErrorData({
        code: error.code,
        field: error.field,
        value: error.value,
        details: error.details
      }, options)
    })
  }

  // Download token not found
  if (error instanceof DownloadTokenNotFoundError) {
    return new ORPCError("NOT_FOUND", {
      message: error.message,
      status: 404,
      data: enrichErrorData({
        code: error.code,
        field: error.field,
        value: error.value,
        details: error.details
      }, options)
    })
  }

  // File not found
  if (error instanceof FileNotFoundError) {
    return new ORPCError("NOT_FOUND", {
      message: error.message,
      status: 404,
      data: enrichErrorData({
        code: error.code,
        fileKey: error.fileKey,
        details: error.details
      }, options)
    })
  }

  // ValidationError - generic validation failures
  if (error instanceof ValidationError) {
    return new ORPCError("BAD_REQUEST", {
      message: error.message,
      status: 400,
      data: enrichErrorData({
        code: error.code,
        field: error.field,
        value: error.value,
        details: error.details
      }, options)
    })
  }

  // DocumentValidationError
  if (error instanceof DocumentValidationError) {
    return new ORPCError("BAD_REQUEST", {
      message: error.message,
      status: 400,
      data: enrichErrorData({
        code: error.code,
        field: error.field,
        value: error.value,
        details: error.details
      }, options)
    })
  }

  // DocumentVersionValidationError
  if (error instanceof DocumentVersionValidationError) {
    return new ORPCError("BAD_REQUEST", {
      message: error.message,
      status: 400,
      data: enrichErrorData({
        code: error.code,
        field: error.field,
        value: error.value,
        details: error.details
      }, options)
    })
  }

  // UserValidationError
  if (error instanceof UserValidationError) {
    return new ORPCError("BAD_REQUEST", {
      message: error.message,
      status: 400,
      data: enrichErrorData({
        code: error.code,
        field: error.field,
        value: error.value,
        details: error.details
      }, options)
    })
  }

  // AccessPolicyValidationError
  if (error instanceof AccessPolicyValidationError) {
    return new ORPCError("BAD_REQUEST", {
      message: error.message,
      status: 400,
      data: enrichErrorData({
        code: error.code,
        field: error.field,
        value: error.value,
        details: error.details
      }, options)
    })
  }

  // DomainDownloadTokenValidationError
  if (error instanceof DomainDownloadTokenValidationError) {
    return new ORPCError("BAD_REQUEST", {
      message: error.message,
      status: 400,
      data: enrichErrorData({
        code: error.code,
        field: error.field,
        value: error.value,
        details: error.details
      }, options)
    })
  }

  // DocumentAccessContextInvalidError
  if (error instanceof DocumentAccessContextInvalidError) {
    return new ORPCError("BAD_REQUEST", {
      message: error.message,
      status: 400,
      data: enrichErrorData({
        code: error.code,
        field: error.field,
        details: error.details
      }, options)
    })
  }

  // BusinessRuleViolationError - map to BAD_REQUEST per requirements
  if (error instanceof BusinessRuleViolationError) {
    return new ORPCError("BAD_REQUEST", {
      message: error.message,
      status: 400,
      data: enrichErrorData({
        code: error.code,
        details: error.details
      }, options)
    })
  }

  // UploadConfirmationError - map to BAD_REQUEST per requirements
  if (error instanceof UploadConfirmationError) {
    return new ORPCError("BAD_REQUEST", {
      message: error.message,
      status: 400,
      data: enrichErrorData({
        code: error.code,
        documentId: error.documentId,
        versionId: error.versionId,
        reason: error.reason,
        details: error.details
      }, options)
    })
  }

  // Application DownloadTokenValidationError - conditional mapping based on reason
  if (error instanceof AppDownloadTokenValidationError) {
    // EXPIRED → UNAUTHORIZED (401)
    if (error.reason === "EXPIRED") {
      return new ORPCError("UNAUTHORIZED", {
        message: error.message,
        status: 401,
        data: enrichErrorData({
          code: error.code,
          token: error.token,
          reason: error.reason,
          details: error.details
        }, options)
      })
    }
    // NOT_FOUND → NOT_FOUND (404)
    if (error.reason === "NOT_FOUND") {
      return new ORPCError("NOT_FOUND", {
        message: error.message,
        status: 404,
        data: enrichErrorData({
          code: error.code,
          token: error.token,
          reason: error.reason,
          details: error.details
        }, options)
      })
    }
    // ALREADY_USED → PRECONDITION_FAILED (412)
    if (error.reason === "ALREADY_USED") {
      return new ORPCError("PRECONDITION_FAILED", {
        message: error.message,
        status: 412,
        data: enrichErrorData({
          code: error.code,
          token: error.token,
          reason: error.reason,
          details: error.details
        }, options)
      })
    }
    // INVALID and others → BAD_REQUEST (400)
    return new ORPCError("BAD_REQUEST", {
      message: error.message,
      status: 400,
      data: enrichErrorData({
        code: error.code,
        token: error.token,
        reason: error.reason,
        details: error.details
      }, options)
    })
  }

  // Effect ParseResult.ParseError (Schema validation errors)
  if (ParseResult.isParseError(error)) {
    return new ORPCError("BAD_REQUEST", {
      message: "Schema validation failed",
      status: 400,
      data: enrichErrorData({
        code: "SCHEMA_VALIDATION_ERROR",
        details: error.message
      }, options)
    })
  }

  // UserAlreadyExistsError
  if (error instanceof UserAlreadyExistsError) {
    return new ORPCError("CONFLICT", {
      message: error.message,
      status: 409,
      data: enrichErrorData({
        code: error.code,
        field: error.field,
        value: error.value,
        details: error.details
      }, options)
    })
  }

  // AccessPolicyConflictError
  if (error instanceof AccessPolicyConflictError) {
    return new ORPCError("CONFLICT", {
      message: error.message,
      status: 409,
      data: enrichErrorData({
        code: error.code,
        field: error.field,
        value: error.value,
        details: error.details
      }, options)
    })
  }

  // DownloadTokenAlreadyUsedError - semantic PRECONDITION_FAILED
  if (error instanceof DownloadTokenAlreadyUsedError) {
    return new ORPCError("PRECONDITION_FAILED", {
      message: error.message,
      status: 412,
      data: enrichErrorData({
        code: error.code,
        field: error.field,
        value: error.value,
        details: error.details
      }, options)
    })
  }

  // UploadInitiationError
  if (error instanceof UploadInitiationError) {
    return new ORPCError("UNPROCESSABLE_CONTENT", {
      message: error.message,
      status: 422,
      data: enrichErrorData({
        code: error.code,
        documentId: error.documentId,
        fileName: error.fileName,
        details: error.details
      }, options)
    })
  }

  // ChecksumValidationError
  if (error instanceof ChecksumValidationError) {
    return new ORPCError("UNPROCESSABLE_CONTENT", {
      message: error.message,
      status: 422,
      data: enrichErrorData({
        code: error.code,
        expectedChecksum: error.expectedChecksum,
        actualChecksum: error.actualChecksum,
        fileKey: error.fileKey,
        details: error.details
      }, options)
    })
  }

  // AccessPolicyCreationError
  if (error instanceof AccessPolicyCreationError) {
    return new ORPCError("UNPROCESSABLE_CONTENT", {
      message: error.message,
      status: 422,
      data: enrichErrorData({
        code: error.code,
        documentId: error.documentId,
        subjectId: error.subjectId,
        role: error.role,
        details: error.details
      }, options)
    })
  }

  // DownloadTokenGenerationError
  if (error instanceof DownloadTokenGenerationError) {
    return new ORPCError("UNPROCESSABLE_CONTENT", {
      message: error.message,
      status: 422,
      data: enrichErrorData({
        code: error.code,
        documentId: error.documentId,
        userId: error.userId,
        details: error.details
      }, options)
    })
  }

  if (error instanceof DatabaseError) {
    // Don't expose internal database details to clients for security
    return new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "A database error occurred. Please contact support if this persists.",
      status: 500,
      data: enrichErrorData({
        code: "DATABASE_ERROR"
      }, options)
    })
  }

  // Check if it's a WorkflowError by duck typing
  if (
    error &&
    typeof error === "object" &&
    "_tag" in error &&
    "code" in error &&
    error instanceof Error
  ) {
    const workflowError = error as WorkflowError
    return new ORPCError("UNPROCESSABLE_CONTENT", {
      message: workflowError.message,
      status: 422,
      data: enrichErrorData({
        code: workflowError.code,
        tag: workflowError._tag,
        details: (workflowError as any).details
      }, options)
    })
  }

  // Sanitized message for client - no internal details
  return new ORPCError("INTERNAL_SERVER_ERROR", {
    message: "An unexpected error occurred. Please try again or contact support if this persists.",
    status: 500,
    data: enrichErrorData({
      code: "UNKNOWN_ERROR"
    }, options)
  })
}

function isNotFoundDependency(error: WorkflowDependencyError): boolean {
  // Check if the dependency name contains "Repository" and operation is "findById"
  const isRepositoryNotFound = 
    error.dependency.includes("Repository") && 
    error.operation === "findById"
  
  // Check if details contain a not-found indicator
  const hasNotFoundDetails = 
    error.details &&
    typeof error.details === "object" &&
    "originalError" in error.details &&
    (
      error.details.originalError instanceof DocumentNotFoundError ||
      error.details.originalError instanceof UserNotFoundError ||
      error.details.originalError instanceof DocumentVersionNotFoundError ||
      error.details.originalError instanceof AccessPolicyNotFoundError ||
      error.details.originalError instanceof DownloadTokenNotFoundError ||
      (typeof error.details.originalError === "object" && 
       error.details.originalError !== null &&
       "_tag" in error.details.originalError &&
       String((error.details.originalError as any)._tag).includes("NotFound"))
    )
  
  return isRepositoryNotFound || Boolean(hasNotFoundDetails)
}