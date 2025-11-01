import { Effect as E, Option as O, pipe, Clock } from "effect"
import { injectable, inject } from "tsyringe"
import { DownloadTokenEntity } from "@domain/downloadToken/download-token.entity"
import { DownloadTokenRepository } from "@domain/downloadToken/download-token.repository"
import {
  DownloadTokenAlreadyUsedError,
  DownloadTokenNotFoundError,
  DownloadTokenValidationError
} from "@domain/downloadToken/download-token.error"
import { BusinessRuleViolationError, ValidationError } from "@domain/utils/base.errors"
import { type Paginated, PaginationOptions, defaultPaginationOptions, calculateTotalPages } from "@domain/utils/pagination"
import { DocumentId, DownloadTokenId, UserId } from "@domain/refined/ids"
import { downloadTokens, type DownloadTokenModel } from "@infra/db/models/download-token.model"
import { DownloadTokenMapper } from "@infra/db/mappers"
import { eq, and, lt, count, isNull, gt } from "drizzle-orm"
import type { DatabaseInterface } from "@infra/db/interfaces"
import { isUniqueConstraintError, getErrorMessage, translateDbError, translateQueryError } from "@infra/db/errors"
import { DatabaseError } from "@domain/utils/base.errors"
import { fetchSingle, fetchMultiple } from "./helpers"
import { TOKENS } from "@infra/di/container"

/**
 * Drizzle-based Download Token Repository Implementation
 */
@injectable()
export class DownloadTokenDrizzleRepository extends DownloadTokenRepository {
  constructor(@inject(TOKENS.DATABASE_CONNECTION) private readonly db: DatabaseInterface) { 
    super() 
  }

  // ========== Repository Methods ==========

  findById(
    id: DownloadTokenId
  ): E.Effect<O.Option<DownloadTokenEntity>, DownloadTokenNotFoundError | ValidationError | DatabaseError, Clock.Clock> {
    return pipe(
      fetchSingle(
        () => this.db.select().from(downloadTokens).where(eq(downloadTokens.id, id)).limit(1),
        DownloadTokenMapper.fromDb,
        "DownloadToken",
        DownloadTokenNotFoundError
      ),
      E.mapError((error): DownloadTokenNotFoundError | ValidationError | DatabaseError =>
        error instanceof DownloadTokenValidationError
          ? new ValidationError(error.message, error.field, error.value)
          : error
      )
    )
  }

  findByToken(
    token: string
  ): E.Effect<O.Option<DownloadTokenEntity>, DownloadTokenNotFoundError | ValidationError | DatabaseError, Clock.Clock> {
    return pipe(
      fetchSingle(
        () => this.db.select().from(downloadTokens).where(eq(downloadTokens.token, token)).limit(1),
        DownloadTokenMapper.fromDb,
        "DownloadToken",
        DownloadTokenNotFoundError
      ),
      E.mapError((error): DownloadTokenNotFoundError | ValidationError | DatabaseError =>
        error instanceof DownloadTokenValidationError
          ? new ValidationError(error.message, error.field, error.value)
          : error
      )
    )
  }

  findByUserId(
    userId: UserId
  ): E.Effect<readonly DownloadTokenEntity[], DownloadTokenNotFoundError | ValidationError | DatabaseError, Clock.Clock> {
    return pipe(
      fetchMultiple(
        () => this.db.select().from(downloadTokens).where(eq(downloadTokens.issuedTo, userId)),
        DownloadTokenMapper.fromDb,
        "DownloadToken",
        DownloadTokenNotFoundError
      ),
      E.mapError((error): DownloadTokenNotFoundError | ValidationError | DatabaseError =>
        error instanceof DownloadTokenValidationError
          ? new ValidationError(error.message, error.field, error.value)
          : error
      )
    )
  }

  findByDocumentId(
    documentId: DocumentId
  ): E.Effect<readonly DownloadTokenEntity[], DownloadTokenNotFoundError | ValidationError | DatabaseError, Clock.Clock> {
    return pipe(
      fetchMultiple(
        () => this.db.select().from(downloadTokens).where(eq(downloadTokens.documentId, documentId)),
        DownloadTokenMapper.fromDb,
        "DownloadToken",
        DownloadTokenNotFoundError
      ),
      E.mapError((error): DownloadTokenNotFoundError | ValidationError | DatabaseError =>
        error instanceof DownloadTokenValidationError
          ? new ValidationError(error.message, error.field, error.value)
          : error
      )
    )
  }

  findValidTokens(
    documentId: DocumentId,
    userId: UserId
  ): E.Effect<readonly DownloadTokenEntity[], DownloadTokenNotFoundError | ValidationError | DatabaseError, Clock.Clock> {
    return pipe(
      fetchMultiple(
        () => {
          const now = new Date()
          return this.db
            .select()
            .from(downloadTokens)
            .where(
              and(
                eq(downloadTokens.documentId, documentId),
                eq(downloadTokens.issuedTo, userId),
                isNull(downloadTokens.usedAt),  // Only unused tokens
                gt(downloadTokens.expiresAt, now)  // Only unexpired tokens
              )
            )
        },
        DownloadTokenMapper.fromDb,
        "DownloadToken",
        DownloadTokenNotFoundError
      ),
      E.mapError((error): DownloadTokenNotFoundError | ValidationError | DatabaseError =>
        error instanceof DownloadTokenValidationError
          ? new ValidationError(error.message, error.field, error.value)
          : error
      )
    )
  }

  exists(
    id: DownloadTokenId
  ): E.Effect<boolean, DatabaseError, never> {
    return pipe(
      E.tryPromise({
        try: (): Promise<Pick<DownloadTokenModel, "id">[]> =>
          this.db
            .select({ id: downloadTokens.id })
            .from(downloadTokens)
            .where(eq(downloadTokens.id, id))
            .limit(1),
        catch: (error) => new DatabaseError(
          `Database error during exists check on DownloadToken`,
          { originalError: error }
        )
      }),
      E.map((result) => result.length > 0)
    )
  }

  // ========== Pure Helper Functions ==========

  private mapTokenSaveError(error: unknown, token: DownloadTokenEntity): ValidationError | BusinessRuleViolationError | DatabaseError {
    return error instanceof DatabaseError
      ? error
      : error instanceof ValidationError || error instanceof BusinessRuleViolationError
      ? error
      : new ValidationError(
          `Failed to save download token: ${getErrorMessage(error)}`,
          "tokenId",
          token.id
        )
  }

  private ensureExists(id: DownloadTokenId): E.Effect<void, DownloadTokenNotFoundError | DatabaseError, never> {
    return pipe(
      this.exists(id),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () => E.succeed(undefined),
          onFalse: () => E.fail(new DownloadTokenNotFoundError(`Download token not found: id=${id}`, "id", id))
        })
      )
    )
  }

  save(
    token: DownloadTokenEntity
  ): E.Effect<DownloadTokenEntity, ValidationError | BusinessRuleViolationError | DatabaseError, Clock.Clock> {
    return pipe(
      this.findById(token.id),
      E.flatMap((existingToken) =>
        O.match(existingToken, {
          onNone: () => this.insert(token),
          onSome: () => this.update(token)
        })
      ),
      E.mapError((error) => this.mapTokenSaveError(error, token))
    )
  }

  private insert(
    token: DownloadTokenEntity
  ): E.Effect<DownloadTokenEntity, ValidationError | DownloadTokenValidationError | DatabaseError, never> {
    return pipe(
      DownloadTokenMapper.toDb(token),
      E.flatMap((dbData) =>
        E.tryPromise({
          try: () => this.db.insert(downloadTokens).values(dbData),
          catch: (error) =>
            isUniqueConstraintError(error)
              ? new ValidationError(
                  `Download token with token '${token.token}' already exists`,
                  'token',
                  token.token
                )
              : translateDbError(
                  error,
                  { operation: "insert", entityType: "DownloadToken" },
                  {
                    createConflictError: (message: string) => new ValidationError(message, "tokenId", token.id),
                    createNotFoundError: (field: string, value: string) => new ValidationError(`Download token not found: ${field}=${value}`, field, value),
                    createValidationError: (message: string, field: string) => new ValidationError(message, field, token.id)
                  }
                )
        })
      ),
      E.as(token)
    )
  }

  private update(
    token: DownloadTokenEntity
  ): E.Effect<DownloadTokenEntity, ValidationError | DownloadTokenNotFoundError | DatabaseError | DownloadTokenValidationError, never> {
    return pipe(
      this.ensureExists(token.id),
      E.flatMap(() => DownloadTokenMapper.toDb(token)),
      E.flatMap((dbData) =>
        E.tryPromise({
          try: () => this.db
            .update(downloadTokens)
            .set(dbData)
            .where(eq(downloadTokens.id, token.id)),
          catch: (error) => translateDbError(
            error,
            { operation: "update", entityType: "DownloadToken" },
            {
              createConflictError: (message: string) => new ValidationError(message, "tokenId", token.id),
              createNotFoundError: (field: string, value: string) => new ValidationError(`Download token not found: ${field}=${value}`, field, value),
              createValidationError: (message: string, field: string) => new ValidationError(message, field, token.id)
            }
          )
        })
      ),
      E.as(token)
    )
  }

  private mapMarkAsUsedError(
    error: unknown,
    tokenString: string
  ): DownloadTokenNotFoundError | DownloadTokenAlreadyUsedError | BusinessRuleViolationError | ValidationError | DatabaseError {

    if (
      error instanceof DatabaseError ||
      error instanceof DownloadTokenAlreadyUsedError ||
      error instanceof BusinessRuleViolationError ||
      error instanceof ValidationError ||
      error instanceof DownloadTokenNotFoundError
    ) {
      return error
    }
    
    // Fallback for unexpected errors
    return new ValidationError(
      `Failed to mark token as used: ${getErrorMessage(error)}`,
      "token",
      tokenString
    )
  }

  markAsUsed(
    token: string
  ): E.Effect<DownloadTokenEntity, DownloadTokenNotFoundError | DownloadTokenAlreadyUsedError | BusinessRuleViolationError | ValidationError | DatabaseError, Clock.Clock> {
    return pipe(
      this.findByToken(token),
      E.flatMap((tokenOption) =>
        O.match(tokenOption, {
          onNone: () => E.fail(new DownloadTokenNotFoundError(`Download token not found: token=${token}`, "token", token)),
          onSome: (tokenEntity) => pipe(
            tokenEntity.markAsUsed(),
            E.flatMap((updatedToken) => this.update(updatedToken)),
            E.mapError((error) => this.mapMarkAsUsedError(error, token))
          )
        })
      )
    )
  }

  delete(
    id: DownloadTokenId
  ): E.Effect<boolean, DownloadTokenNotFoundError | DatabaseError, never> {
    return pipe(
      this.exists(id),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () =>
            pipe(
              E.tryPromise({
                try: () => this.db.delete(downloadTokens).where(eq(downloadTokens.id, id)),
                catch: (error) => translateDbError(
                  error,
                  { operation: "delete", entityType: "DownloadToken" },
                  {
                    createConflictError: (message: string) => new DatabaseError(message),
                    createNotFoundError: (field: string, value: string) => new DownloadTokenNotFoundError(`Download token not found: ${field}=${value}`, field, value),
                    createValidationError: (message: string) => new DatabaseError(message)
                  }
                )
              }),
              E.as(true)
            ),
          onFalse: () => E.fail(new DownloadTokenNotFoundError(`Download token not found: id=${id}`, "id", id))
        })
      )
    )
  }

  deleteExpiredTokens(): E.Effect<number, DatabaseError, never> {
    return pipe(
      E.tryPromise({
        try: async () => {
          const now = new Date()
          const result = await this.db
            .delete(downloadTokens)
            .where(lt(downloadTokens.expiresAt, now))
          
          return result.rowCount ?? 0
        },
        catch: (error) => translateDbError(
          error,
          { operation: "deleteExpiredTokens", entityType: "DownloadToken" },
          {
            createConflictError: (message: string) => new DatabaseError(message),
            createNotFoundError: (field: string, value: string) => 
              new DatabaseError(`Token not found: ${field}=${value}`, { field, value }),
            createValidationError: (message: string, field: string) => 
              new DatabaseError(message, { constraint: field })
          }
        )
      })
    )
  }

  deleteByDocumentId(
    documentId: DocumentId
  ): E.Effect<number, DownloadTokenNotFoundError | DatabaseError, never> {
    return pipe(
      E.tryPromise({
        try: async () => {
          const result = await this.db
            .delete(downloadTokens)
            .where(eq(downloadTokens.documentId, documentId))
          
          return result.rowCount ?? 0
        },
        catch: (error) => translateQueryError(
          error,
          { operation: "deleteByDocumentId", entityType: "DownloadToken", field: "documentId", value: documentId },
          (message, field, value, details) => new DownloadTokenNotFoundError(message, field, value, details)
        )
      })
    )
  }

  list(options?: PaginationOptions): E.Effect<Paginated<DownloadTokenEntity>, DownloadTokenNotFoundError | ValidationError | DatabaseError, Clock.Clock> {
    const paginationOptions = options ?? defaultPaginationOptions()
    const offset = (paginationOptions.pageNum - 1) * paginationOptions.pageSize

    return pipe(
      E.tryPromise({
        try: async () => {
          const [data, totalResult] = await Promise.all([
            this.db
              .select()
              .from(downloadTokens)
              .limit(paginationOptions.pageSize)
              .offset(offset)
              .orderBy(downloadTokens.createdAt),
            this.db
              .select({ count: count() })
              .from(downloadTokens)
          ])

          return { 
            data: data as DownloadTokenModel[], 
            total: Number(totalResult[0]?.count ?? 0)
          }
        },
        catch: (error) => translateQueryError(
          error,
          { operation: "list", entityType: "DownloadToken", field: "list", value: "all" },
          (message, field, value, details) => new DownloadTokenNotFoundError(message, field, value, details)
        )
      }),
      E.flatMap(({ data, total }) =>
        data.length === 0
          ? E.succeed({
              data: [] as readonly DownloadTokenEntity[],
              total,
              pageNum: paginationOptions.pageNum,
              pageSize: paginationOptions.pageSize,
              totalPages: calculateTotalPages(total, paginationOptions.pageSize)
            } as Paginated<DownloadTokenEntity>)
          : pipe(
              E.forEach(data, (row) =>
                pipe(
                  DownloadTokenMapper.fromDb(row),
                  E.mapError((error): DownloadTokenNotFoundError | ValidationError =>
                    error instanceof DownloadTokenValidationError
                      ? new ValidationError(error.message, error.field, error.value)
                      : error
                  )
                )
              ),
              E.map((entities): Paginated<DownloadTokenEntity> => ({
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
