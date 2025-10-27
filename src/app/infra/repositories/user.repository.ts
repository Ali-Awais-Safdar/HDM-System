import { Effect as E, Option as O, pipe, Clock } from "effect"
import { injectable, inject } from "tsyringe"
import { UserEntity } from "@domain/user/user.entity"
import { UserRepository } from "@domain/user/user.repository"
import {
  UserAlreadyExistsError,
  UserNotFoundError,
  UserValidationError,
} from "@domain/user/user.error"
import { ValidationError } from "@domain/utils/base.errors"
import { type Paginated, PaginationOptions, defaultPaginationOptions, calculateTotalPages } from "@domain/utils/pagination"
import { EmailAddress } from "@domain/refined/email"
import { UserId } from "@domain/refined/ids"
import { users, type UserModel } from "@infra/db/models/user.model"
import { UserMapper } from "@infra/db/mappers"
import { eq, count } from "drizzle-orm"
import type { DatabaseInterface } from "@infra/db/interfaces"
import { isUniqueConstraintError, getErrorMessage, translateDbError, translateQueryError } from "@infra/db/errors"
import { DatabaseError } from "@domain/utils/base.errors"
import { fetchSingle } from "./helpers"
import { TOKENS } from "@infra/di/container"

/**
 * Drizzle-based User Repository Implementation
 */
@injectable()
export class UserDrizzleRepository extends UserRepository {
  constructor(@inject(TOKENS.DATABASE_CONNECTION) private readonly db: DatabaseInterface) { 
    super() 
  }

  // ========== Repository Methods ==========

  findById(
    id: UserId
  ): E.Effect<O.Option<UserEntity>, UserNotFoundError | ValidationError | DatabaseError, never> {
    return pipe(
      fetchSingle(
        () => this.db.select().from(users).where(eq(users.id, id)).limit(1),
        UserMapper.fromDb,
        "User",
        UserNotFoundError
      ),
      E.mapError((error): UserNotFoundError | ValidationError | DatabaseError =>
        error instanceof UserValidationError
          ? new ValidationError(error.message, error.field, error.value)
          : error
      )
    )
  }

  findByEmail(
    email: EmailAddress
  ): E.Effect<O.Option<UserEntity>, UserNotFoundError | ValidationError | DatabaseError, never> {
    return pipe(
      fetchSingle(
        () => this.db.select().from(users).where(eq(users.email, email)).limit(1),
        UserMapper.fromDb,
        "User",
        UserNotFoundError
      ),
      E.mapError((error): UserNotFoundError | ValidationError | DatabaseError =>
        error instanceof UserValidationError
          ? new ValidationError(error.message, error.field, error.value)
          : error
      )
    )
  }

  exists(
    id: UserId
  ): E.Effect<boolean, DatabaseError, never> {
    return pipe(
      E.tryPromise({
        try: (): Promise<Pick<UserModel, "id">[]> =>
          this.db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1),
        catch: (error) => new DatabaseError(
          `Database error during exists check on User`,
          { originalError: error }
        )
      }),
      E.map((result) => result.length > 0)
    )
  }

  private ensureExists(id: UserId): E.Effect<void, UserNotFoundError | DatabaseError, never> {
    return pipe(
      this.exists(id),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () => E.succeed(undefined),
          onFalse: () => E.fail(new UserNotFoundError(`User not found: id=${id}`, "id", id))
        })
      )
    )
  }

  // ========== Pure Helper Functions ==========

  private mapSaveError(error: unknown, user: UserEntity): UserAlreadyExistsError | UserValidationError | DatabaseError {
    return error instanceof DatabaseError
      ? error
      : error instanceof UserAlreadyExistsError
      ? error
      : error instanceof ValidationError
      ? new UserValidationError(
          error.message,
          error.field,
          error.value
        )
      : new UserValidationError(
          `Failed to save user: ${getErrorMessage(error)}`,
          "save",
          user.id
        )
  }

  private handleExistingUser(
    existing: UserEntity,
    user: UserEntity
  ): E.Effect<UserEntity, UserAlreadyExistsError | ValidationError, never> {
    return existing.id === user.id
      ? this.update(user) as E.Effect<UserEntity, UserAlreadyExistsError | ValidationError, never>
      : E.fail(new UserAlreadyExistsError(`User already exists with email: ${user.email}`, "email", user.email))
  }

  save(
    user: UserEntity
  ): E.Effect<UserEntity, UserAlreadyExistsError | UserValidationError | ValidationError | DatabaseError, never> {
    return pipe(
      this.findByEmail(user.email),
      E.flatMap((existingUser) =>
        O.match(existingUser, {
          onNone: () => this.insert(user),
          onSome: (existing) => this.handleExistingUser(existing, user)
        })
      ),
      E.mapError((error) => this.mapSaveError(error, user))
    )
  }

  private insert(
    user: UserEntity
  ): E.Effect<UserEntity, UserAlreadyExistsError | ValidationError | DatabaseError | UserValidationError, never> {
    return pipe(
      UserMapper.toDb(user),
      E.flatMap((dbData) =>
        E.tryPromise({
          try: () => this.db.insert(users).values(dbData),
          catch: (error) => 
            isUniqueConstraintError(error)
              ? new UserAlreadyExistsError(`User already exists with email: ${user.email}`, "email", user.email)
              : translateDbError(
                  error,
                  { operation: "insert", entityType: "User" },
                  {
                    createConflictError: (message: string) => new ValidationError(message, "userId", user.id),
                    createNotFoundError: (field: string, value: string) => new ValidationError(`User not found: ${field}=${value}`, field, value),
                    createValidationError: (message: string, field: string) => new ValidationError(message, field, user.id)
                  }
                )
        })
      ),
      E.as(user)
    )
  }
  
  private update(
    user: UserEntity
  ): E.Effect<UserEntity, ValidationError | UserNotFoundError | DatabaseError | UserValidationError, never> {
    return pipe(
      this.ensureExists(user.id),
      E.flatMap(() => UserMapper.toDb(user)),
      E.flatMap((dbData) =>
        E.tryPromise({
          try: () => this.db.update(users).set(dbData).where(eq(users.id, user.id)),
          catch: (error) => translateDbError(
            error,
            { operation: "update", entityType: "User" },
            {
              createConflictError: (message: string) => new ValidationError(message, "userId", user.id),
              createNotFoundError: (field: string, value: string) => new ValidationError(`User not found: ${field}=${value}`, field, value),
              createValidationError: (message: string, field: string) => new ValidationError(message, field, user.id)
            }
          )
        })
      ),
      E.as(user)
    )
  }

  delete(
    id: UserId
  ): E.Effect<boolean, UserNotFoundError | DatabaseError, never> {
    return pipe(
      this.exists(id),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () =>
            pipe(
              E.tryPromise({
                try: () => this.db.delete(users).where(eq(users.id, id)),
                catch: (error) => translateDbError(
                  error,
                  { operation: "delete", entityType: "User" },
                  {
                    createConflictError: (message: string) => new DatabaseError(message),
                    createNotFoundError: (field: string, value: string) => new UserNotFoundError(`User not found: ${field}=${value}`, field, value),
                    createValidationError: (message: string) => new DatabaseError(message)
                  }
                )
              }),
              E.as(true)
            ),
          onFalse: () => E.fail(new UserNotFoundError(`User not found: id=${id}`, "id", id))
        })
      )
    )
  }

  list(options?: PaginationOptions): E.Effect<Paginated<UserEntity>, UserNotFoundError | ValidationError | DatabaseError, never> {
    const paginationOptions = options ?? defaultPaginationOptions()
    const offset = (paginationOptions.pageNum - 1) * paginationOptions.pageSize

    return pipe(
      E.tryPromise({
        try: async () => {
          const [data, totalResult] = await Promise.all([
            this.db
              .select()
              .from(users)
              .limit(paginationOptions.pageSize)
              .offset(offset)
              .orderBy(users.createdAt),
            this.db
              .select({ count: count() })
              .from(users)
          ])

          return { 
            data: data as UserModel[], 
            total: Number(totalResult[0]?.count ?? 0)
          }
        },
        catch: (error) => translateQueryError(
          error,
          { operation: "list", entityType: "User", field: "list", value: "all" },
          (message, field, value, details) => new UserNotFoundError(message, field, value, details)
        )
      }),
      E.flatMap(({ data, total }) =>
        data.length === 0
          ? E.succeed({
              data: [] as readonly UserEntity[],
              total,
              pageNum: paginationOptions.pageNum,
              pageSize: paginationOptions.pageSize,
              totalPages: calculateTotalPages(total, paginationOptions.pageSize)
            } as Paginated<UserEntity>)
          : pipe(
              E.forEach(data, (row) =>
                pipe(
                  UserMapper.fromDb(row),
                  E.mapError((error): UserNotFoundError | ValidationError =>
                    error instanceof UserValidationError
                      ? new ValidationError(error.message, error.field, error.value)
                      : error
                  ),
                  E.provideService(Clock.Clock, Clock.make())
                )
              ),
              E.map((entities): Paginated<UserEntity> => ({
                data: entities,
                total,
                pageNum: paginationOptions.pageNum,
                pageSize: paginationOptions.pageSize,
                totalPages: calculateTotalPages(total, paginationOptions.pageSize)
              }))
            )
      )
    )
  }
}
