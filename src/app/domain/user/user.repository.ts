import { Effect, Option } from "effect"
import { UserEntity } from "./user.entity"
import {
  UserAlreadyExistsError,
  UserNotFoundError,
  UserValidationError,
} from "./user.error"
import { ValidationError } from "@domain/utils/base.errors"
import { BaseRepository, type RepositoryEffect } from "@domain/utils/base.repository"
import { EmailAddress } from "@domain/refined/email"
import { UserId } from "@domain/refined/ids"

/**
 * User repository interface with Effect-based signatures and typed errors.
 */
export abstract class UserRepository extends BaseRepository<UserEntity> {

  protected readonly entityName = "User"

  // Standardized CRUD per BaseRepository
  abstract insert(user: UserEntity): RepositoryEffect<UserEntity, UserAlreadyExistsError | UserValidationError>
  abstract update(user: UserEntity): RepositoryEffect<UserEntity, UserValidationError>
  abstract fetchById(id: UserId): RepositoryEffect<Option.Option<UserEntity>, UserNotFoundError>
  abstract list(): RepositoryEffect<readonly UserEntity[], UserNotFoundError>

  abstract findById(
    id: UserId
  ): Effect.Effect<Option.Option<UserEntity>, UserNotFoundError | ValidationError>

  abstract findByEmail(
    email: EmailAddress
  ): Effect.Effect<Option.Option<UserEntity>, UserNotFoundError | ValidationError>

  // Standardized exists/delete per BaseRepository
  abstract exists(id: UserId): RepositoryEffect<boolean, UserNotFoundError>

  abstract save(
    user: UserEntity
  ): Effect.Effect<UserEntity, UserAlreadyExistsError | UserValidationError | ValidationError>

  abstract delete(id: UserId): RepositoryEffect<boolean, UserNotFoundError>
}
