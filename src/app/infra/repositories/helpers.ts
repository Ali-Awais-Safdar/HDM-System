import { Effect as E, Option as O, pipe, Clock, Match } from "effect"
import { ValidationError, type DomainError } from "@domain/utils/base.errors"
import { translateDbError } from "@infra/db/errors"
import type { InfrastructureErrorType, InfraConflict, InfraValidation, InfraNotFound } from "@infra/errors/infrastructure.errors"

/**
 * Shared repository query helpers using Effect pattern matching.
 * 
 * These helpers:
 * - Wrap Drizzle calls in Effect.tryPromise
 * - Use translateDbError for infrastructure error translation
 * - Map infrastructure errors to domain errors at the repository boundary
 * - Maintain fail-fast for unexpected infrastructure errors
 */

type FromDbMapper<TModel, TEntity, TValidationError extends ValidationError> = (
  model: TModel
) => E.Effect<TEntity, TValidationError, Clock.Clock>

// ===== INFRASTRUCTURE TO DOMAIN ERROR MAPPING =====


/**
 * Maps InfrastructureErrorType to domain errors with fail-fast for unexpected errors.
 * 
 * This function:
 * - Fails fast on InfraUnexpected (throws as defect using Effect.die to fail immediately)
 * - Maps expected errors (Conflict, Validation, NotFound) to domain errors
 * 
 * Use this when mapping infrastructure errors at the repository boundary.
 * Unexpected errors fail immediately and should not be caught at domain layer.
 * 
 * @param entityType - The entity type for error context
 * @param createNotFoundError - Factory function to create domain-specific NotFoundError
 * @returns Function that maps InfrastructureErrorType to ValidationError or TNotFoundError
 */
export function mapInfraErrorToDomainWithFailFast<TNotFoundError extends DomainError>(
  entityType: string,
  createNotFoundError: (message: string, field?: string, value?: unknown) => TNotFoundError
) {
  return (error: InfrastructureErrorType): E.Effect<never, ValidationError | TNotFoundError> => {
    // Fail fast on unexpected errors - throw as defect to fail immediately
    if (error._tag === "InfraUnexpected") {
      return E.die(error)
    }
    
    // At this point, TypeScript knows error is not InfraUnexpected
    // Narrow to expected infrastructure errors only
    type ExpectedInfraError = InfraConflict | InfraValidation | InfraNotFound
    
    // Map expected errors to domain errors
    return Match.value(error as ExpectedInfraError).pipe(
      Match.when(
        (e): e is InfraConflict => e._tag === "InfraConflict",
        (e) =>
        E.fail(
          new ValidationError(
            `${entityType} conflict: ${e.message}`,
            e.constraint,
            undefined,
            { originalError: e, entityType, constraint: e.constraint }
            )
          )
        ),
      Match.when(
        (e): e is InfraValidation => e._tag === "InfraValidation",
        (e) =>
        E.fail(
          new ValidationError(
            `${entityType} validation failed: ${e.message}`,
            e.field,
            e.value,
            { originalError: e, entityType, constraint: e.constraint }
            )
          )
        ),
      Match.when(
        (e): e is InfraNotFound => e._tag === "InfraNotFound",
        (e) =>
        E.fail(
          createNotFoundError(
            e.message,
            e.field,
            e.value
          )
          )
      ),
      Match.exhaustive
    )
  }
}

/**
 * Execute a database query and translate errors to infrastructure errors
 * 
 * @param query - The database query to execute
 * @param context - Context about the operation (entityType, operation, entityId)
 * @returns Effect that succeeds with query result or fails with InfrastructureErrorType
 */
export function executeQuery<T>(
  query: () => Promise<T>,
  context: {
    readonly entityType: string
    readonly operation: string
    readonly entityId?: string
  }
): E.Effect<T, InfrastructureErrorType> {
  return pipe(
    E.tryPromise({
      try: query,
      catch: (error) => error
    }),
    E.catchAll((error) => translateDbError(error, context))
  )
}

/**
 * Fetch a single entity from the database
 * 
 * Returns Option.none if no entity found (not an error)
 * Fails with InfrastructureErrorType or mapper validation errors
 * 
 * @param query - Database query that returns array of models
 * @param mapper - Function to map model to entity
 * @param context - Context about the operation
 * @returns Effect with Option of entity or infrastructure/validation error
 */
export function fetchSingle<
  TModel,
  TEntity,
  TValidationError extends ValidationError
>(
  query: () => Promise<TModel[]>,
  mapper: FromDbMapper<TModel, TEntity, TValidationError>,
  context: {
    readonly entityType: string
    readonly operation: string
    readonly entityId?: string
  }
): E.Effect<O.Option<TEntity>, InfrastructureErrorType | TValidationError, Clock.Clock> {
  return pipe(
    executeQuery(query, context),
    E.map(O.fromIterable),
    E.flatMap((option) =>
      O.match(option, {
        onNone: () => E.succeed(O.none()),
        onSome: (row) => pipe(
          mapper(row),
          E.map(O.some)
        )
      })
    )
  )
}

/**
 * Fetch multiple entities from the database
 * 
 * Maps all results through the mapper function
 * Fails with InfrastructureErrorType or mapper validation errors
 * 
 * @param query - Database query that returns array of models
 * @param mapper - Function to map model to entity
 * @param context - Context about the operation
 * @returns Effect with array of entities or infrastructure/validation error
 */
export function fetchMultiple<
  TModel,
  TEntity,
  TValidationError extends ValidationError
>(
  query: () => Promise<TModel[]>,
  mapper: FromDbMapper<TModel, TEntity, TValidationError>,
  context: {
    readonly entityType: string
    readonly operation: string
  }
): E.Effect<readonly TEntity[], InfrastructureErrorType | TValidationError, Clock.Clock> {
  return pipe(
    executeQuery(query, context),
    E.flatMap((results) => 
      E.forEach(results, (row) => mapper(row))
    )
  )
}

