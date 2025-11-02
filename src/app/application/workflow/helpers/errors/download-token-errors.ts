import { Effect, Match, pipe } from "effect"
import {
  fromDomainToApplication,
  fromInfraToApplication,
  fromPortToApplication,
  failFastOnUnexpected,
  isInfraError
} from "../../../../shared/error-matching"
import type { InfraUnexpected, InfrastructureErrorType } from "@infra/errors/infrastructure.errors"
import { DownloadTokenNotFoundError, DownloadTokenAlreadyUsedError } from "@domain/downloadToken/download-token.error"
import {
  WorkflowDependencyError,
  PersistenceDependencyError,
  PermissionCheckError,
  DownloadTokenValidationError,
  InteractionValidationError,
  ExternalPortError,
  FileNotFoundError
} from "@application/errors/application.errors"
import { FileStorageError, FileStorageUnexpected } from "@application/services/ports/file-storage.port"

// ===== DOWNLOAD TOKEN PERSISTENCE ERROR MAPPERS =====

/**
 * Map infrastructure errors from download token persistence operations to application errors
 * Uses fromInfraToApplication helper and handles unexpected errors with fail-fast
 */
export const mapDownloadTokenPersistenceError = (
  operation: "save" | "findById" | "findByToken" | "findByDocumentId" | "markAsUsed" | "delete"
) => {
  return (error: unknown): Effect.Effect<never, PersistenceDependencyError | InfraUnexpected> => {
    return pipe(
      fromInfraToApplication({
        dependency: "DownloadTokenRepository",
        operation,
      })(error),
      // Fail fast on unexpected infrastructure errors
      Effect.catchTag("InfraUnexpected", (e) => Effect.fail(e))
    )
  }
}

// ===== DOWNLOAD TOKEN DOMAIN ERROR MAPPERS =====

/**
 * Match download-token-specific domain errors using declarative matching
 * Uses extended DomainErrorType union - now handled by fromDomainToApplication
 */
const matchDownloadTokenSpecificError = (context: { operation: string; tokenValue: string }) => {
  return (error: unknown): Effect.Effect<unknown, DownloadTokenValidationError | PersistenceDependencyError> => {
    return Match.value(error).pipe(
      Match.when(
        (e: unknown): e is DownloadTokenAlreadyUsedError =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "DownloadTokenAlreadyUsedError",
        (e: DownloadTokenAlreadyUsedError) =>
          Effect.fail(
            new DownloadTokenValidationError(
              `Token already used: ${e.message}`,
              context.tokenValue,
              "ALREADY_USED",
              { originalError: e }
            )
          )
      ),
      Match.when(
        (e: unknown): e is DownloadTokenNotFoundError =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "DownloadTokenNotFoundError",
        (e: DownloadTokenNotFoundError) =>
          Effect.fail(
            new PersistenceDependencyError(
              `Download token not found: ${e.message}`,
              "DownloadTokenRepository",
              context.operation,
              { originalError: e }
            )
          )
      ),
      Match.orElse((remainingError: unknown) => Effect.succeed(remainingError))
    )
  }
}

/**
 * Map domain errors from download token operations to application errors
 * Uses declarative Match.value with failFastOnUnexpected for infra errors and shared matchers for domain errors
 * Each mapper first calls failFastOnUnexpected for infra/port errors, then uses shared matchers for expected cases
 */
export const mapDownloadTokenDomainError = (
  context: string,
  tokenValue: string
) => {
  return (error: unknown): Effect.Effect<never, DownloadTokenValidationError | InteractionValidationError | PersistenceDependencyError | PermissionCheckError | WorkflowDependencyError | InfraUnexpected> => {
    return Match.value(error).pipe(
      // Handle infrastructure errors first with fail-fast for unexpected errors
      Match.when(
        (e: unknown): e is InfrastructureErrorType => isInfraError(e),
        (e: InfrastructureErrorType) =>
          pipe(
            failFastOnUnexpected(e),
            Effect.flatMap((expected) =>
              fromInfraToApplication({
                dependency: "DownloadTokenRepository",
                operation: context,
              })(expected)
            ),
            Effect.catchTag("InfraUnexpected", (unexpected) => Effect.fail(unexpected))
          )
      ),
      // Pass through existing application errors using _tag checks
      Match.when(
        (e: unknown): e is PermissionCheckError =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "PermissionCheckError",
        (e: PermissionCheckError) => Effect.fail(e)
      ),
      Match.when(
        (e: unknown): e is WorkflowDependencyError =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "WorkflowDependencyError",
        (e: WorkflowDependencyError) => Effect.fail(e)
      ),
      Match.when(
        (e: unknown): e is DownloadTokenValidationError =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "DownloadTokenValidationError",
        (e: DownloadTokenValidationError) => Effect.fail(e)
      ),
      // Handle download-token-specific domain errors
      Match.orElse((remainingError: unknown) =>
        pipe(
          matchDownloadTokenSpecificError({ operation: context, tokenValue })(remainingError),
          Effect.flatMap((stillRemaining) =>
            // Then handle base domain errors (ValidationError, BusinessRuleViolationError)
            fromDomainToApplication({
              entity: "DownloadToken",
              operation: context,
            })(stillRemaining)
          )
        )
      )
    )
  }
}

// ===== FILE STORAGE ERROR MAPPERS (for download token workflows) =====

/**
 * Match FileStorageError with special handling for NOT_FOUND code
 * Maps NOT_FOUND to FileNotFoundError, other codes to ExternalPortError via fromPortToApplication
 * FileStorageUnexpected fails fast without wrapping
 */
const matchFileStorageErrorForDownload = (context: { fileKey: string; operation: string }) => {
  return (error: unknown): Effect.Effect<unknown, FileNotFoundError | ExternalPortError | FileStorageUnexpected> => {
    return Match.value(error).pipe(
      // Handle FileStorageUnexpected (port errors) - fail fast without wrapping
      Match.when(
        (e: unknown): e is FileStorageUnexpected =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "FileStorageUnexpected",
        (e: FileStorageUnexpected) => Effect.fail(e) // Fail fast - don't wrap
      ),
      Match.when(
        (e: unknown): e is FileStorageError =>
          e !== null &&
          typeof e === "object" &&
          "code" in e &&
          (e as any).code === "NOT_FOUND" &&
          e instanceof Error,
        (e: FileStorageError) =>
          Effect.fail(
            new FileNotFoundError(
              `File not found in storage: ${e.message}`,
              context.fileKey,
              { originalError: e }
            )
          )
      ),
      Match.when(
        (e: unknown): e is FileStorageError =>
          e !== null &&
          typeof e === "object" &&
          e instanceof Error &&
          e.constructor.name === "FileStorageError",
        (e: FileStorageError) =>
          fromPortToApplication({
            port: "FileStoragePort",
            operation: context.operation,
          })(e)
      ),
      Match.orElse((remainingError: unknown) => Effect.succeed(remainingError))
    )
  }
}

/**
 * Map errors from file storage operations when downloading by token
 * Uses Match.when for existing application errors, handles FileStorageError with special NOT_FOUND case
 */
export const mapDownloadTokenFileStorageError = (
  context: { fileKey: string; operation: string }
) => {
  return (error: unknown): Effect.Effect<never, FileNotFoundError | WorkflowDependencyError | ExternalPortError | FileStorageUnexpected> => {
    return Match.value(error).pipe(
      // Handle FileStorageUnexpected (port errors) first - fail fast without wrapping
      Match.when(
        (e: unknown): e is FileStorageUnexpected =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "FileStorageUnexpected",
        (e: FileStorageUnexpected) => Effect.fail(e) // Fail fast - don't wrap
      ),
      // Pass through existing application errors using _tag checks
      Match.when(
        (e: unknown): e is FileNotFoundError =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "FileNotFoundError",
        (e: FileNotFoundError) => Effect.fail(e)
      ),
      Match.when(
        (e: unknown): e is WorkflowDependencyError =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "WorkflowDependencyError",
        (e: WorkflowDependencyError) => Effect.fail(e)
      ),
      // Handle FileStorageError and other errors (port errors)
      Match.orElse((remainingError: unknown) =>
        pipe(
          matchFileStorageErrorForDownload(context)(remainingError),
          Effect.flatMap((stillRemaining) =>
            Match.value(stillRemaining).pipe(
              // Pass through application errors
              Match.when(
                (e: unknown): e is FileNotFoundError =>
                  e !== null &&
                  typeof e === "object" &&
                  "_tag" in e &&
                  e._tag === "FileNotFoundError",
                (e: FileNotFoundError) => Effect.fail(e)
              ),
              Match.when(
                (e: unknown): e is WorkflowDependencyError =>
                  e !== null &&
                  typeof e === "object" &&
                  "_tag" in e &&
                  e._tag === "WorkflowDependencyError",
                (e: WorkflowDependencyError) => Effect.fail(e)
              ),
              // Everything else → WorkflowDependencyError
              Match.orElse((finalRemaining: unknown) =>
                Effect.fail(
                  new WorkflowDependencyError(
                    `File storage ${context.operation} failed: ${finalRemaining instanceof Error ? finalRemaining.message : String(finalRemaining)}`,
                    "FileStoragePort",
                    context.operation,
                    { originalError: finalRemaining }
                  )
                )
              )
            )
          ),
          // Handle failures from matchFileStorageErrorForDownload - propagate all errors as-is
          Effect.catchAll((failedError) => Effect.fail(failedError as FileStorageUnexpected | FileNotFoundError | ExternalPortError | WorkflowDependencyError))
        )
      )
    )
  }
}

