import { Effect, Option, Clock } from "effect"
import { DomainError, ValidationError } from "@domain/utils/base.errors"
import { Paginated, PaginationOptions } from "@domain/utils/pagination"

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

  abstract save(entity: TEntity): Effect.Effect<TEntity, TSaveError, Clock.Clock>

  /**
   * Delete an entity by id.
   * Implementations MUST fail with the typed NotFoundError when the entity does not exist,
   */
  abstract delete(id: TEntity["id"]): Effect.Effect<boolean, TNotFoundError, never>

  abstract findById(
    id: TEntity["id"]
  ): Effect.Effect<Option.Option<TEntity>, TNotFoundError | ValidationError, Clock.Clock>

  abstract exists(id: TEntity["id"]): Effect.Effect<boolean, never, never>

  abstract list(options?: PaginationOptions): Effect.Effect<Paginated<TEntity>, TNotFoundError | ValidationError, Clock.Clock>
}
