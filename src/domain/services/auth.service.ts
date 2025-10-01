import { Effect, Schema as S } from "effect"
import { UserEntity } from "../entities/user.entity";
import { Role } from "../schema/access-policy.schema";
import { EmailAddress } from "../value-objects/email.vo";
import { Password } from "../value-objects/password.vo";
import { UserId } from "../value-objects/id.vo";
import { randomUUID } from "crypto"

/**
 * Domain service for authentication business logic.
 * Handles user creation and authentication rules.
 */
export class AuthService {
  constructor(
    private readonly passwordHasher: PasswordHasher,
    private readonly userRepository: UserRepository
  ) {}

  signup(
    email: EmailAddress, 
    password: Password, 
    roles: readonly Role[] = ["USER" as Role]
  ): Effect.Effect<UserEntity, AuthError> {
    const { userRepository, passwordHasher } = this;
    
    // Check if user already exists
    return Effect.tryPromise(() =>
      userRepository.findByEmail(email)
    ).pipe(
      Effect.mapError(() => new AuthError("Failed to check existing user")),
      Effect.flatMap(existing => {
        if (existing !== null) {
          return Effect.fail(new AuthError("User already exists with this email"))
        }
        
        // Hash password
        return Effect.tryPromise(() =>
          passwordHasher.hash(password as unknown as string)
        ).pipe(
          Effect.mapError(() => new AuthError("Failed to process password"))
        )
      }),
      Effect.flatMap(hashed => {
        // Generate user id and validate brand
        return S.decodeUnknown(UserId)(randomUUID()).pipe(
          Effect.mapError(() => new AuthError("Failed to generate user id")),
          Effect.map(userId => ({ hashed, userId }))
        )
      }),
      Effect.flatMap(({ hashed, userId }) => {
        // Create new user entity
        return UserEntity.createNew({
          id: userId,
          email: email,
          passwordHash: hashed,
          roles: roles as Role[]
        }).pipe(
          Effect.mapError((e) => new AuthError(e.message))
        )
      }),
      Effect.flatMap(user => {
        // Save user
        return Effect.tryPromise(() => userRepository.save(user)).pipe(
          Effect.mapError(() => new AuthError("Failed to create user"))
        )
      })
    )
  }

  login(
    email: EmailAddress, 
    password: Password
  ): Effect.Effect<UserEntity, AuthError> {
    const { userRepository, passwordHasher } = this;
    
    // Find user by email
    return Effect.tryPromise(() =>
      userRepository.findByEmail(email)
    ).pipe(
      Effect.mapError(() => new AuthError("Authentication failed")),
      Effect.flatMap(user => {
        if (user === null) {
          return Effect.fail(new AuthError("Invalid credentials"))
        }
        
        // Verify password
        return Effect.tryPromise(() =>
          passwordHasher.verify(password as unknown as string, user.passwordHash)
        ).pipe(
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
  ): Effect.Effect<UserEntity, AuthError> {
    return this.signup(email, password, ["ADMIN" as Role]);
  }
}

// Domain interfaces (ports)
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

export interface UserRepository {
  findById(id: UserId): Promise<UserEntity | null>;
  findByEmail(email: EmailAddress): Promise<UserEntity | null>;
  save(user: UserEntity): Promise<UserEntity>;
  delete(id: UserId): Promise<void>;
}

// Domain errors
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
