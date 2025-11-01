import { Effect as E, Option as O, pipe, Clock } from "effect"
import { DomainError, DatabaseError } from "@domain/utils/base.errors"
import { translateQueryError } from "@infra/db/errors"

/**
 * Shared repository query helpers to eliminate duplication across repositories.
 */

type FromDbMapper<TModel, TEntity, TValidationError extends DomainError> = (
  model: TModel
) => E.Effect<TEntity, TValidationError, Clock.Clock>


type NotFoundErrorConstructor<TNotFoundError extends DomainError> = new (
  message: string,
  field?: string,
  value?: unknown,
  details?: Record<string, unknown>
) => TNotFoundError


export function executeQuery<T, TNotFoundError extends DomainError>(
  query: () => Promise<T>,
  entityType: string,
  NotFoundErrorCtor: NotFoundErrorConstructor<TNotFoundError>
): E.Effect<T, TNotFoundError | DatabaseError> {
  return E.tryPromise({
    try: query,
    catch: (error) => translateQueryError(
      error,
      { operation: "query", entityType, field: "query", value: "unknown" },
      (message, field, value, details) => new NotFoundErrorCtor(
        message,
        field,
        value,
        details
      )
    )
  })
}

export function fetchSingle<
  TModel,
  TEntity,
  TNotFoundError extends DomainError,
  TValidationError extends DomainError
>(
  query: () => Promise<TModel[]>,
  mapper: FromDbMapper<TModel, TEntity, TValidationError>,
  entityType: string,
  NotFoundErrorCtor: NotFoundErrorConstructor<TNotFoundError>
): E.Effect<O.Option<TEntity>, TNotFoundError | TValidationError | DatabaseError, Clock.Clock> {
  return pipe(
    executeQuery(query, entityType, NotFoundErrorCtor),
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


export function fetchMultiple<
  TModel,
  TEntity,
  TNotFoundError extends DomainError,
  TValidationError extends DomainError
>(
  query: () => Promise<TModel[]>,
  mapper: FromDbMapper<TModel, TEntity, TValidationError>,
  entityType: string,
  NotFoundErrorCtor: NotFoundErrorConstructor<TNotFoundError>
): E.Effect<readonly TEntity[], TNotFoundError | TValidationError | DatabaseError, Clock.Clock> {
  return pipe(
    executeQuery(query, entityType, NotFoundErrorCtor),
    E.flatMap((results) => 
      E.forEach(results, (row) => mapper(row))
    )
  )
}

