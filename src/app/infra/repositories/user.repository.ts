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
import { isUniqueConstraintError, getErrorMessage, translateDbError } from "@infra/db/errors"
import type { InfrastructureErrorType } from "@infra/errors/infrastructure.errors"
import { fetchSingle, mapInfraErrorToDomainWithFailFast, executeQuery } from "./helpers"
import { isInfraError } from "app/shared/error-matching"
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

  /**
   * Wrapper for UserMapper.fromDb that converts UserValidationError to ValidationError
   */
  private mapUserFromDb(row: UserModel): E.Effect<UserEntity, ValidationError, Clock.Clock> {
    return pipe(
      UserMapper.fromDb(row),
      E.mapError((error) => new ValidationError(error.message, error.field, error.value))
    )
  }

  findById(
    id: UserId
  ): E.Effect<O.Option<UserEntity>, UserNotFoundError | ValidationError, Clock.Clock> {
    return pipe(
      fetchSingle(
        () => this.db.select().from(users).where(eq(users.id, id)).limit(1),
        this.mapUserFromDb.bind(this),
        {
          entityType: "User",
          operation: "findById",
          entityId: id
        }
      ),
      E.catchAll((error) => {
        // Map infrastructure errors to domain errors
        if (isInfraError(error)) {
          return mapInfraErrorToDomainWithFailFast("User", (msg, field, value) => new UserNotFoundError(msg, field, value))(error)
        }
        // Pass through ValidationError
        return E.fail(error as ValidationError)
      })
    )
  }

  findByEmail(
    email: EmailAddress
  ): E.Effect<O.Option<UserEntity>, UserNotFoundError | ValidationError, Clock.Clock> {
    return pipe(
      fetchSingle(
        () => this.db.select().from(users).where(eq(users.email, email)).limit(1),
        this.mapUserFromDb.bind(this),
        {
          entityType: "User",
          operation: "findByEmail",
          entityId: email
        }
      ),
      E.catchAll((error) => {
        // Map infrastructure errors to domain errors
        if (isInfraError(error)) {
          return mapInfraErrorToDomainWithFailFast("User", (msg, field, value) => new UserNotFoundError(msg, field, value))(error)
        }
        // Pass through ValidationError
        return E.fail(error as ValidationError)
      })
    )
  }

  exists(
    id: UserId
  ): E.Effect<boolean, InfrastructureErrorType> {
    return pipe(
      executeQuery(
        () => this.db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1),
        {
          entityType: "User",
          operation: "exists",
          entityId: id
        }
      ),
      E.map((result) => result.length > 0)
    )
  }

  private ensureExists(id: UserId): E.Effect<void, UserNotFoundError, never> {
    return pipe(
      this.exists(id),
      E.catchAll((error) => {
        // Map infrastructure errors (unexpected errors will fail fast as defects via mapInfraErrorToDomainWithFailFast)
        if (isInfraError(error)) {
          return pipe(
            mapInfraErrorToDomainWithFailFast("User", (msg, field, value) => new UserNotFoundError(msg, field, value))(error),
            E.mapError((err) => err instanceof UserNotFoundError ? err : new UserNotFoundError(err.message, err.field, err.value))
          )
        }
        // Unknown errors should fail fast
        return E.die(error)
      }),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () => E.succeed(undefined),
          onFalse: () => E.fail(new UserNotFoundError(`User not found: id=${id}`, "id", id))
        })
      )
    )
  }

  // ========== Pure Helper Functions ==========

  private mapSaveError(error: unknown, user: UserEntity): UserAlreadyExistsError | UserValidationError | ValidationError {
    return error instanceof UserAlreadyExistsError
      ? error
      : error instanceof ValidationError
      ? error
      : error instanceof UserValidationError
      ? error
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
  ): E.Effect<UserEntity, UserAlreadyExistsError | UserValidationError | ValidationError, Clock.Clock> {
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
  ): E.Effect<UserEntity, UserAlreadyExistsError | ValidationError | UserValidationError, never> {
    return pipe(
      UserMapper.toDb(user),
      E.flatMap((dbData) =>
        pipe(
          E.tryPromise({
            try: () => this.db.insert(users).values(dbData),
            catch: (error) => error
          }),
          E.catchAll((error): E.Effect<void, UserAlreadyExistsError | UserNotFoundError | ValidationError, never> => {
            // Handle unique constraint violations with domain-specific error
            if (isUniqueConstraintError(error)) {
              return E.fail(new UserAlreadyExistsError(`User already exists with email: ${user.email}`, "email", user.email))
            }
            // Translate infrastructure errors to domain errors
            return pipe(
              translateDbError(error, { operation: "insert", entityType: "User", entityId: user.id }),
              E.catchAll(mapInfraErrorToDomainWithFailFast("User", (msg, field, value) => new UserNotFoundError(msg, field, value)))
            )
          })
        )
      ),
      E.as(user),
      E.mapError((error): UserAlreadyExistsError | ValidationError | UserValidationError => {
        if (error instanceof UserValidationError) {
          return error
        }
        if (error instanceof UserAlreadyExistsError) {
          return error
        }
        if (error instanceof UserNotFoundError) {
          // Convert UserNotFoundError to ValidationError
          return new ValidationError(error.message, error.field, error.value)
        }
        return error as ValidationError
      })
    )
  }
  
  private update(
    user: UserEntity
  ): E.Effect<UserEntity, ValidationError | UserNotFoundError | UserValidationError, never> {
    return pipe(
      this.ensureExists(user.id),
      E.flatMap(() => UserMapper.toDb(user)),
      E.flatMap((dbData) =>
        pipe(
          E.tryPromise({
            try: () => this.db.update(users).set(dbData).where(eq(users.id, user.id)),
            catch: (error) => error
          }),
          E.catchAll((error) =>
            pipe(
              translateDbError(error, { operation: "update", entityType: "User", entityId: user.id }),
              E.catchAll(mapInfraErrorToDomainWithFailFast("User", (msg, field, value) => new UserNotFoundError(msg, field, value)))
            )
          )
        )
      ),
      E.as(user),
      E.mapError((error): ValidationError | UserNotFoundError | UserValidationError => 
        error instanceof UserValidationError
          ? error
          : error instanceof UserNotFoundError
          ? error
          : error as ValidationError
      )
    )
  }

  delete(
    id: UserId
  ): E.Effect<boolean, UserNotFoundError, never> {
    return pipe(
      this.exists(id),
      E.catchAll((error) => {
        // Map infrastructure errors (unexpected errors will fail fast as defects via mapInfraErrorToDomainWithFailFast)
        if (isInfraError(error)) {
          return pipe(
            mapInfraErrorToDomainWithFailFast("User", (msg, field, value) => new UserNotFoundError(msg, field, value))(error),
            E.mapError((err) => err instanceof UserNotFoundError ? err : new UserNotFoundError(err.message, err.field, err.value))
          )
        }
        // Unknown errors should fail fast
        return E.die(error)
      }),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () =>
            pipe(
              E.tryPromise({
                try: () => this.db.delete(users).where(eq(users.id, id)),
                catch: (error) => error
              }),
              E.catchAll((error) =>
                pipe(
                  translateDbError(error, { operation: "delete", entityType: "User", entityId: id }),
                  E.catchAll(mapInfraErrorToDomainWithFailFast("User", (msg, field, value) => new UserNotFoundError(msg, field, value)))
                )
              ),
              E.mapError((error): UserNotFoundError => 
                error instanceof UserNotFoundError
                  ? error
                  : new UserNotFoundError(`Failed to delete user: ${error instanceof Error ? error.message : String(error)}`, "id", id)
              ),
              E.as(true)
            ),
          onFalse: () => E.fail(new UserNotFoundError(`User not found: id=${id}`, "id", id))
        })
      )
    )
  }

  list(options?: PaginationOptions): E.Effect<Paginated<UserEntity>, UserNotFoundError | ValidationError, Clock.Clock> {
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
        catch: (error) => error
      }),
      E.catchAll((error) =>
        pipe(
          translateDbError(error, { operation: "list", entityType: "User" }),
          E.catchAll(mapInfraErrorToDomainWithFailFast("User", (msg, field, value) => new UserNotFoundError(msg, field, value)))
        )
      ),
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
              E.forEach(data, (row) => this.mapUserFromDb(row)),
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
