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
import { isUniqueConstraintError, getErrorMessage, translateDbError } from "@infra/db/errors"
import type { InfrastructureErrorType } from "@infra/errors/infrastructure.errors"
import { fetchSingle, fetchMultiple, mapInfraErrorToDomainWithFailFast, executeQuery } from "./helpers"
import { isInfraError } from "app/shared/error-matching"
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

  /**
   * Wrapper for DownloadTokenMapper.fromDb that converts DownloadTokenValidationError to ValidationError
   */
  private mapTokenFromDb(row: DownloadTokenModel): E.Effect<DownloadTokenEntity, ValidationError, Clock.Clock> {
    return pipe(
      DownloadTokenMapper.fromDb(row),
      E.mapError((error) => new ValidationError(error.message, error.field, error.value))
    )
  }

  findById(
    id: DownloadTokenId
  ): E.Effect<O.Option<DownloadTokenEntity>, DownloadTokenNotFoundError | ValidationError, Clock.Clock> {
    return pipe(
      fetchSingle(
        () => this.db.select().from(downloadTokens).where(eq(downloadTokens.id, id)).limit(1),
        this.mapTokenFromDb.bind(this),
        {
          entityType: "DownloadToken",
          operation: "findById",
          entityId: id
        }
      ),
      E.catchAll((error) => {
        // Map infrastructure errors to domain errors
        if (isInfraError(error)) {
          return mapInfraErrorToDomainWithFailFast("DownloadToken", (msg, field, value) => new DownloadTokenNotFoundError(msg, field, value))(error)
        }
        // Pass through ValidationError
        return E.fail(error as ValidationError)
      })
    )
  }

  findByToken(
    token: string
  ): E.Effect<O.Option<DownloadTokenEntity>, DownloadTokenNotFoundError | ValidationError, Clock.Clock> {
    return pipe(
      fetchSingle(
        () => this.db.select().from(downloadTokens).where(eq(downloadTokens.token, token)).limit(1),
        this.mapTokenFromDb.bind(this),
        {
          entityType: "DownloadToken",
          operation: "findByToken"
        }
      ),
      E.catchAll((error) => {
        // Map infrastructure errors to domain errors
        if (isInfraError(error)) {
          return mapInfraErrorToDomainWithFailFast("DownloadToken", (msg, field, value) => new DownloadTokenNotFoundError(msg, field, value))(error)
        }
        // Pass through ValidationError
        return E.fail(error as ValidationError)
      })
    )
  }

  findByUserId(
    userId: UserId
  ): E.Effect<readonly DownloadTokenEntity[], DownloadTokenNotFoundError | ValidationError, Clock.Clock> {
    return pipe(
      fetchMultiple(
        () => this.db.select().from(downloadTokens).where(eq(downloadTokens.issuedTo, userId)),
        this.mapTokenFromDb.bind(this),
        {
          entityType: "DownloadToken",
          operation: "findByUserId"
        }
      ),
      E.catchAll((error) => {
        // Map infrastructure errors to domain errors
        if (isInfraError(error)) {
          return mapInfraErrorToDomainWithFailFast("DownloadToken", (msg, field, value) => new DownloadTokenNotFoundError(msg, field, value))(error)
        }
        // Pass through ValidationError
        return E.fail(error as ValidationError)
      })
    )
  }

  findByDocumentId(
    documentId: DocumentId
  ): E.Effect<readonly DownloadTokenEntity[], DownloadTokenNotFoundError | ValidationError, Clock.Clock> {
    return pipe(
      fetchMultiple(
        () => this.db.select().from(downloadTokens).where(eq(downloadTokens.documentId, documentId)),
        this.mapTokenFromDb.bind(this),
        {
          entityType: "DownloadToken",
          operation: "findByDocumentId"
        }
      ),
      E.catchAll((error) => {
        // Map infrastructure errors to domain errors
        if (isInfraError(error)) {
          return mapInfraErrorToDomainWithFailFast("DownloadToken", (msg, field, value) => new DownloadTokenNotFoundError(msg, field, value))(error)
        }
        // Pass through ValidationError
        return E.fail(error as ValidationError)
      })
    )
  }

  findValidTokens(
    documentId: DocumentId,
    userId: UserId
  ): E.Effect<readonly DownloadTokenEntity[], DownloadTokenNotFoundError | ValidationError, Clock.Clock> {
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
        this.mapTokenFromDb.bind(this),
        {
          entityType: "DownloadToken",
          operation: "findValidTokens"
        }
      ),
      E.catchAll((error) => {
        // Map infrastructure errors to domain errors
        if (isInfraError(error)) {
          return mapInfraErrorToDomainWithFailFast("DownloadToken", (msg, field, value) => new DownloadTokenNotFoundError(msg, field, value))(error)
        }
        // Pass through ValidationError
        return E.fail(error as ValidationError)
      })
    )
  }

  exists(
    id: DownloadTokenId
  ): E.Effect<boolean, InfrastructureErrorType> {
    return pipe(
      executeQuery(
        () => this.db
          .select({ id: downloadTokens.id })
          .from(downloadTokens)
          .where(eq(downloadTokens.id, id))
          .limit(1),
        {
          entityType: "DownloadToken",
          operation: "exists",
          entityId: id
        }
      ),
      E.map((result) => result.length > 0)
    )
  }

  // ========== Pure Helper Functions ==========

  private mapTokenSaveError(error: unknown, token: DownloadTokenEntity): ValidationError | BusinessRuleViolationError {
    return error instanceof ValidationError || error instanceof BusinessRuleViolationError
      ? error
      : new ValidationError(
          `Failed to save download token: ${getErrorMessage(error)}`,
          "tokenId",
          token.id
        )
  }

  private ensureExists(id: DownloadTokenId): E.Effect<void, DownloadTokenNotFoundError, never> {
    return pipe(
      this.exists(id),
      E.catchAll((error) => {
        // Map infrastructure errors (unexpected errors will fail fast as defects via mapInfraErrorToDomainWithFailFast)
        if (isInfraError(error)) {
          return pipe(
            mapInfraErrorToDomainWithFailFast("DownloadToken", (msg, field, value) => new DownloadTokenNotFoundError(msg, field, value))(error),
            E.mapError((err) => err instanceof DownloadTokenNotFoundError ? err : new DownloadTokenNotFoundError(err.message, err.field, err.value))
          )
        }
        // Unknown errors should fail fast
        return E.die(error)
      }),
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
  ): E.Effect<DownloadTokenEntity, ValidationError | BusinessRuleViolationError, Clock.Clock> {
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
  ): E.Effect<DownloadTokenEntity, ValidationError | DownloadTokenValidationError, never> {
    return pipe(
      DownloadTokenMapper.toDb(token),
      E.flatMap((dbData) =>
        pipe(
          E.tryPromise({
            try: () => this.db.insert(downloadTokens).values(dbData),
            catch: (error) => error
          }),
          E.catchAll((error): E.Effect<void, ValidationError, never> => {
            // Handle unique constraint violations with domain-specific error
            if (isUniqueConstraintError(error)) {
              return E.fail(new ValidationError(
                `Download token with token '${token.token}' already exists`,
                'token',
                token.token
              ))
            }
            // Translate infrastructure errors to domain errors
            return pipe(
              translateDbError(error, { operation: "insert", entityType: "DownloadToken", entityId: token.id }),
              E.catchAll(mapInfraErrorToDomainWithFailFast("DownloadToken", (msg, field, value) => new DownloadTokenNotFoundError(msg, field, value))),
              E.mapError((infraError): ValidationError => 
                infraError instanceof DownloadTokenNotFoundError
                  ? new ValidationError(infraError.message, infraError.field, infraError.value)
                  : infraError as ValidationError
              )
            )
          })
        )
      ),
      E.as(token),
      E.mapError((error): ValidationError | DownloadTokenValidationError => {
        if (error instanceof DownloadTokenValidationError) {
          return error
        }
        // error is ValidationError at this point (NotFoundError was already converted in catchAll)
        return error as ValidationError
      })
    )
  }

  private update(
    token: DownloadTokenEntity
  ): E.Effect<DownloadTokenEntity, ValidationError | DownloadTokenValidationError, never> {
    return pipe(
      this.ensureExists(token.id),
      E.flatMap(() => DownloadTokenMapper.toDb(token)),
      E.flatMap((dbData) =>
        pipe(
          E.tryPromise({
            try: () => this.db
              .update(downloadTokens)
              .set(dbData)
              .where(eq(downloadTokens.id, token.id)),
            catch: (error) => error
          }),
          E.catchAll((error) =>
            pipe(
              translateDbError(error, { operation: "update", entityType: "DownloadToken", entityId: token.id }),
              E.catchAll(mapInfraErrorToDomainWithFailFast("DownloadToken", (msg, field, value) => new DownloadTokenNotFoundError(msg, field, value)))
            )
          )
        )
      ),
      E.as(token),
      E.mapError((error): ValidationError | DownloadTokenValidationError => {
        if (error instanceof DownloadTokenValidationError) {
          return error
        }
        // Convert DownloadTokenNotFoundError to ValidationError
        if (error instanceof DownloadTokenNotFoundError) {
          return new ValidationError(error.message, error.field, error.value)
        }
        // error is ValidationError
        return error as ValidationError
      })
    )
  }

  private mapMarkAsUsedError(
    error: unknown,
    tokenString: string
  ): DownloadTokenNotFoundError | DownloadTokenAlreadyUsedError | BusinessRuleViolationError | ValidationError {
    if (
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
  ): E.Effect<DownloadTokenEntity, DownloadTokenNotFoundError | DownloadTokenAlreadyUsedError | BusinessRuleViolationError | ValidationError, Clock.Clock> {
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
  ): E.Effect<boolean, DownloadTokenNotFoundError, never> {
    return pipe(
      this.exists(id),
      E.catchAll((error) => {
        // Map infrastructure errors (unexpected errors will fail fast as defects via mapInfraErrorToDomainWithFailFast)
        if (isInfraError(error)) {
          return pipe(
            mapInfraErrorToDomainWithFailFast("DownloadToken", (msg, field, value) => new DownloadTokenNotFoundError(msg, field, value))(error),
            E.mapError((err) => err instanceof DownloadTokenNotFoundError ? err : new DownloadTokenNotFoundError(err.message, err.field, err.value))
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
                try: () => this.db.delete(downloadTokens).where(eq(downloadTokens.id, id)),
                catch: (error) => error
              }),
              E.catchAll((error) =>
                pipe(
                  translateDbError(error, { operation: "delete", entityType: "DownloadToken", entityId: id }),
                  E.catchAll(mapInfraErrorToDomainWithFailFast("DownloadToken", (msg, field, value) => new DownloadTokenNotFoundError(msg, field, value)))
                )
              ),
              E.mapError((error): DownloadTokenNotFoundError => 
                error instanceof DownloadTokenNotFoundError
                  ? error
                  : new DownloadTokenNotFoundError(`Failed to delete download token: ${error instanceof Error ? error.message : String(error)}`, "id", id)
              ),
              E.as(true)
            ),
          onFalse: () => E.fail(new DownloadTokenNotFoundError(`Download token not found: id=${id}`, "id", id))
        })
      )
    )
  }

  deleteExpiredTokens(): E.Effect<number, InfrastructureErrorType> {
    return pipe(
      executeQuery(
        async () => {
          const now = new Date()
          const result = await this.db
            .delete(downloadTokens)
            .where(lt(downloadTokens.expiresAt, now))
          
          return result.rowCount ?? 0
        },
        {
          entityType: "DownloadToken",
          operation: "deleteExpiredTokens"
        }
      )
    )
  }

  deleteByDocumentId(
    documentId: DocumentId
  ): E.Effect<number, DownloadTokenNotFoundError, never> {
    return pipe(
      E.tryPromise({
        try: async () => {
          const result = await this.db
            .delete(downloadTokens)
            .where(eq(downloadTokens.documentId, documentId))
          
          return result.rowCount ?? 0
        },
        catch: (error) => error
      }),
      E.catchAll((error) =>
        pipe(
          translateDbError(error, { operation: "deleteByDocumentId", entityType: "DownloadToken" }),
          E.catchAll(mapInfraErrorToDomainWithFailFast("DownloadToken", (msg, field, value) => new DownloadTokenNotFoundError(msg, field, value)))
        )
      ),
      E.mapError((error): DownloadTokenNotFoundError => 
        error instanceof DownloadTokenNotFoundError
          ? error
          : new DownloadTokenNotFoundError(`Failed to delete download tokens by documentId: ${error instanceof Error ? error.message : String(error)}`, "documentId", documentId)
      )
    )
  }

  list(options?: PaginationOptions): E.Effect<Paginated<DownloadTokenEntity>, DownloadTokenNotFoundError | ValidationError, Clock.Clock> {
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
        catch: (error) => error
      }),
      E.catchAll((error) =>
        pipe(
          translateDbError(error, { operation: "list", entityType: "DownloadToken" }),
          E.catchAll(mapInfraErrorToDomainWithFailFast("DownloadToken", (msg, field, value) => new DownloadTokenNotFoundError(msg, field, value)))
        )
      ),
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
              E.forEach(data, (row) => this.mapTokenFromDb(row)),
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
