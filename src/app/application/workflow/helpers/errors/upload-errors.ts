import { Effect, Match, ParseResult, pipe } from "effect"
import {
  fromInfraToApplication,
  fromPortToApplication,
  failFastOnUnexpected,
  isInfraError
} from "../../../../shared/error-matching"
import type { InfraUnexpected, InfrastructureErrorType } from "@infra/errors/infrastructure.errors"
import {
  WorkflowDependencyError,
  PersistenceDependencyError,
  ExternalPortError,
  UploadInitiationError,
  UploadConfirmationError,
  ChecksumValidationError,
  FileNotFoundError,
  PermissionCheckError
} from "@application/errors/application.errors"
import { FileStorageError, FileStorageUnexpected } from "@application/services/ports/file-storage.port"
import { matchDocumentSpecificError } from "./document-errors"

// ===== UPLOAD WORKFLOW ERROR MAPPERS =====

/**
 * Map errors from upload initiation operations
 * Uses declarative Match.value with failFastOnUnexpected for infra/port errors and shared matchers for domain errors
 * Each mapper first calls failFastOnUnexpected for infra/port errors, then uses shared matchers for expected cases
 */
export const mapUploadInitiationError = (
  context: { documentId: string }
) => {
  return (error: unknown): Effect.Effect<never, UploadInitiationError | PermissionCheckError | WorkflowDependencyError | FileNotFoundError | ExternalPortError | ParseResult.ParseError | PersistenceDependencyError | InfraUnexpected | FileStorageUnexpected> => {
    return Match.value(error).pipe(
      // Handle infrastructure errors first with fail-fast for unexpected errors
      Match.when(
        (e: unknown): e is InfrastructureErrorType => isInfraError(e),
        (e: InfrastructureErrorType) =>
          pipe(
            failFastOnUnexpected(e),
            Effect.flatMap((expected) =>
              fromInfraToApplication({
                dependency: "DocumentAggregateRepository",
                operation: "findById",
              })(expected)
            ),
            Effect.catchTag("InfraUnexpected", (unexpected) => Effect.fail(unexpected))
          )
      ),
      // Handle FileStorageUnexpected (port errors) - fail fast without wrapping
      Match.when(
        (e: unknown): e is FileStorageUnexpected =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "FileStorageUnexpected",
        (e: FileStorageUnexpected) => Effect.fail(e) // Fail fast - don't wrap
      ),
      // Handle FileStorageError (port errors) with special NOT_FOUND case
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
              context.documentId,
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
            operation: "uploadFile",
          })(e)
      ),
      // Pass through ParseResult.ParseError for schema validation failures
      Match.when(
        (e: unknown): e is ParseResult.ParseError =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "ParseError",
        (e: ParseResult.ParseError) => Effect.fail(e)
      ),
      // Pass through existing application errors using _tag checks
      Match.when(
        (e: unknown): e is UploadInitiationError =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "UploadInitiationError",
        (e: UploadInitiationError) => Effect.fail(e)
      ),
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
        (e: unknown): e is FileNotFoundError =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "FileNotFoundError",
        (e: FileNotFoundError) => Effect.fail(e)
      ),
      // Handle domain errors using shared matchers
      Match.orElse((remainingError: unknown) =>
        pipe(
          matchDocumentSpecificError({ operation: "findById" })(remainingError),
          Effect.flatMap((finalRemaining) =>
            // Everything else → UploadInitiationError
            Effect.fail(
              new UploadInitiationError(
                `Upload initiation failed: ${finalRemaining instanceof Error ? finalRemaining.message : String(finalRemaining)}`,
                context.documentId,
                "unknown",
                { originalError: finalRemaining }
              )
            )
          )
        )
      )
    )
  }
}

/**
 * Map errors from upload confirmation operations
 * Uses declarative Match.value with failFastOnUnexpected for infra/port errors and shared matchers for domain errors
 * Each mapper first calls failFastOnUnexpected for infra/port errors, then uses shared matchers for expected cases
 */
export const mapUploadConfirmationError = (
  context: { documentId: string }
) => {
  return (error: unknown): Effect.Effect<never, UploadConfirmationError | ChecksumValidationError | FileNotFoundError | PermissionCheckError | WorkflowDependencyError | PersistenceDependencyError | ExternalPortError | InfraUnexpected | ParseResult.ParseError | FileStorageUnexpected> => {
    return Match.value(error).pipe(
      // Handle infrastructure errors first with fail-fast for unexpected errors
      Match.when(
        (e: unknown): e is InfrastructureErrorType => isInfraError(e),
        (e: InfrastructureErrorType) =>
          pipe(
            failFastOnUnexpected(e),
            Effect.flatMap((expected) =>
              fromInfraToApplication({
                dependency: "DocumentAggregateRepository",
                operation: "save",
              })(expected)
            ),
            Effect.catchTag("InfraUnexpected", (unexpected) => Effect.fail(unexpected))
          )
      ),
      // Handle FileStorageUnexpected (port errors) - fail fast without wrapping
      Match.when(
        (e: unknown): e is FileStorageUnexpected =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "FileStorageUnexpected",
        (e: FileStorageUnexpected) => Effect.fail(e) // Fail fast - don't wrap
      ),
      // Handle FileStorageError (port errors) with special NOT_FOUND case
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
              context.documentId,
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
            operation: "downloadFile",
          })(e)
      ),
      // Pass through ParseResult.ParseError for schema validation failures
      Match.when(
        (e: unknown): e is ParseResult.ParseError =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "ParseError",
        (e: ParseResult.ParseError) => Effect.fail(e)
      ),
      // Pass through existing application errors using _tag checks
      Match.when(
        (e: unknown): e is UploadConfirmationError =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "UploadConfirmationError",
        (e: UploadConfirmationError) => Effect.fail(e)
      ),
      Match.when(
        (e: unknown): e is ChecksumValidationError =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "ChecksumValidationError",
        (e: ChecksumValidationError) => Effect.fail(e)
      ),
      Match.when(
        (e: unknown): e is FileNotFoundError =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "FileNotFoundError",
        (e: FileNotFoundError) => Effect.fail(e)
      ),
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
      // Handle domain errors using shared matchers
      Match.orElse((remainingError: unknown) =>
        pipe(
          matchDocumentSpecificError({ operation: "findById" })(remainingError),
          Effect.flatMap((stillRemaining) =>
            // Everything else → UploadConfirmationError with CHECKSUM_MISMATCH as generic failure
            Effect.fail(
              new UploadConfirmationError(
                `Upload confirmation failed: ${stillRemaining instanceof Error ? stillRemaining.message : String(stillRemaining)}`,
                context.documentId,
                "",
                "CHECKSUM_MISMATCH",
                { originalError: stillRemaining }
              )
            )
          )
        )
      )
    )
  }
}

// ===== FILE STORAGE ERROR MAPPERS =====

/**
 * Map errors from file storage operations
 * Uses Match for existing application errors, handles FileStorageError with special NOT_FOUND case
 */
export const mapFileStorageError = (
  context: { operation: string; fileKey?: string }
) => {
  return (error: unknown): Effect.Effect<never, FileNotFoundError | WorkflowDependencyError | ExternalPortError | FileStorageUnexpected> => {
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
      // Handle FileStorageError with special NOT_FOUND case (port errors)
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
              context.fileKey || "unknown",
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
      // Everything else → WorkflowDependencyError
      Match.orElse((remainingError: unknown) =>
        Effect.fail(
          new WorkflowDependencyError(
            `File storage ${context.operation} failed: ${remainingError instanceof Error ? remainingError.message : String(remainingError)}`,
            "FileStoragePort",
            context.operation,
            { originalError: remainingError }
          )
        )
      )
    )
  }
}

