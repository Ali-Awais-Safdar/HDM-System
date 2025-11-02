import { ORPCError } from "@orpc/server"
import { Match, ParseResult } from "effect"

// Application errors
import {
  type ApplicationErrorType,
  WorkflowDependencyError,
  PersistenceDependencyError
} from "@application/errors/application.errors"

// Shared error matching utilities
import { isApplicationError } from "app/shared/error-matching"


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

// Helper functions to check error details without importing domain classes
// Use string-based implementations to avoid importing domain classes
function isResourceMissing(error: PersistenceDependencyError): boolean {
  const getOriginal = error.details?.originalError
  const originalTag = typeof getOriginal === "object" && getOriginal !== null && "_tag" in getOriginal
    ? String((getOriginal as any)._tag).toLowerCase()
    : ""
  const originalCode = typeof getOriginal === "object" && getOriginal !== null && "code" in getOriginal
    ? String((getOriginal as any).code).toLowerCase()
    : ""
  const message = error.message.toLowerCase()
  const op = error.operation.toLowerCase()
  const dependency = error.dependency.toLowerCase()

  return originalTag.includes("notfound")
    || originalCode.includes("not_found")
    || message.includes("not found")
    || message.includes("notfound")
    || (dependency.includes("repository") && op.includes("findby"))
}

function isNotFoundDependency(error: WorkflowDependencyError): boolean {
  const getOriginal = error.details?.originalError
  const originalTag = typeof getOriginal === "object" && getOriginal !== null && "_tag" in getOriginal
    ? String((getOriginal as any)._tag).toLowerCase()
    : ""
  const originalCode = typeof getOriginal === "object" && getOriginal !== null && "code" in getOriginal
    ? String((getOriginal as any).code).toLowerCase()
    : ""
  const message = error.message.toLowerCase()
  const op = error.operation.toLowerCase()
  const dependency = error.dependency.toLowerCase()

  return originalTag.includes("notfound")
    || originalCode.includes("not_found")
    || message.includes("not found")
    || message.includes("notfound")
    || (dependency.includes("repository") && op.includes("findby"))
}

// Helper functions for creating ORPCError with specific status codes
function forbidden(message: string, data: Record<string, unknown>, options?: ErrorMappingOptions): ORPCError<string, unknown> {
  return new ORPCError("FORBIDDEN", {
    message,
    status: 403,
    data: enrichErrorData(data, options)
  })
}

function notFound(message: string, data: Record<string, unknown>, options?: ErrorMappingOptions): ORPCError<string, unknown> {
  return new ORPCError("NOT_FOUND", {
    message,
    status: 404,
    data: enrichErrorData(data, options)
  })
}

function badRequest(message: string, data: Record<string, unknown>, options?: ErrorMappingOptions): ORPCError<string, unknown> {
  return new ORPCError("BAD_REQUEST", {
    message,
    status: 400,
    data: enrichErrorData(data, options)
  })
}

function unauthorized(message: string, data: Record<string, unknown>, options?: ErrorMappingOptions): ORPCError<string, unknown> {
  return new ORPCError("UNAUTHORIZED", {
    message,
    status: 401,
    data: enrichErrorData(data, options)
  })
}

function preconditionFailed(message: string, data: Record<string, unknown>, options?: ErrorMappingOptions): ORPCError<string, unknown> {
  return new ORPCError("PRECONDITION_FAILED", {
    message,
    status: 412,
    data: enrichErrorData(data, options)
  })
}

function unprocessableContent(message: string, data: Record<string, unknown>, options?: ErrorMappingOptions): ORPCError<string, unknown> {
  return new ORPCError("UNPROCESSABLE_CONTENT", {
    message,
    status: 422,
    data: enrichErrorData(data, options)
  })
}

function badGateway(message: string, data: Record<string, unknown>, options?: ErrorMappingOptions): ORPCError<string, unknown> {
  return new ORPCError("BAD_GATEWAY", {
    message,
    status: 502,
    data: enrichErrorData(data, options)
  })
}

function internalServerError(message: string, data: Record<string, unknown>, options?: ErrorMappingOptions): ORPCError<string, unknown> {
  return new ORPCError("INTERNAL_SERVER_ERROR", {
    message,
    status: 500,
    data: enrichErrorData(data, options)
  })
}

// Declarative matcher factory that converts ApplicationErrorType to ORPCError
// Takes options and returns a matcher function that can use those options
function createToOrpcErrorMatcher(options?: ErrorMappingOptions) {
  return Match.type<ApplicationErrorType>().pipe(
    Match.tag("PermissionCheckError", (e) =>
      forbidden(e.message, {
        code: e.code,
        documentId: e.documentId,
        userId: e.userId,
        requiredPermission: e.requiredPermission,
        details: e.details
      }, options)
    ),
    Match.tag("WorkflowDependencyError", (e) =>
      isNotFoundDependency(e)
        ? notFound(e.message, {
            code: e.code,
            dependency: e.dependency,
            operation: e.operation,
            details: e.details
          }, options)
        : internalServerError(e.message, {
            code: e.code,
            dependency: e.dependency,
            operation: e.operation,
            details: e.details
          }, options)
    ),
    Match.tag("AccessPolicyCreationError", (e) =>
      unprocessableContent(e.message, {
        code: e.code,
        documentId: e.documentId,
        subjectId: e.subjectId,
        role: e.role,
        details: e.details
      }, options)
    ),
    Match.tag("UploadInitiationError", (e) =>
      unprocessableContent(e.message, {
        code: e.code,
        documentId: e.documentId,
        fileName: e.fileName,
        details: e.details
      }, options)
    ),
    Match.tag("UploadConfirmationError", (e) =>
      badRequest(e.message, {
        code: e.code,
        documentId: e.documentId,
        versionId: e.versionId,
        reason: e.reason,
        details: e.details
      }, options)
    ),
    Match.tag("FileNotFoundError", (e) =>
      notFound(e.message, {
        code: e.code,
        fileKey: e.fileKey,
        details: e.details
      }, options)
    ),
    Match.tag("ChecksumValidationError", (e) =>
      unprocessableContent(e.message, {
        code: e.code,
        expectedChecksum: e.expectedChecksum,
        actualChecksum: e.actualChecksum,
        fileKey: e.fileKey,
        details: e.details
      }, options)
    ),
    Match.tag("DownloadTokenGenerationError", (e) =>
      unprocessableContent(e.message, {
        code: e.code,
        documentId: e.documentId,
        userId: e.userId,
        details: e.details
      }, options)
    ),
    Match.tag("DownloadTokenValidationError", (e) => {
      switch (e.reason) {
        case "EXPIRED":
          return unauthorized(e.message, {
            code: e.code,
            token: e.token,
            reason: e.reason,
            details: e.details
          }, options)
        case "NOT_FOUND":
          return notFound(e.message, {
            code: e.code,
            token: e.token,
            reason: e.reason,
            details: e.details
          }, options)
        case "ALREADY_USED":
          return preconditionFailed(e.message, {
            code: e.code,
            token: e.token,
            reason: e.reason,
            details: e.details
          }, options)
        default:
          return badRequest(e.message, {
            code: e.code,
            token: e.token,
            reason: e.reason,
            details: e.details
          }, options)
      }
    }),
    Match.tag("PersistenceDependencyError", (e) =>
      isResourceMissing(e)
        ? notFound(e.message, {
            code: e.code,
            dependency: e.dependency,
            operation: e.operation,
            details: e.details
          }, options)
        : internalServerError(e.message, {
            code: e.code,
            dependency: e.dependency,
            operation: e.operation,
            details: e.details
          }, options)
    ),
    Match.tag("ExternalPortError", (e) =>
      badGateway(e.message, {
        code: e.code,
        port: e.port,
        operation: e.operation,
        details: e.details
      }, options)
    ),
    Match.tag("InteractionValidationError", (e) =>
      badRequest(e.message, {
        code: e.code,
        field: e.field,
        value: e.value,
        details: e.details
      }, options)
    ),
    Match.exhaustive
  )
}

export function mapToORPCError(error: unknown, options?: ErrorMappingOptions): ORPCError<string, unknown> {
  // Case 1: Pass through ORPCError (existing logic stays)
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

  // Case 2: ParseResult.ParseError - return 400 with current payload
  if (ParseResult.isParseError(error)) {
    return badRequest("Schema validation failed", {
      code: "SCHEMA_VALIDATION_ERROR",
      details: error.message
    }, options)
  }

  // Case 3: ApplicationError - use declarative matcher
  if (isApplicationError(error)) {
    const toOrpcError = createToOrpcErrorMatcher(options)
    return toOrpcError(error)
  }

  // Fallback: Unexpected error - log if requested and return sanitized 500
  if (options?.logDetails) {
    console.error("Unexpected error in mapToORPCError:", error)
  }

  return internalServerError(
    "An unexpected error occurred. Please try again or contact support if this persists.",
    {
      code: "UNKNOWN_ERROR"
    },
    options
  )
}