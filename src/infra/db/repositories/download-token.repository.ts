import { Effect as E, Option as O, pipe } from "effect"
import { DownloadTokenEntity } from "../../../domain/entities/download-token.entity"
import { DownloadTokenRepository } from "../../../domain/ports/download-token.repository"
import { DownloadTokenId, UserId, DocumentId } from "../../../domain/value-objects/id.vo"
import { 
  DownloadTokenNotFoundError,
  DownloadTokenAlreadyUsedError
} from "../../../domain/ports/download-token.repository"
import { ValidationError, BusinessRuleViolationError } from "../../../domain/errors/domain.errors"
import { downloadTokens, type DownloadTokenModel } from "../../../lib/db/models"
import { eq, and, lt } from "drizzle-orm"
import type { DatabaseInterface } from "../../../lib/db/interfaces"

/**
 * Drizzle-based Download Token Repository Implementation
 */
export class DownloadTokenDrizzleRepository extends DownloadTokenRepository {
  constructor(private readonly db: DatabaseInterface) { 
    super() 
  }

  // ========== Serialization Helpers ==========

  private toDbSerialized(token: DownloadTokenEntity): E.Effect<Omit<DownloadTokenModel, 'updatedAt'>, ValidationError, never> {
    return E.sync(() => ({
      id: token.id,
      token: token.token,
      documentId: token.documentId,
      issuedTo: token.issuedTo,
      expiresAt: token.expiresAt,
      usedAt: O.getOrNull(token.usedAt),
      createdAt: token.createdAt
    }))
  }

  private fromDbRow(row: DownloadTokenModel): E.Effect<DownloadTokenEntity, ValidationError, never> {
    return DownloadTokenEntity.fromPersistence({
      id: row.id,
      token: row.token,
      documentId: row.documentId,
      issuedTo: row.issuedTo,
      expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : row.expiresAt,
      usedAt: row.usedAt instanceof Date ? row.usedAt.toISOString() : (row.usedAt ?? null),
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt
    })
  }

  // ========== Query Helpers ==========

  private executeQuery<T>(query: () => Promise<T>): E.Effect<T, DownloadTokenNotFoundError> {
    return E.tryPromise({
      try: query,
      catch: (error) => new DownloadTokenNotFoundError(
        undefined,
        undefined,
        { originalError: error instanceof Error ? error.message : String(error) }
      )
    })
  }

  private fetchSingle(
    query: () => Promise<DownloadTokenModel[]>
  ): E.Effect<O.Option<DownloadTokenEntity>, DownloadTokenNotFoundError | ValidationError, never> {
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

  private fetchMultiple(
    query: () => Promise<DownloadTokenModel[]>
  ): E.Effect<readonly DownloadTokenEntity[], DownloadTokenNotFoundError | ValidationError, never> {
    return pipe(
      this.executeQuery(query),
      E.flatMap((results) => 
        E.all(results.map((row) => this.fromDbRow(row)))
      )
    )
  }

  // ========== Repository Methods ==========

  findById(
    id: DownloadTokenId
  ): E.Effect<O.Option<DownloadTokenEntity>, DownloadTokenNotFoundError | ValidationError, never> {
    return this.fetchSingle(() =>
      this.db.select().from(downloadTokens).where(eq(downloadTokens.id, id)).limit(1)
    )
  }

  findByToken(
    token: string
  ): E.Effect<O.Option<DownloadTokenEntity>, DownloadTokenNotFoundError | ValidationError, never> {
    return this.fetchSingle(() =>
      this.db.select().from(downloadTokens).where(eq(downloadTokens.token, token)).limit(1)
    )
  }

  findByUserId(
    userId: UserId
  ): E.Effect<readonly DownloadTokenEntity[], DownloadTokenNotFoundError | ValidationError, never> {
    return this.fetchMultiple(() =>
      this.db.select().from(downloadTokens).where(eq(downloadTokens.issuedTo, userId))
    )
  }

  findByDocumentId(
    documentId: DocumentId
  ): E.Effect<readonly DownloadTokenEntity[], DownloadTokenNotFoundError | ValidationError, never> {
    return this.fetchMultiple(() =>
      this.db.select().from(downloadTokens).where(eq(downloadTokens.documentId, documentId))
    )
  }

  findValidTokens(
    documentId: DocumentId,
    userId: UserId
  ): E.Effect<readonly DownloadTokenEntity[], DownloadTokenNotFoundError | ValidationError, never> {
    const now = new Date()
    
    return pipe(
      this.fetchMultiple(() =>
        this.db
          .select()
          .from(downloadTokens)
          .where(
            and(
              eq(downloadTokens.documentId, documentId),
              eq(downloadTokens.issuedTo, userId)
            )
          )
      ),
      // Filter in-memory for valid (not expired and not used) tokens
      E.map((tokens) => 
        tokens.filter((token) => 
          token.isCurrentlyValid && token.expiresAt > now
        )
      )
    )
  }

  exists(
    id: DownloadTokenId
  ): E.Effect<boolean, DownloadTokenNotFoundError, never> {
    return pipe(
      E.tryPromise({
        try: (): Promise<Pick<DownloadTokenModel, "id">[]> =>
          this.db
            .select({ id: downloadTokens.id })
            .from(downloadTokens)
            .where(eq(downloadTokens.id, id))
            .limit(1),
        catch: () => new DownloadTokenNotFoundError(id)
      }),
      E.map((result) => result.length > 0)
    )
  }

  private ensureExists(id: DownloadTokenId): E.Effect<void, DownloadTokenNotFoundError, never> {
    return pipe(
      this.exists(id),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () => E.succeed(undefined),
          onFalse: () => E.fail(new DownloadTokenNotFoundError(id))
        })
      )
    )
  }

  save(
    token: DownloadTokenEntity
  ): E.Effect<DownloadTokenEntity, ValidationError | BusinessRuleViolationError, never> {
    return pipe(
      // Check if token already exists
      this.findById(token.id),
      E.flatMap((existingToken) =>
        O.match(existingToken, {
          onNone: () => this.insert(token),
          onSome: () => this.update(token)
        })
      ),
      E.mapError((error) => {
        if (error instanceof ValidationError || error instanceof BusinessRuleViolationError) {
          return error
        }
        return new ValidationError(
          `Failed to save download token: ${error}`,
          undefined,
          { tokenId: token.id }
        )
      })
    )
  }

  private insert(
    token: DownloadTokenEntity
  ): E.Effect<DownloadTokenEntity, ValidationError, never> {
    return pipe(
      this.toDbSerialized(token),
      E.flatMap((dbData) =>
        E.tryPromise({
          try: () => this.db.insert(downloadTokens).values(dbData),
          catch: (error) => {
            const errorMsg = error instanceof Error ? error.message : String(error)
            if (errorMsg.includes('unique') || errorMsg.includes('duplicate')) {
              return new ValidationError(
                `Download token with token '${token.token}' already exists`,
                'token',
                token.token
              )
            }
            return new ValidationError(
              `Failed to insert download token: ${errorMsg}`,
              undefined,
              { tokenId: token.id }
            )
          }
        })
      ),
      E.as(token)
    )
  }

  private update(
    token: DownloadTokenEntity
  ): E.Effect<DownloadTokenEntity, ValidationError | DownloadTokenNotFoundError, never> {
    return pipe(
      this.ensureExists(token.id),
      E.flatMap(() => this.toDbSerialized(token)),
      E.flatMap((dbData) =>
        E.tryPromise({
          try: () => this.db
            .update(downloadTokens)
            .set(dbData)
            .where(eq(downloadTokens.id, token.id)),
          catch: (error) => new ValidationError(
            `Failed to update download token: ${error instanceof Error ? error.message : String(error)}`,
            undefined,
            { tokenId: token.id }
          )
        })
      ),
      E.as(token)
    )
  }

  markAsUsed(
    token: string
  ): E.Effect<DownloadTokenEntity, DownloadTokenNotFoundError | DownloadTokenAlreadyUsedError | ValidationError, never> {
    return pipe(
      // Find the token by token string
      this.findByToken(token),
      E.flatMap((tokenOption) =>
        O.match(tokenOption, {
          onNone: () => E.fail(new DownloadTokenNotFoundError(
            undefined,
            token
          )),
          onSome: (tokenEntity) => pipe(
            // Mark the entity as used
            tokenEntity.markAsUsed(),
            E.flatMap((updatedToken) => this.update(updatedToken)),
            E.mapError((error): DownloadTokenNotFoundError | DownloadTokenAlreadyUsedError | ValidationError => {
              if (error instanceof BusinessRuleViolationError) {
                // Check the details object for the rule field
                const rule = (error.details as { rule?: string })?.rule
                if (rule === "TOKEN_ALREADY_USED") {
                  return new DownloadTokenAlreadyUsedError(tokenEntity.id)
                }
              }
              if (error instanceof ValidationError) {
                return error
              }
              if (error instanceof DownloadTokenNotFoundError) {
                return error
              }
              return new ValidationError(
                `Failed to mark token as used: ${error}`,
                undefined,
                { token }
              )
            })
          )
        })
      )
    )
  }

  delete(
    id: DownloadTokenId
  ): E.Effect<boolean, DownloadTokenNotFoundError, never> {
    return pipe(
      this.ensureExists(id),
      E.flatMap(() =>
        E.tryPromise({
          try: () => this.db.delete(downloadTokens).where(eq(downloadTokens.id, id)),
          catch: () => new DownloadTokenNotFoundError(id)
        })
      ),
      E.as(true)
    )
  }

  deleteExpiredTokens(): E.Effect<number, never, never> {
    const now = new Date()
    
    return pipe(
      E.tryPromise({
        try: async () => {
          // First, count how many expired tokens exist
          const expiredTokens = await this.db
            .select({ id: downloadTokens.id })
            .from(downloadTokens)
            .where(lt(downloadTokens.expiresAt, now))
          
          const count = expiredTokens.length
          
          // Then delete them if any exist
          if (count > 0) {
            await this.db
              .delete(downloadTokens)
              .where(lt(downloadTokens.expiresAt, now))
          }
          
          return count
        },
        catch: () => 0 // Never fails, returns 0 on error
      }),
      E.catchAll(() => E.succeed(0))
    )
  }

  deleteByDocumentId(
    documentId: DocumentId
  ): E.Effect<number, DownloadTokenNotFoundError, never> {
    return pipe(
      E.tryPromise({
        try: async () => {
          // First, count how many tokens exist for this document
          const tokensToDelete = await this.db
            .select({ id: downloadTokens.id })
            .from(downloadTokens)
            .where(eq(downloadTokens.documentId, documentId))
          
          const count = tokensToDelete.length
          
          // Then delete them if any exist
          if (count > 0) {
            await this.db
              .delete(downloadTokens)
              .where(eq(downloadTokens.documentId, documentId))
          }
          
          return count
        },
        catch: (error) => new DownloadTokenNotFoundError(
          undefined,
          undefined,
          { 
            documentId,
            originalError: error instanceof Error ? error.message : String(error) 
          }
        )
      })
    )
  }
}

