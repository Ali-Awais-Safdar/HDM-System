import { randomUUID } from "crypto"
import { Effect, Schema as S } from "effect"
import { Role } from "@domain/accessPolicy/access-policy.schema"
import { UserEntity } from "@domain/user/user.entity"
import { UserRepository } from "@domain/user/user.repository"
import {
  UserAlreadyExistsError,
  UserNotFoundError,
  UserValidationError,
} from "@domain/user/user.errors"
import { DomainError, ValidationError } from "@domain/utils/domain.errors"
import { PasswordHasherPort } from "@application/services/ports/password-hasher.port"
import { EmailAddress } from "@domain/value-objects/email.vo"
import { HashedPassword } from "@domain/value-objects/hashed-password.vo"
import { UserId } from "@domain/value-objects/id.vo"
import { Password } from "@domain/value-objects/password.vo"

/**
 * Authentication service error for auth-related failures.
 */
export class AuthError extends DomainError {
  readonly _tag = "AuthError" as const
  readonly code = "AUTH_ERROR"
  
  constructor(
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message, details)
  }
}

export class AuthService {
  constructor(
    private readonly passwordHasher: PasswordHasherPort,
    private readonly userRepository: UserRepository
  ) {}

  signup(
    email: EmailAddress, 
    password: Password, 
    roles: readonly Role[] = ["USER" as Role]
  ): Effect.Effect<
    UserEntity, 
    AuthError | UserAlreadyExistsError | UserValidationError | ValidationError | UserNotFoundError
  > {
    const { userRepository, passwordHasher } = this
    
    return userRepository.findByEmail(email).pipe(
      Effect.flatMap(existingOption => {
        if (existingOption._tag === "Some") {
          return Effect.fail(new AuthError("User already exists with this email"))
        }
        
        return passwordHasher
          .hash(password as unknown as string)
          .pipe(
            Effect.mapError(() => new AuthError("Failed to process password")),
            Effect.flatMap(hashedString => 
              S.decodeUnknown(HashedPassword)(hashedString).pipe(
                Effect.mapError(() => new AuthError("Invalid password hash format"))
              )
            )
          )
      }),
      Effect.flatMap(hashed =>
        S.decodeUnknown(UserId)(randomUUID()).pipe(
          Effect.mapError(() => new AuthError("Failed to generate user id")),
          Effect.map(userId => ({ hashed, userId }))
        )
      ),
      Effect.flatMap(({ hashed, userId }) =>
        UserEntity.createNew({
          id: userId,
          email: email,
          passwordHash: hashed,
          roles: roles as Role[]
        }).pipe(
          Effect.mapError((e) => new AuthError(e.message))
        )
      ),
      Effect.flatMap(user => 
        userRepository.save(user).pipe(
          Effect.mapError(() => new AuthError("Failed to create user"))
        )
      )
    )
  }

  login(
    email: EmailAddress, 
    password: Password
  ): Effect.Effect<
    UserEntity, 
    AuthError | UserNotFoundError | ValidationError
  > {
    const { userRepository, passwordHasher } = this
    
    return userRepository.findByEmail(email).pipe(
      Effect.flatMap(userOption => {
        if (userOption._tag === "None") {
          return Effect.fail(new AuthError("Invalid credentials"))
        }
        
        const user = userOption.value
        
        return passwordHasher
          .verify(password as unknown as string, user.passwordHash as unknown as string)
          .pipe(
            Effect.mapError(() => new AuthError("Authentication failed")),
            Effect.flatMap(isValid => {
              if (!isValid) {
                return Effect.fail(new AuthError("Invalid credentials"))
              }
              return Effect.succeed(user)
            })
          )
      })
    )
  }

  createAdminUser(
    email: EmailAddress,
    password: Password
  ): Effect.Effect<
    UserEntity, 
    AuthError | UserAlreadyExistsError | UserValidationError | ValidationError | UserNotFoundError
  > {
    return this.signup(email, password, ["ADMIN" as Role])
  }
}
