import { Effect, Match, pipe } from "effect"
import {
  fromDomainToApplication,
  fromInfraToApplication,
  failFastOnUnexpected,
  isInfraError,
  isDomainError
} from "../../../../shared/error-matching"
import type { InfraUnexpected, InfrastructureErrorType } from "@infra/errors/infrastructure.errors"
import { DocumentNotFoundError } from "@domain/document/document.error"
import { DocumentVersionNotFoundError } from "@domain/documentVersion/document-version.error"
import type { DomainErrorType } from "@domain/utils/base.errors"
import {
  WorkflowDependencyError,
  PersistenceDependencyError,
  PermissionCheckError,
  InteractionValidationError
} from "@application/errors/application.errors"

// ===== DOCUMENT PERSISTENCE ERROR MAPPERS =====

/**
 * Map infrastructure errors from document persistence operations to application errors
 * Uses fromInfraToApplication helper and handles unexpected errors with fail-fast
 */
export const mapDocumentPersistenceError = (
  operation: "save" | "search" | "findById" | "loadById"
) => {
  return (error: unknown): Effect.Effect<never, PersistenceDependencyError | InfraUnexpected> => {
    return pipe(
      fromInfraToApplication({
        dependency: "DocumentAggregateRepository",
        operation,
      })(error),
      // Fail fast on unexpected infrastructure errors
      Effect.catchTag("InfraUnexpected", (e) => Effect.fail(e))
    )
  }
}

/**
 * Map infrastructure errors from document version persistence operations to application errors
 * Uses fromInfraToApplication helper and handles unexpected errors with fail-fast
 */
export const mapDocumentVersionPersistenceError = (
  operation: "save" | "findDocumentIdByVersionId"
) => {
  return (error: unknown): Effect.Effect<never, PersistenceDependencyError | InfraUnexpected> => {
    return pipe(
      fromInfraToApplication({
        dependency: "DocumentAggregateRepository",
        operation,
      })(error),
      // Fail fast on unexpected infrastructure errors
      Effect.catchTag("InfraUnexpected", (e) => Effect.fail(e))
    )
  }
}

/**
 * Map errors from document version operations to application errors
 * Uses declarative Match.value for all error types, handling infra/port errors first with fail-fast
 * Each mapper first calls failFastOnUnexpected for infra errors, then uses shared matchers for expected cases
 */
export const mapDocumentVersionError = (
  source: "getVersion" | "findDocumentIdByVersionId" | "loadById"
) => {
  return (error: unknown): Effect.Effect<never, WorkflowDependencyError | PermissionCheckError | PersistenceDependencyError | InteractionValidationError | InfraUnexpected> => {
    return Match.value(error).pipe(
      // Handle infrastructure errors first with fail-fast for unexpected errors
      Match.when(
        (e: unknown): e is InfrastructureErrorType => isInfraError(e),
        (e: InfrastructureErrorType) =>
          pipe(
            failFastOnUnexpected(e),
            Effect.flatMap((expected) =>
              // Map expected infrastructure errors to application errors
              fromInfraToApplication({
                dependency: "DocumentAggregateRepository",
                operation: source,
              })(expected)
            ),
            // Fail fast on unexpected infrastructure errors
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
      // Handle domain errors using shared matchers
      Match.when(
        (e: unknown): e is DocumentVersionNotFoundError =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "DocumentVersionNotFoundError",
        (e: DocumentVersionNotFoundError) =>
          Effect.fail(
            new WorkflowDependencyError(
              `Document version not found: ${e.message}`,
              "DocumentAggregateRepository",
              source,
              { originalError: e }
            )
          )
      ),
      Match.when(
        (e: unknown): e is DomainErrorType => isDomainError(e),
        (e: DomainErrorType) =>
          fromDomainToApplication({
            entity: "DocumentVersion",
            operation: source,
          })(e)
      ),
      // Generic error mapping for unknown errors
      Match.orElse((remainingError: unknown) =>
        Effect.fail(
          new WorkflowDependencyError(
            `Document version ${source} failed: ${remainingError instanceof Error ? remainingError.message : String(remainingError)}`,
            "DocumentAggregateRepository",
            source,
            { originalError: remainingError }
          )
        )
      )
    )
  }
}

// ===== DOCUMENT DOMAIN ERROR MAPPERS =====

/**
 * Match document-specific domain errors using declarative matching
 * Uses extended DomainErrorType union - now handled by fromDomainToApplication
 * This function is kept for backward compatibility but can be simplified
 * Exported for reuse in other error mappers (e.g., upload-errors.ts)
 */
export const matchDocumentSpecificError = (context: { operation: string }) => {
  return (error: unknown): Effect.Effect<unknown, WorkflowDependencyError> => {
    return Match.value(error).pipe(
      Match.when(
        (e: unknown): e is DocumentNotFoundError =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "DocumentNotFoundError",
        (e: DocumentNotFoundError) =>
          Effect.fail(
            new WorkflowDependencyError(
              `Document not found: ${e.message}`,
              "DocumentAggregateRepository",
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
 * Map domain errors from document operations to application errors
 * Uses declarative Match.type<DomainErrorType>() for all domain errors
 * Module-specific errors are handled first, then base errors via fromDomainToApplication
 */
export const mapDocumentDomainError = (context: string) => {
  return (error: unknown): Effect.Effect<never, WorkflowDependencyError | InteractionValidationError> => {
    return pipe(
      // First handle document-specific errors using declarative matching
      matchDocumentSpecificError({ operation: context })(error),
      // Then handle base domain errors (ValidationError, BusinessRuleViolationError)
      // Module-specific errors pass through fromDomainToApplication for application layer handling
      Effect.flatMap((remainingError) =>
        fromDomainToApplication({
          entity: "Document",
          operation: context,
        })(remainingError)
      )
    )
  }
}

// ===== GENERIC ERROR MAPPERS =====

/**
 * Map unknown errors to WorkflowDependencyError using declarative Match.value
 */
export const mapToWorkflowDependencyError = (
  component: string,
  operation: string
) => {
  return (error: unknown): WorkflowDependencyError => {
    return Match.value(error).pipe(
      Match.when(
        (e: unknown): e is WorkflowDependencyError =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "WorkflowDependencyError",
        (e: WorkflowDependencyError) => e
      ),
      Match.orElse((remainingError: unknown) =>
        new WorkflowDependencyError(
          `${operation} failed: ${remainingError instanceof Error ? remainingError.message : String(remainingError)}`,
          component,
          operation,
          { originalError: remainingError }
        )
      )
    )
  }
}

