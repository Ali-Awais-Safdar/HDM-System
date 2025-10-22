import { Effect, Option } from "effect"
import { DomainError, ValidationError, DatabaseError } from "@domain/utils/base.errors"
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

  abstract save(entity: TEntity): Effect.Effect<TEntity, TSaveError | DatabaseError, never>

  /**
   * Delete an entity by id.
   * Implementations MUST fail with the typed NotFoundError when the entity does not exist,
   */
  abstract delete(id: TEntity["id"]): Effect.Effect<boolean, TNotFoundError | DatabaseError, never>

  abstract findById(
    id: TEntity["id"]
  ): Effect.Effect<Option.Option<TEntity>, TNotFoundError | ValidationError | DatabaseError>

  abstract exists(id: TEntity["id"]): Effect.Effect<boolean, DatabaseError, never>

  abstract list(options?: PaginationOptions): RepositoryEffect<Paginated<TEntity>, TNotFoundError | DatabaseError>
}
