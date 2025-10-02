import { Effect, Schema as S } from "effect"
import { UserEntity } from "../entities/user.entity"
import { Role } from "../schema/access-policy.schema"
import { EmailAddress } from "../value-objects/email.vo"
import { Password } from "../value-objects/password.vo"
import { UserId } from "../value-objects/id.vo"
import { UserRepository } from "../ports/user.repository"
import { PasswordHasherPort } from "../ports/password-hasher.port"
import { UserNotFoundError, UserAlreadyExistsError, UserValidationError } from "../errors/user.errors"
import { ValidationError, DomainError } from "../errors/domain.errors"
import { randomUUID } from "crypto"

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
        
        return Effect.tryPromise({
          try: () => passwordHasher.hash(password as unknown as string),
          catch: () => new AuthError("Failed to process password")
        })
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
        
        return Effect.tryPromise({
          try: () => passwordHasher.verify(password as unknown as string, user.passwordHash),
          catch: () => new AuthError("Authentication failed")
        }).pipe(
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
