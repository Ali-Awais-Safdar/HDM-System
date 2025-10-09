import { Effect, Option } from "effect"
import { type IEntity } from "@domain/utils/base.entity"
import { DomainError, ValidationError } from "@domain/utils/base.errors"

export type RepositoryEffect<A, E = DomainError> = Effect.Effect<
  A,
  E | ValidationError,
  never
>

export abstract class BaseRepository<TEntity extends IEntity> {
  protected abstract readonly entityName: string

  protected toOption<T>(value: T | null | undefined): Option.Option<T> {
    return value == null ? Option.none() : Option.some(value)
  }

  abstract insert(entity: TEntity): RepositoryEffect<TEntity>

  abstract update(entity: TEntity): RepositoryEffect<TEntity>

  abstract delete(id: TEntity["id"]): RepositoryEffect<boolean>

  abstract fetchById(
    id: TEntity["id"]
  ): RepositoryEffect<Option.Option<TEntity>>

  abstract exists(id: TEntity["id"]): RepositoryEffect<boolean>

  abstract list(): RepositoryEffect<readonly TEntity[]>
}
