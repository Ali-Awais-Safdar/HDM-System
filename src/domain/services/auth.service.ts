import { Effect, Schema as S } from "effect"
import { UserEntity } from "../entities/user.entity";
import { Role } from "../schema/access-policy.schema";
import { Email } from "../value-objects/email.vo";
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
    email: Email, 
    password: Password, 
    roles: readonly Role[] = ["VIEWER" as Role]
  ): Effect.Effect<UserEntity, AuthError> {
    const { userRepository, passwordHasher } = this;
    return Effect.gen(function* () {
      // Check if user already exists
      const existing = yield* Effect.tryPromise(() =>
        userRepository.findByEmail(email.value)
      ).pipe(
        Effect.mapError(() => new AuthError("Failed to check existing user"))
      )
      if (existing !== null) {
        yield* Effect.fail(new AuthError("User already exists with this email"))
      }

      // Hash password (Password is a branded string)
      const hashed = yield* Effect.tryPromise(() =>
        passwordHasher.hash(password as unknown as string)
      ).pipe(
        Effect.mapError(() => new AuthError("Failed to process password"))
      )

      // Generate user id and validate brand
      const userId = yield* S.decodeUnknown(UserId)(randomUUID()).pipe(
        Effect.mapError(() => new AuthError("Failed to generate user id"))
      )

      // Create new user entity
      const user = yield* UserEntity.createNew({
        id: userId,
        email: email.value,
        passwordHash: hashed,
        roles: roles as Role[],
        workspaceIds: []
      }).pipe(
        Effect.mapError((e) => new AuthError(e.message))
      )

      // Save user
      const saved = yield* Effect.tryPromise(() => userRepository.save(user)).pipe(
        Effect.mapError(() => new AuthError("Failed to create user"))
      )

      return saved
    })
  }

  login(
    email: Email, 
    password: Password
  ): Effect.Effect<UserEntity, AuthError> {
    const { userRepository, passwordHasher } = this;
    return Effect.gen(function* () {
      // Find user by email
      const user = yield* Effect.tryPromise(() =>
        userRepository.findByEmail(email.value)
      ).pipe(
        Effect.mapError(() => new AuthError("Authentication failed"))
      )
      if (user === null) {
        yield* Effect.fail(new AuthError("Invalid credentials"))
      }

      // Verify password
      const isValid = yield* Effect.tryPromise(() =>
        passwordHasher.verify(password as unknown as string, (user as UserEntity).passwordHash)
      ).pipe(
        Effect.mapError(() => new AuthError("Authentication failed"))
      )
      if (!isValid) {
        yield* Effect.fail(new AuthError("Invalid credentials"))
      }

      return user as UserEntity
    })
  }

  createAdminUser(
    email: Email,
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
  findByEmail(email: import("../value-objects/email.vo").EmailAddress): Promise<UserEntity | null>;
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
