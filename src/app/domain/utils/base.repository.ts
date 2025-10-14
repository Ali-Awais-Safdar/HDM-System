import { Effect, Option } from "effect"
import { DomainError, ValidationError } from "@domain/utils/base.errors"

export type RepositoryEffect<A, E = DomainError> = Effect.Effect<
  A,
  E | ValidationError,
  never
>

export abstract class BaseRepository<
  TEntity extends { readonly id: any },
  TNotFoundError extends DomainError = DomainError,
  TSaveError = ValidationError
> {
  protected abstract readonly entityName: string

  /**
   * Persist the entity. Implementations should upsert by default.
   */
  abstract save(entity: TEntity): Effect.Effect<TEntity, TSaveError, never>

  abstract delete(id: TEntity["id"]): RepositoryEffect<boolean, TNotFoundError>

  abstract findById(
    id: TEntity["id"]
  ): Effect.Effect<Option.Option<TEntity>, TNotFoundError | ValidationError>

  abstract exists(id: TEntity["id"]): RepositoryEffect<boolean, TNotFoundError>

  abstract list(): RepositoryEffect<readonly TEntity[], TNotFoundError>
}
