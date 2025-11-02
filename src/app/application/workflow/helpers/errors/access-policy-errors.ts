import { Effect, Match, pipe } from "effect"
import {
  fromDomainToApplication,
  fromInfraToApplication,
  failFastOnUnexpected,
  isInfraError
} from "../../../../shared/error-matching"
import type { InfraUnexpected, InfrastructureErrorType } from "@infra/errors/infrastructure.errors"
import { AccessPolicyNotFoundError, AccessPolicyConflictError } from "@domain/accessPolicy/access-policy.error"
import {
  WorkflowDependencyError,
  PersistenceDependencyError,
  AccessPolicyCreationError,
  InteractionValidationError
} from "@application/errors/application.errors"

// ===== ACCESS POLICY PERSISTENCE ERROR MAPPERS =====

/**
 * Match access-policy-specific domain errors using declarative matching
 * Uses extended DomainErrorType union - now handled by fromDomainToApplication
 * Maps conflict errors to AccessPolicyCreationError
 */
const matchAccessPolicySpecificError = (
  context: { operation: string; policy?: { resourceId: string; subjectId?: string | null; role?: string | null } }
) => {
  return (error: unknown): Effect.Effect<unknown, AccessPolicyCreationError> => {
    return Match.value(error).pipe(
      Match.when(
        (e: unknown): e is AccessPolicyConflictError =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "AccessPolicyConflictError",
        (e: AccessPolicyConflictError) =>
          Effect.fail(
            new AccessPolicyCreationError(
              `Access policy already exists: ${e.message}`,
              context.policy?.resourceId || "unknown",
              context.policy?.subjectId || "unknown",
              context.policy?.role || "unknown",
              { originalError: e }
            )
          )
      ),
      Match.orElse((remainingError: unknown) => Effect.succeed(remainingError))
    )
  }
}

/**
 * Map infrastructure errors from access policy persistence operations to application errors
 * Uses declarative Match.value with failFastOnUnexpected for infra errors and shared matchers
 * For save operations, also handles AccessPolicyConflictError
 * Each mapper first calls failFastOnUnexpected for infra/port errors, then uses shared matchers for expected cases
 */
export const mapAccessPolicyPersistenceError = (
  policy?: { resourceId: string; subjectId?: string; role?: string },
  operation: "save" | "findById" | "findByResourceId" = "save"
) => {
  return (error: unknown): Effect.Effect<never, AccessPolicyCreationError | PersistenceDependencyError | InfraUnexpected> => {
    return Match.value(error).pipe(
      // Handle infrastructure errors first with fail-fast for unexpected errors
      Match.when(
        (e: unknown): e is InfrastructureErrorType => isInfraError(e),
        (e: InfrastructureErrorType) =>
          pipe(
            failFastOnUnexpected(e),
            Effect.flatMap((expected) =>
              fromInfraToApplication({
                dependency: "AccessPolicyRepository",
                operation,
              })(expected)
            ),
            Effect.catchTag("InfraUnexpected", (unexpected) => Effect.fail(unexpected))
          )
      ),
      // Handle access-policy-specific errors (conflict) - only for save operations
      Match.when(
        (e: unknown): e is AccessPolicyConflictError =>
          operation === "save" &&
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "AccessPolicyConflictError",
        (e: AccessPolicyConflictError) =>
          matchAccessPolicySpecificError({
            operation: "save",
            ...(policy && { policy })
          })(e).pipe(
            Effect.flatMap((remaining) =>
              pipe(
                fromInfraToApplication({
                  dependency: "AccessPolicyRepository",
                  operation,
                })(remaining),
                Effect.catchTag("InfraUnexpected", (unexpected) => Effect.fail(unexpected))
              )
            ),
            Effect.catchTag("AccessPolicyCreationError", (conflictError) => Effect.fail(conflictError))
          )
      ),
      // Everything else - map as infrastructure error
      Match.orElse((finalRemaining: unknown) =>
        operation === "save"
          ? pipe(
              matchAccessPolicySpecificError({
                operation: "save",
                ...(policy && { policy })
              })(finalRemaining),
              Effect.flatMap((stillRemaining) =>
                pipe(
                  fromInfraToApplication({
                    dependency: "AccessPolicyRepository",
                    operation,
                  })(stillRemaining),
                  Effect.catchTag("InfraUnexpected", (e) => Effect.fail(e))
                )
              ),
              Effect.catchTag("AccessPolicyCreationError", (conflictError) => Effect.fail(conflictError))
            )
          : pipe(
              fromInfraToApplication({
                dependency: "AccessPolicyRepository",
                operation,
              })(finalRemaining),
              Effect.catchTag("InfraUnexpected", (e) => Effect.fail(e))
            )
      )
    )
  }
}

// ===== ACCESS POLICY DOMAIN ERROR MAPPERS =====

/**
 * Match access-policy-specific domain errors for domain operations using declarative matching
 * Uses extended DomainErrorType union - now handled by fromDomainToApplication
 * Maps AccessPolicyNotFoundError to WorkflowDependencyError
 */
const matchAccessPolicyDomainSpecificError = (context: { operation: string }) => {
  return (error: unknown): Effect.Effect<unknown, WorkflowDependencyError> => {
    return Match.value(error).pipe(
      Match.when(
        (e: unknown): e is AccessPolicyNotFoundError =>
          e !== null &&
          typeof e === "object" &&
          "_tag" in e &&
          e._tag === "AccessPolicyNotFoundError",
        (e: AccessPolicyNotFoundError) =>
          Effect.fail(
            new WorkflowDependencyError(
              `Access policy not found: ${e.message}`,
              "AccessPolicyRepository",
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
 * Map domain errors from access policy operations to application errors
 * Chains access-policy-specific error matching before fromDomainToApplication helper
 */
export const mapAccessPolicyDomainError = (context: string) => {
  return (error: unknown): Effect.Effect<never, WorkflowDependencyError | InteractionValidationError> => {
    return pipe(
      // First handle access-policy-specific errors (not in DomainErrorType union)
      matchAccessPolicyDomainSpecificError({ operation: context })(error),
      // Then handle base domain errors (ValidationError, BusinessRuleViolationError)
      Effect.flatMap((remainingError) =>
        fromDomainToApplication({
          entity: "AccessPolicy",
          operation: context,
        })(remainingError)
      )
    )
  }
}

/**
 * Map errors from access policy deletion operations
 * Handles access-policy-specific errors and infrastructure errors
 */
export const mapAccessPolicyDeletionError = (
  error: unknown
): Effect.Effect<never, WorkflowDependencyError | PersistenceDependencyError | InfraUnexpected> => {
  return pipe(
    // First handle access-policy-specific errors (not found)
    matchAccessPolicyDomainSpecificError({ operation: "delete" })(error),
    // Then handle infrastructure errors
    Effect.flatMap((remainingError) =>
      pipe(
        fromInfraToApplication({
          dependency: "AccessPolicyRepository",
          operation: "delete",
        })(remainingError),
        // Fail fast on unexpected infrastructure errors
        Effect.catchTag("InfraUnexpected", (e) => Effect.fail(e))
      )
    )
  )
}

