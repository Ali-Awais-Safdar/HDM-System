import { Effect, Option } from "effect"
import { UserEntity } from "../entities/user.entity"
import { UserId } from "../value-objects/id.vo"
import { EmailAddress } from "../value-objects/email.vo"
import { 
  UserNotFoundError, 
  UserAlreadyExistsError,
  UserValidationError 
} from "../errors/user.errors"
import { ValidationError } from "../errors/domain.errors"

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
