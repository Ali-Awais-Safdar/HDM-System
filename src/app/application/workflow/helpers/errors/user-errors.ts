import { Effect, Match, pipe } from "effect"
import {
  fromDomainToApplication,
  fromInfraToApplication,
  failFastOnUnexpected,
  isInfraError
} from "../../../../shared/error-matching"
import type { InfraUnexpected, InfrastructureErrorType } from "@infra/errors/infrastructure.errors"
import {
  UserValidationError,
  UserAlreadyExistsError,
  UserNotFoundError
} from "@domain/user/user.error"
import {
  PersistenceDependencyError,
  InteractionValidationError,
  WorkflowDependencyError
} from "@application/errors/application.errors"

// ===== USER PERSISTENCE ERROR MAPPERS =====

/**
 * Map infrastructure errors from user persistence operations to application errors
 * Uses declarative Match.value with failFastOnUnexpected for infra errors and shared matchers
 */
export const mapUserPersistenceError = (
  operation: "save" | "findById" | "findByEmail"
) => {
  return (error: unknown): Effect.Effect<never, PersistenceDependencyError | InteractionValidationError | InfraUnexpected> => {
    return pipe(
      Match.value(error).pipe(
        // Handle user-specific domain errors first
        Match.when(
          (e: unknown): e is UserAlreadyExistsError => e instanceof UserAlreadyExistsError,
          (e: UserAlreadyExistsError) =>
            Effect.fail(
              new PersistenceDependencyError(
                `User already exists: ${e.message}`,
                "UserRepository",
                operation,
                { originalError: e, field: e.field, value: e.value }
              )
            )
        ),
        Match.when(
          (e: unknown): e is UserValidationError => e instanceof UserValidationError,
          (e: UserValidationError) =>
            Effect.fail(
              new InteractionValidationError(
                `User validation failed: ${e.message}`,
                e.field,
                e.value,
                { originalError: e, operation }
              )
            )
        ),
        Match.when(
          (e: unknown): e is UserNotFoundError => e instanceof UserNotFoundError,
          (e: UserNotFoundError) =>
            Effect.fail(
              new PersistenceDependencyError(
                `User not found: ${e.message}`,
                "UserRepository",
                operation,
                { originalError: e, field: e.field, value: e.value }
              )
            )
        ),
        // Handle infrastructure errors with fail-fast for unexpected errors
        Match.when(
          (e: unknown): e is InfrastructureErrorType => isInfraError(e),
          (e: InfrastructureErrorType) =>
            pipe(
              failFastOnUnexpected(e),
              Effect.flatMap((expected) =>
                fromInfraToApplication({
                  dependency: "UserRepository",
                  operation,
                })(expected)
              ),
              Effect.catchTag("InfraUnexpected", (unexpected) => Effect.fail(unexpected))
            )
        ),
        // Everything else - map as infrastructure error
        Match.orElse((remainingError: unknown) =>
          pipe(
            fromInfraToApplication({
              dependency: "UserRepository",
              operation,
            })(remainingError),
            Effect.catchTag("InfraUnexpected", (e) => Effect.fail(e))
          )
        )
      )
    )
  }
}

// ===== USER DOMAIN ERROR MAPPERS =====

/**
 * Map domain errors from user operations to application errors
 * Uses declarative Match.value for user-specific errors and chains fromDomainToApplication helper
 * Uses extended DomainErrorType union - now handled by fromDomainToApplication
 */
export const mapUserDomainError = (context: string) => {
  return (error: unknown): Effect.Effect<never, InteractionValidationError | WorkflowDependencyError> => {
    return Match.value(error).pipe(
      // Handle UserValidationError → InteractionValidationError
      Match.when(
        (e: unknown): e is UserValidationError => e instanceof UserValidationError,
        (e: UserValidationError) =>
          Effect.fail(
            new InteractionValidationError(
              `User ${context} failed: ${e.message}`,
              e.field,
              e.value,
              { originalError: e }
            )
          )
      ),
      // Handle UserNotFoundError → WorkflowDependencyError
      Match.when(
        (e: unknown): e is UserNotFoundError => e instanceof UserNotFoundError,
        (e: UserNotFoundError) =>
          Effect.fail(
            new WorkflowDependencyError(
              `User not found: ${e.message}`,
              "UserEntity",
              context,
              { originalError: e }
            )
          )
      ),
      // Handle UserAlreadyExistsError → WorkflowDependencyError
      Match.when(
        (e: unknown): e is UserAlreadyExistsError => e instanceof UserAlreadyExistsError,
        (e: UserAlreadyExistsError) =>
          Effect.fail(
            new WorkflowDependencyError(
              `User ${context} failed: ${e.message}`,
              "UserEntity",
              context,
              { originalError: e }
            )
          )
      ),
      // Handle base domain errors (ValidationError, BusinessRuleViolationError)
      Match.orElse((remainingError: unknown) =>
        fromDomainToApplication({
          entity: "User",
          operation: context,
        })(remainingError)
      )
    )
  }
}

