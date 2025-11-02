import { Effect, Option, Clock } from "effect"
import { UserEntity } from "./user.entity"
import {
  UserAlreadyExistsError,
  UserNotFoundError,
  UserValidationError,
} from "./user.error"
import { ValidationError } from "@domain/utils/base.errors"
import { BaseRepository } from "@domain/utils/base.repository"
import { EmailAddress } from "@domain/refined/email"

/**
 * User repository interface with Effect-based signatures and typed errors.
 */
export abstract class UserRepository extends BaseRepository<
  UserEntity,
  UserNotFoundError,
  UserAlreadyExistsError | UserValidationError | ValidationError
> {

  protected readonly entityName = "User"

  // Domain-specific read operations
  abstract findByEmail(
    email: EmailAddress
  ): Effect.Effect<Option.Option<UserEntity>, UserNotFoundError | ValidationError, Clock.Clock>
}
