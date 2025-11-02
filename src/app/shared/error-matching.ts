/**
 * Central Pattern-Matching Utilities for Error Handling
 * 
 * Provides declarative error matching utilities using Effect's Match module
 * to enable fail-fast mechanisms, layer isolation, and exhaustive checking.
 * 
 * Architecture:
 * - Infrastructure errors are mapped to Application errors (never to Domain)
 * - Domain errors are mapped to Application errors
 * - Unexpected infrastructure errors fail fast without wrapping
 */

import { Match, Effect } from "effect"
import type { InfrastructureErrorType, InfraUnexpected } from "@infra/errors/infrastructure.errors"
import type { DomainErrorType } from "@domain/utils/base.errors"
import type { ApplicationErrorType } from "@application/errors/application.errors"
import {
  PersistenceDependencyError,
  ExternalPortError,
  InteractionValidationError,
  WorkflowDependencyError
} from "@application/errors/application.errors"

// ===== TYPE GUARDS =====

/**
 * Check if an infrastructure error is unexpected (systemic failure)
 * Unexpected errors should fail fast without wrapping
 */
export const isUnexpectedInfraError = (error: InfrastructureErrorType): error is InfraUnexpected => {
  return error._tag === "InfraUnexpected"
}

/**
 * Check if an unknown error is an infrastructure error
 */
export const isInfraError = (error: unknown): error is InfrastructureErrorType => {
  return (
    error !== null &&
    typeof error === "object" &&
    "_tag" in error &&
    typeof error._tag === "string" &&
    (
      error._tag === "InfraConflict" ||
      error._tag === "InfraValidation" ||
      error._tag === "InfraNotFound" ||
      error._tag === "InfraUnexpected"
    )
  )
}

/**
 * Check if an unknown error is a domain error
 */
export const isDomainError = (error: unknown): error is DomainErrorType => {
  return (
    error !== null &&
    typeof error === "object" &&
    "_tag" in error &&
    typeof error._tag === "string" &&
    (
      // Base domain errors
      error._tag === "ValidationError" ||
      error._tag === "BusinessRuleViolationError" ||
      // Document errors
      error._tag === "DocumentNotFoundError" ||
      error._tag === "DocumentValidationError" ||
      // Document version errors
      error._tag === "DocumentVersionNotFoundError" ||
      error._tag === "DocumentVersionValidationError" ||
      // Access policy errors
      error._tag === "AccessPolicyNotFoundError" ||
      error._tag === "AccessPolicyValidationError" ||
      error._tag === "AccessPolicyConflictError" ||
      // Document access errors
      error._tag === "DocumentAccessDeniedError" ||
      error._tag === "DocumentAccessInsufficientPermissionsError" ||
      error._tag === "DocumentAccessContextInvalidError" ||
      // Download token errors
      error._tag === "DownloadTokenNotFoundError" ||
      error._tag === "DownloadTokenValidationError" ||
      error._tag === "DownloadTokenAlreadyUsedError" ||
      // User errors
      error._tag === "UserNotFoundError" ||
      error._tag === "UserAlreadyExistsError" ||
      error._tag === "UserValidationError"
    )
  )
}

/**
 * Check if an unknown error is an application error
 */
export const isApplicationError = (error: unknown): error is ApplicationErrorType => {
  return (
    error !== null &&
    typeof error === "object" &&
    "_tag" in error &&
    typeof error._tag === "string" &&
    error instanceof Error &&
    "code" in error
  )
}

// ===== INFRASTRUCTURE ERROR MATCHERS =====

/**
 * Create a matcher for infrastructure errors
 * Returns an Effect that fails with the appropriate application error
 * 
 * @example
 * ```typescript
 * const handler = matchInfraError<ApplicationError>({
 *   onConflict: (e) => Effect.fail(new PersistenceDependencyError(...)),
 *   onValidation: (e) => Effect.fail(new PersistenceDependencyError(...)),
 *   onNotFound: (e) => Effect.fail(new PersistenceDependencyError(...)),
 *   onUnexpected: (e) => Effect.fail(e) // Fail fast
 * })
 * ```
 */
export type InfraErrorHandlers<E> = {
  readonly onConflict: (error: InfrastructureErrorType & { readonly _tag: "InfraConflict" }) => Effect.Effect<never, E>
  readonly onValidation: (error: InfrastructureErrorType & { readonly _tag: "InfraValidation" }) => Effect.Effect<never, E>
  readonly onNotFound: (error: InfrastructureErrorType & { readonly _tag: "InfraNotFound" }) => Effect.Effect<never, E>
  readonly onUnexpected: (error: InfrastructureErrorType & { readonly _tag: "InfraUnexpected" }) => Effect.Effect<never, E>
}

/**
 * Match infrastructure errors with exhaustive checking
 * 
 * @param handlers - Handlers for each infrastructure error type
 * @returns A function that takes an InfrastructureErrorType and returns an Effect
 */
export const matchInfraError = <E>(
  handlers: InfraErrorHandlers<E>
) => {
  return Match.type<InfrastructureErrorType>().pipe(
    Match.tag("InfraConflict", handlers.onConflict),
    Match.tag("InfraValidation", handlers.onValidation),
    Match.tag("InfraNotFound", handlers.onNotFound),
    Match.tag("InfraUnexpected", handlers.onUnexpected),
    Match.exhaustive
  )
}

/**
 * Match infrastructure errors from unknown source with fallback
 * Use this when catching errors at the infrastructure boundary
 * 
 * @param handlers - Handlers for each infrastructure error type
 * @param onOther - Fallback handler for unknown errors
 * @returns A function that takes unknown error and returns an Effect
 */
export const matchInfraErrorOrElse = <E>(
  handlers: InfraErrorHandlers<E>,
  onOther: (error: unknown) => Effect.Effect<never, E>
) => {
  return (error: unknown): Effect.Effect<never, E> => {
    if (!isInfraError(error)) {
      return onOther(error)
    }

    // Type is now narrowed to InfrastructureErrorType
    const matcher = matchInfraError(handlers)
    return matcher(error)
  }
}

// ===== DOMAIN ERROR MATCHERS =====

/**
 * Create a matcher for domain errors
 * Returns an Effect that fails with the appropriate application error
 */
export type DomainErrorHandlers<E> = {
  readonly onValidation: (error: DomainErrorType & { readonly _tag: "ValidationError" }) => Effect.Effect<never, E>
  readonly onBusinessRuleViolation: (error: DomainErrorType & { readonly _tag: "BusinessRuleViolationError" }) => Effect.Effect<never, E>
}

/**
 * Match domain errors with exhaustive checking
 * Uses declarative Match.type for all domain errors, handling base errors explicitly
 * Module-specific errors are handled by checking their tag and passing through
 * 
 * @param handlers - Handlers for base domain error types
 * @param onModuleSpecific - Handler for module-specific errors (returns Effect that passes through the error)
 * @returns A function that takes a DomainErrorType and returns an Effect
 */
const isModuleSpecificError = (tag: string): boolean => {
  return tag.startsWith("Document") ||
    tag.startsWith("DocumentVersion") ||
    tag.startsWith("AccessPolicy") ||
    tag.startsWith("DocumentAccess") ||
    tag.startsWith("DownloadToken") ||
    tag.startsWith("User")
}

export const matchDomainError = <E>(
  handlers: DomainErrorHandlers<E>,
  onModuleSpecific: (error: DomainErrorType) => Effect.Effect<never, E>
) => {
  return Match.type<DomainErrorType>().pipe(
    // Base domain errors
    Match.tag("ValidationError", handlers.onValidation),
    Match.tag("BusinessRuleViolationError", handlers.onBusinessRuleViolation),
    // Module-specific errors - pass through for application layer handling
    // Document errors
    Match.tag("DocumentNotFoundError", onModuleSpecific),
    Match.tag("DocumentValidationError", onModuleSpecific),
    // Document version errors
    Match.tag("DocumentVersionNotFoundError", onModuleSpecific),
    Match.tag("DocumentVersionValidationError", onModuleSpecific),
    // Access policy errors
    Match.tag("AccessPolicyNotFoundError", onModuleSpecific),
    Match.tag("AccessPolicyValidationError", onModuleSpecific),
    Match.tag("AccessPolicyConflictError", onModuleSpecific),
    // Document access errors
    Match.tag("DocumentAccessDeniedError", onModuleSpecific),
    Match.tag("DocumentAccessInsufficientPermissionsError", onModuleSpecific),
    Match.tag("DocumentAccessContextInvalidError", onModuleSpecific),
    // Download token errors
    Match.tag("DownloadTokenNotFoundError", onModuleSpecific),
    Match.tag("DownloadTokenValidationError", onModuleSpecific),
    Match.tag("DownloadTokenAlreadyUsedError", onModuleSpecific),
    // User errors
    Match.tag("UserNotFoundError", onModuleSpecific),
    Match.tag("UserAlreadyExistsError", onModuleSpecific),
    Match.tag("UserValidationError", onModuleSpecific),
    Match.exhaustive
  )
}

/**
 * Match domain errors from unknown source with fallback
 * Use this when catching errors at the domain boundary
 * Module-specific errors are passed through to onOther for application layer handling
 * 
 * @param handlers - Handlers for each domain error type
 * @param onOther - Fallback handler for unknown and module-specific errors
 * @returns A function that takes unknown error and returns an Effect
 */
export const matchDomainErrorOrElse = <E>(
  handlers: DomainErrorHandlers<E>,
  onOther: (error: unknown) => Effect.Effect<never, E>
) => {
  return (error: unknown): Effect.Effect<never, E> => {
    if (!isDomainError(error)) {
      return onOther(error)
    }

    // Check if it's a module-specific error - pass through to onOther
    if (isModuleSpecificError(error._tag)) {
      return onOther(error)
    }

    // Type is now narrowed to base DomainErrorType
    const matcher = matchDomainError(handlers, (e) => onOther(e))
    return matcher(error)
  }
}

// ===== APPLICATION ERROR MATCHERS =====

/**
 * Create a matcher for application errors
 * Useful for presentation layer error mapping
 */
export type ApplicationErrorHandlers<R> = {
  readonly onWorkflowDependency: (error: ApplicationErrorType & { readonly _tag: "WorkflowDependencyError" }) => R
  readonly onUploadInitiation: (error: ApplicationErrorType & { readonly _tag: "UploadInitiationError" }) => R
  readonly onUploadConfirmation: (error: ApplicationErrorType & { readonly _tag: "UploadConfirmationError" }) => R
  readonly onFileNotFound: (error: ApplicationErrorType & { readonly _tag: "FileNotFoundError" }) => R
  readonly onChecksumValidation: (error: ApplicationErrorType & { readonly _tag: "ChecksumValidationError" }) => R
  readonly onAccessPolicyCreation: (error: ApplicationErrorType & { readonly _tag: "AccessPolicyCreationError" }) => R
  readonly onPermissionCheck: (error: ApplicationErrorType & { readonly _tag: "PermissionCheckError" }) => R
  readonly onDownloadTokenGeneration: (error: ApplicationErrorType & { readonly _tag: "DownloadTokenGenerationError" }) => R
  readonly onDownloadTokenValidation: (error: ApplicationErrorType & { readonly _tag: "DownloadTokenValidationError" }) => R
  readonly onPersistenceDependency: (error: ApplicationErrorType & { readonly _tag: "PersistenceDependencyError" }) => R
  readonly onExternalPort: (error: ApplicationErrorType & { readonly _tag: "ExternalPortError" }) => R
  readonly onInteractionValidation: (error: ApplicationErrorType & { readonly _tag: "InteractionValidationError" }) => R
}

/**
 * Match application errors with exhaustive checking
 * Use this in presentation layer for HTTP error mapping
 * 
 * @param handlers - Handlers for each application error type
 * @returns A function that takes an ApplicationErrorType and returns a result
 */
export const matchApplicationError = <R>(
  handlers: ApplicationErrorHandlers<R>
) => {
  return Match.type<ApplicationErrorType>().pipe(
    Match.tag("WorkflowDependencyError", handlers.onWorkflowDependency),
    Match.tag("UploadInitiationError", handlers.onUploadInitiation),
    Match.tag("UploadConfirmationError", handlers.onUploadConfirmation),
    Match.tag("FileNotFoundError", handlers.onFileNotFound),
    Match.tag("ChecksumValidationError", handlers.onChecksumValidation),
    Match.tag("AccessPolicyCreationError", handlers.onAccessPolicyCreation),
    Match.tag("PermissionCheckError", handlers.onPermissionCheck),
    Match.tag("DownloadTokenGenerationError", handlers.onDownloadTokenGeneration),
    Match.tag("DownloadTokenValidationError", handlers.onDownloadTokenValidation),
    Match.tag("PersistenceDependencyError", handlers.onPersistenceDependency),
    Match.tag("ExternalPortError", handlers.onExternalPort),
    Match.tag("InteractionValidationError", handlers.onInteractionValidation),
    Match.exhaustive
  )
}

/**
 * Match application errors from unknown source with fallback
 * 
 * @param handlers - Handlers for each application error type
 * @param onOther - Fallback handler for unknown errors
 * @returns A function that takes unknown error and returns a result
 */
export const matchApplicationErrorOrElse = <R>(
  handlers: ApplicationErrorHandlers<R>,
  onOther: (error: unknown) => R
) => {
  return (error: unknown): R => {
    if (!isApplicationError(error)) {
      return onOther(error)
    }

    // Type is now narrowed to ApplicationErrorType
    const matcher = matchApplicationError(handlers)
    return matcher(error) as R
  }
}

// ===== LAYER MAPPING COMBINATORS =====

/**
 * Map infrastructure errors to application layer errors
 * Provides consistent mapping from infrastructure to application layer
 * 
 * @param context - Context about the operation (dependency, operation)
 * @returns Effect combinator that maps infrastructure errors to application errors
 * 
 * @example
 * ```typescript
 * const saveDocument = repositoryCall.pipe(
 *   Effect.catchAll(fromInfraToApplication({
 *     dependency: "DocumentRepository",
 *     operation: "save"
 *   }))
 * )
 * ```
 */
export const fromInfraToApplication = (context: {
  readonly dependency: string
  readonly operation: string
}) => {
  return (error: unknown): Effect.Effect<never, PersistenceDependencyError | InfraUnexpected> => {
    return matchInfraErrorOrElse<PersistenceDependencyError | InfraUnexpected>(
      {
        onConflict: (e) =>
          Effect.fail(
            new PersistenceDependencyError(
              `Persistence conflict: ${e.message}`,
              context.dependency,
              context.operation,
              { originalError: e, constraint: e.constraint }
            )
          ),
        onValidation: (e) =>
          Effect.fail(
            new PersistenceDependencyError(
              `Persistence validation failed: ${e.message}`,
              context.dependency,
              context.operation,
              { originalError: e, field: e.field, value: e.value }
            )
          ),
        onNotFound: (e) =>
          Effect.fail(
            new PersistenceDependencyError(
              `Resource not found: ${e.message}`,
              context.dependency,
              context.operation,
              { originalError: e, entityType: e.entityType }
            )
          ),
        onUnexpected: (e) =>
          // Fail fast - don't wrap unexpected errors
          Effect.fail(e)
      },
      (e) =>
        // Unknown error - wrap as unexpected
        Effect.fail(
          new PersistenceDependencyError(
            `Unexpected persistence error: ${e instanceof Error ? e.message : String(e)}`,
            context.dependency,
            context.operation,
            { originalError: e }
          )
        )
    )(error)
  }
}

/**
 * Map domain errors to application layer errors
 * Provides consistent mapping from domain to application layer
 * 
 * @param context - Context about the operation (entity, operation)
 * @returns Effect combinator that maps domain errors to application errors
 * 
 * @example
 * ```typescript
 * const createDocument = domainOperation.pipe(
 *   Effect.catchAll(fromDomainToApplication({
 *     entity: "Document",
 *     operation: "create"
 *   }))
 * )
 * ```
 */
export const fromDomainToApplication = (context: {
  readonly entity: string
  readonly operation: string
}) => {
  return (error: unknown): Effect.Effect<never, InteractionValidationError | WorkflowDependencyError> => {
    return matchDomainErrorOrElse<InteractionValidationError | WorkflowDependencyError>(
      {
        onValidation: (e) =>
          Effect.fail(
            new InteractionValidationError(
              `Validation failed: ${e.message}`,
              e.field,
              e.value,
              { originalError: e, entity: context.entity, operation: context.operation }
            )
          ),
        onBusinessRuleViolation: (e) =>
          Effect.fail(
            new WorkflowDependencyError(
              `Business rule violation: ${e.message}`,
              context.entity,
              context.operation,
              { originalError: e }
            )
          )
      },
      (e) =>
        // Unknown error - wrap as workflow dependency error
        Effect.fail(
          new WorkflowDependencyError(
            `Unexpected domain error: ${e instanceof Error ? e.message : String(e)}`,
            context.entity,
            context.operation,
            { originalError: e }
          )
        )
    )(error)
  }
}

/**
 * Map external port errors to application layer errors
 * Use this for external service errors (file storage, auth, etc.)
 * 
 * @param context - Context about the port and operation
 * @returns Effect combinator that maps unknown errors to ExternalPortError
 * 
 * @example
 * ```typescript
 * const uploadFile = fileStoragePort.upload(...).pipe(
 *   Effect.catchAll(fromPortToApplication({
 *     port: "FileStorage",
 *     operation: "upload"
 *   }))
 * )
 * ```
 */
export const fromPortToApplication = (context: {
  readonly port: string
  readonly operation: string
}) => {
  return (error: unknown): Effect.Effect<never, ExternalPortError> => {
    return Effect.fail(
      new ExternalPortError(
        `External port error: ${error instanceof Error ? error.message : String(error)}`,
        context.port,
        context.operation,
        { originalError: error }
      )
    )
  }
}

/**
 * Fail fast on unexpected infrastructure errors
 * Use this to immediately fail without wrapping systemic errors
 * 
 * @param error - The infrastructure error to check
 * @returns Effect that fails with the error if unexpected, otherwise succeeds with the error
 * 
 * @example
 * ```typescript
 * const handleError = (error: InfrastructureErrorType) => {
 *   return failFastOnUnexpected(error).pipe(
 *     Effect.flatMap((expectedError) => {
 *       // Handle expected error
 *       return Effect.fail(new PersistenceDependencyError(...))
 *     })
 *   )
 * }
 * ```
 */
export const failFastOnUnexpected = <E extends InfrastructureErrorType>(
  error: E
): Effect.Effect<E, InfraUnexpected> => {
  return isUnexpectedInfraError(error)
    ? Effect.fail(error)
    : Effect.succeed(error)
}

