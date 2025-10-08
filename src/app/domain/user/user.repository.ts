import { Effect, Option } from "effect"
import { UserEntity } from "./user.entity"
import {
  UserAlreadyExistsError,
  UserNotFoundError,
  UserValidationError,
} from "./user.errors"
import { ValidationError } from "@domain/utils/domain.errors"
import { EmailAddress } from "@domain/value-objects/email.vo"
import { UserId } from "@domain/value-objects/id.vo"

/**
 * User repository interface with Effect-based signatures and typed errors.
 */
export abstract class UserRepository {

  abstract findById(
    id: UserId
  ): Effect.Effect<Option.Option<UserEntity>, UserNotFoundError | ValidationError>

  abstract findByEmail(
    email: EmailAddress
  ): Effect.Effect<Option.Option<UserEntity>, UserNotFoundError | ValidationError>

  abstract exists(
    id: UserId
  ): Effect.Effect<boolean, UserNotFoundError>

  abstract save(
    user: UserEntity
  ): Effect.Effect<UserEntity, UserAlreadyExistsError | UserValidationError | ValidationError>

  abstract delete(
    id: UserId
  ): Effect.Effect<boolean, UserNotFoundError>
}
