import { Effect as E, Option as O, pipe } from "effect"
import { UserEntity } from "@domain/user/user.entity"
import { UserRepository } from "@domain/user/user.repository"
import {
  UserAlreadyExistsError,
  UserNotFoundError,
  UserValidationError,
} from "@domain/user/user.errors"
import { ValidationError } from "@domain/utils/domain.errors"
import { toNullable } from "@domain/utils/option.utils"
import { EmailAddress } from "@domain/value-objects/email.vo"
import { UserId } from "@domain/value-objects/id.vo"
import { users, type UserModel } from "@infra/services/db/models/user.model"
import { eq } from "drizzle-orm"
import type { DatabaseInterface } from "@infra/services/db/interfaces"

/**
 * Drizzle-based User Repository Implementation
 */
export class UserDrizzleRepository extends UserRepository {
  constructor(private readonly db: DatabaseInterface) { 
    super() 
  }

  // ========== Serialization Helpers ==========

  private toDbSerialized(user: UserEntity): E.Effect<Omit<UserModel, 'updatedAt'>, ValidationError, never> {
    return E.sync(() => ({
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      roles: user.roles as string[],
      workspaceId: toNullable(user.workspaceId),
      createdAt: user.createdAt
    }))
  }

  private fromDbRow(row: UserModel): E.Effect<UserEntity, ValidationError, never> {
    return UserEntity.fromPersistence({
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      roles: row.roles,
      workspaceId: row.workspaceId
        ? { _tag: "Some" as const, value: row.workspaceId }
        : { _tag: "None" as const },
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt
    })
  }

  // ========== Query Helpers ==========

  private executeQuery<T>(query: () => Promise<T>): E.Effect<T, UserNotFoundError> {
    return E.tryPromise({
      try: query,
      catch: (error) => new UserNotFoundError(
        "unknown",
        { originalError: error instanceof Error ? error.message : String(error) }
      )
    })
  }

  private fetchSingle(
    query: () => Promise<UserModel[]>
  ): E.Effect<O.Option<UserEntity>, UserNotFoundError | ValidationError, never> {
    return pipe(
      this.executeQuery(query),
      E.map(O.fromIterable),
      E.flatMap((option) =>
        O.match(option, {
          onNone: () => E.succeed(O.none()),
          onSome: (row) => pipe(
            this.fromDbRow(row),
            E.map(O.some)
          )
        })
      )
    )
  }

  // ========== Repository Methods ==========

  findById(
    id: UserId
  ): E.Effect<O.Option<UserEntity>, UserNotFoundError | ValidationError, never> {
    return this.fetchSingle(() =>
      this.db.select().from(users).where(eq(users.id, id)).limit(1)
    )
  }

  findByEmail(
    email: EmailAddress
  ): E.Effect<O.Option<UserEntity>, UserNotFoundError | ValidationError, never> {
    return this.fetchSingle(() =>
      this.db.select().from(users).where(eq(users.email, email)).limit(1)
    )
  }

  exists(
    id: UserId
  ): E.Effect<boolean, UserNotFoundError, never> {
    return pipe(
      E.tryPromise({
        try: (): Promise<Pick<UserModel, "id">[]> =>
          this.db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1),
        catch: () => new UserNotFoundError(id)
      }),
      E.map((result) => result.length > 0)
    )
  }

  private ensureExists(id: UserId): E.Effect<void, UserNotFoundError, never> {
    return pipe(
      this.exists(id),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () => E.succeed(undefined),
          onFalse: () => E.fail(new UserNotFoundError(id))
        })
      )
    )
  }

  save(
    user: UserEntity
  ): E.Effect<UserEntity, UserAlreadyExistsError | UserValidationError | ValidationError, never> {
    return pipe(
      // Check if user already exists by email
      this.findByEmail(user.email),
      E.flatMap((existingUser) =>
        O.match(existingUser, {
          onNone: () => this.insert(user),
          onSome: (existing) => {
            // If IDs match, update; otherwise it's a conflict
            if (existing.id === user.id) {
              return this.update(user) as E.Effect<UserEntity, UserAlreadyExistsError | ValidationError, never>
            }
            return E.fail(new UserAlreadyExistsError(user.email))
          }
        })
      ),
      E.mapError((error): UserAlreadyExistsError | UserValidationError => {
        if (error instanceof UserAlreadyExistsError) {
          return error
        }
        if (error instanceof ValidationError) {
          return new UserValidationError(
            error.message,
            error.field,
            error.value
          )
        }
        return new UserValidationError(
          `Failed to save user: ${error}`,
          undefined,
          { userId: user.id }
        )
      })
    )
  }

  private insert(
    user: UserEntity
  ): E.Effect<UserEntity, UserAlreadyExistsError | ValidationError, never> {
    return pipe(
      this.toDbSerialized(user),
      E.flatMap((dbData) =>
        E.tryPromise({
          try: () => this.db.insert(users).values(dbData),
          catch: (error) => {
            // Check for unique constraint violation
            const errorMsg = error instanceof Error ? error.message : String(error)
            if (errorMsg.includes('unique') || errorMsg.includes('duplicate')) {
              return new UserAlreadyExistsError(user.email)
            }
            return new ValidationError(
              `Failed to insert user: ${errorMsg}`,
              undefined,
              { userId: user.id }
            )
          }
        })
      ),
      E.as(user)
    )
  }
  
  private update(
    user: UserEntity
  ): E.Effect<UserEntity, ValidationError | UserNotFoundError, never> {
    return pipe(
      this.ensureExists(user.id),
      E.flatMap(() => this.toDbSerialized(user)),
      E.flatMap((dbData) =>
        E.tryPromise({
          try: () => this.db.update(users).set(dbData).where(eq(users.id, user.id)),
          catch: (error) => new ValidationError(
            `Failed to update user: ${error instanceof Error ? error.message : String(error)}`,
            undefined,
            { userId: user.id }
          )
        })
      ),
      E.as(user)
    )
  }

  delete(
    id: UserId
  ): E.Effect<boolean, UserNotFoundError, never> {
    return pipe(
      this.exists(id),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () =>
            pipe(
              E.tryPromise({
                try: () => this.db.delete(users).where(eq(users.id, id)),
                catch: () => new UserNotFoundError(id)
              }),
              E.as(true)
            ),
          onFalse: () => E.succeed(false)
        })
      )
    )
  }
}
