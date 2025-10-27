import "reflect-metadata"

import { Effect, Option, pipe, Schema as S, ParseResult, Clock } from "effect"
import { injectable, inject } from "tsyringe"

// Domain repositories
import { DownloadTokenRepository } from "@domain/downloadToken/download-token.repository"
import { DocumentRepository } from "@domain/document/document.repository"
import { AccessPolicyRepository } from "@domain/accessPolicy/access-policy.repository"
import { UserRepository } from "@domain/user/user.repository"

// Domain errors
import { DownloadTokenNotFoundError, DownloadTokenValidationError, DownloadTokenAlreadyUsedError } from "@domain/downloadToken/download-token.error"
import { BusinessRuleViolationError, DatabaseError } from "@domain/utils/base.errors"

// Application errors
import { 
  WorkflowError,
  DownloadTokenGenerationError,
  PermissionCheckError,
  WorkflowDependencyError 
} from "@application/errors/application.errors"

// Application DTOs
import {
  CreateDownloadTokenCommandEncoded,
  CreateDownloadTokenCommandSchema,
  ValidateDownloadTokenQueryEncoded,
  ValidateDownloadTokenQuerySchema,
  ListDownloadTokensQueryEncoded,
  ListDownloadTokensQuerySchema,
  RevokeDownloadTokenCommandEncoded,
  RevokeDownloadTokenCommandSchema,
  UseDownloadTokenCommandEncoded,
  UseDownloadTokenCommandSchema
} from "@application/dto/downloadToken/commands.dto"

import {
  DownloadTokenResponseEncoded,
  PaginatedDownloadTokensResponseEncoded,
  ValidateDownloadTokenResponseEncoded,
  RevokeDownloadTokenResponseEncoded
} from "@application/dto/downloadToken/responses.dto"

// Application workflow helpers
import {
  loadActor,
  loadDocument,
  ensurePermission,
  mapToWorkflowDependencyError,
  mapDownloadTokenPersistenceError,
  mapDownloadTokenDomainError,
  applyPagination
} from "@application/workflow/helpers"

// DI tokens
import { TOKENS } from "@infra/di/container"

// Refined types
import { UserId, DocumentId, DownloadTokenId } from "@domain/refined/ids"
import { DownloadTokenEntity, SerializedDownloadToken } from "@domain/downloadToken/download-token.entity"

/**
 * Responsibilities:
 * - Coordinate download token creation, validation, and usage
 * - Validate permissions for token operations
 * - Ensure token ownership and validity
 * - Map token errors to application-level errors
 */
@injectable()
export class DownloadTokenWorkflow {
  constructor(
    @inject(TOKENS.DOWNLOAD_TOKEN_REPOSITORY)
    private readonly downloadTokenRepository: DownloadTokenRepository,
    
    @inject(TOKENS.DOCUMENT_REPOSITORY)
    private readonly documentRepository: DocumentRepository,
    
    @inject(TOKENS.USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    
    @inject(TOKENS.ACCESS_POLICY_REPOSITORY)
    private readonly accessPolicyRepository: AccessPolicyRepository
  ) {}

  // ===== PRIVATE HELPER METHODS =====

  private serializeToken(
    token: DownloadTokenEntity
  ): Effect.Effect<SerializedDownloadToken, WorkflowDependencyError> {
    return pipe(
      token.serialized(),
      Effect.mapError((error) =>
        mapToWorkflowDependencyError(
          "DownloadTokenEntity",
          "serialize"
        )(error)
      )
    )
  }

  // ===== PUBLIC WORKFLOW METHODS =====

  createDownloadToken(
    input: CreateDownloadTokenCommandEncoded
  ): Effect.Effect<DownloadTokenResponseEncoded, WorkflowError | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode DTO using schema validation
      S.decodeUnknown(CreateDownloadTokenCommandSchema)(input),
      Effect.flatMap((dto) =>
        // 2. Load actor and document in parallel (with workspace validation)
        Effect.all([
          loadActor(this.userRepository, dto.actorId),
          loadDocument(this.documentRepository, dto.documentId, dto.workspaceId)
        ]).pipe(
          Effect.flatMap(([actor, document]) =>
            // 3. Ensure download permission (read level)
            ensurePermission(this.accessPolicyRepository, actor, document, "read").pipe(
              Effect.flatMap(() =>
                // 4. Generate token ID and token string
                Effect.all([
                  Effect.sync(() => crypto.randomUUID()),
                  Effect.sync(() => {
                    // Generate a secure random token string (URL-safe base64)
                    const bytes = new Uint8Array(32)
                    crypto.getRandomValues(bytes)
                    return Buffer.from(bytes).toString('base64url')
                  })
                ])
              ),
              Effect.flatMap(([generatedIdString, tokenString]) =>
                // 5. Validate generated UUID
                S.decodeUnknown(DownloadTokenId)(generatedIdString).pipe(
                  Effect.mapError((error) => new WorkflowDependencyError(
                    `Failed to validate generated token ID: ${error.message}`,
                    "DownloadTokenId",
                    "validation",
                    { originalError: error, generatedId: generatedIdString }
                  )),
                  Effect.flatMap((validatedId) =>
                    // 6. Build token data
                    {
                      const tokenData: Partial<SerializedDownloadToken> = {
                        id: validatedId,
                        token: tokenString,
                        documentId: dto.documentId,
                        issuedTo: dto.issuedTo,
                        expiresAt: dto.expiresAt // Already an ISO string from DTO
                      }
                      
                      return DownloadTokenEntity.create(tokenData as SerializedDownloadToken)
                    }
                  )
                )
              )
            )
          )
        )
      ),
      Effect.mapError((error) => {
        // Map domain errors to WorkflowError
        if (error instanceof DownloadTokenValidationError) {
          return new DownloadTokenGenerationError(
            `Token validation failed: ${error.message}`,
            input.documentId,
            input.issuedTo,
            { originalError: error }
          )
        }
        if (error instanceof PermissionCheckError) {
          return error // Already a WorkflowError
        }
        if (error instanceof WorkflowDependencyError) {
          return error
        }
        return error as unknown as WorkflowError
      }),
      Effect.flatMap((token) =>
        // 6. Persist token
        this.downloadTokenRepository.save(token).pipe(
          Effect.mapError((error) => new DownloadTokenGenerationError(
            `Failed to save download token: ${error instanceof Error ? error.message : String(error)}`,
            input.documentId,
            input.issuedTo,
            { originalError: error }
          ))
        )
      ),
      Effect.flatMap((savedToken) =>
        // 7. Return serialized token
        this.serializeToken(savedToken)
      ),
      Effect.provideService(Clock.Clock, Clock.make())
    ) as Effect.Effect<DownloadTokenResponseEncoded, WorkflowError | ParseResult.ParseError, Clock.Clock>
  }

  validateDownloadToken(
    input: ValidateDownloadTokenQueryEncoded
  ): Effect.Effect<ValidateDownloadTokenResponseEncoded, WorkflowError | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode DTO using schema validation
      S.decodeUnknown(ValidateDownloadTokenQuerySchema)(input),
      Effect.flatMap((dto) =>
        // 2. Load actor
        loadActor(this.userRepository, dto.actorId).pipe(
          Effect.flatMap((actor) =>
            // 3. Find token by token string
            this.downloadTokenRepository.findByToken(dto.token).pipe(
              Effect.mapError(mapDownloadTokenPersistenceError("findByToken")),
              Effect.flatMap((tokenOption) =>
                // 4. Handle Option.none case with DownloadTokenValidationError
                Option.match(tokenOption, {
                  onNone: () => Effect.fail(new DownloadTokenValidationError(
                    `Token not found: ${dto.token}`,
                    "token",
                    dto.token,
                    { reason: "NOT_FOUND" }
                  ) as WorkflowError),
                  onSome: (token) => Effect.succeed(token)
                })
              ),
              Effect.flatMap((token) =>
                // 5. Load document for permission check (with workspace validation)
                loadDocument(this.documentRepository, token.documentId, dto.workspaceId).pipe(
                  Effect.flatMap((document) =>
                    // 6. Ensure download permission (read level)
                    ensurePermission(this.accessPolicyRepository, actor, document, "read").pipe(
                      Effect.flatMap(() =>
                        // 7. Validate token ownership, expiry, and usage status
                        token.validateForUse(actor.id).pipe(
                          Effect.provideService(Clock.Clock, Clock.make()),
                          Effect.mapError(mapDownloadTokenDomainError("validateForUse", dto.token))
                        )
                      )
                    )
                  )
                )
              ),
              Effect.flatMap((validatedToken) =>
                // 8. Return serialized token for valid tokens
                this.serializeToken(validatedToken).pipe(
                  Effect.map((serialized) => ({
                    valid: true,
                    token: serialized
                  }))
                )
              )
            )
          )
        )
      ),
      Effect.catchAll((error) => {
        // If error is DownloadTokenValidationError, return valid: false with reason
        if (error instanceof DownloadTokenValidationError) {
          const reason = error.details?.reason as "NOT_FOUND" | "EXPIRED" | "ALREADY_USED" | "INVALID" | undefined
          return Effect.succeed({
            valid: false,
            token: undefined,
            reason
          })
        }
        // For other errors, re-throw
        return Effect.fail(error)
      }),
      Effect.provideService(Clock.Clock, Clock.make())
    )
  }

  listDownloadTokens(
    input: ListDownloadTokensQueryEncoded
  ): Effect.Effect<PaginatedDownloadTokensResponseEncoded, WorkflowError | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode query DTO using schema validation
      S.decodeUnknown(ListDownloadTokensQuerySchema)(input),
      Effect.flatMap((dto) =>
        // 2. Load actor and document in parallel (with workspace validation)
        Effect.all([
          loadActor(this.userRepository, dto.actorId),
          loadDocument(this.documentRepository, dto.documentId, dto.workspaceId)
        ]).pipe(
          Effect.flatMap(([actor, document]) =>
            // 3. Ensure download permission (read level)
            ensurePermission(this.accessPolicyRepository, actor, document, "read").pipe(
              Effect.flatMap(() =>
                // 4. Fetch all tokens for the document
                this.downloadTokenRepository.findByDocumentId(dto.documentId).pipe(
                  Effect.mapError(mapDownloadTokenPersistenceError("findByDocumentId"))
                )
              )
            )
          ),
          Effect.flatMap((tokens) => {
            // 5. Apply pagination using applyPagination helper
            const pageNum = dto.pageNum || 1
            const pageSize = dto.pageSize || 10
            
            return applyPagination(
              tokens,
              tokens.length,
              pageNum,
              pageSize,
              this.serializeToken
            ).pipe(
              Effect.map((serializedTokens): PaginatedDownloadTokensResponseEncoded => ({
                data: serializedTokens.data,
                total: serializedTokens.total,
                pageNum: serializedTokens.pageNum,
                pageSize: serializedTokens.pageSize,
                totalPages: serializedTokens.totalPages
              }))
            )
          })
        )
      ),
      Effect.mapError((error) => {
        if (error instanceof ParseResult.ParseError) {
          return error
        }
        return error as unknown as WorkflowError
      })
    )
  }

  useDownloadToken(
    input: UseDownloadTokenCommandEncoded
  ): Effect.Effect<DownloadTokenResponseEncoded, WorkflowError | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode command DTO using schema validation
      S.decodeUnknown(UseDownloadTokenCommandSchema)(input),
      Effect.flatMap((dto) =>
        // 2. Load actor
        loadActor(this.userRepository, dto.actorId).pipe(
          Effect.flatMap((actor) =>
            // 3. Fetch token by token string
            this.downloadTokenRepository.findByToken(dto.token).pipe(
              Effect.mapError(mapDownloadTokenPersistenceError("findByToken")),
              Effect.flatMap((tokenOption) =>
                Option.match(tokenOption, {
                  onNone: () => Effect.fail(new DownloadTokenValidationError(
                    `Token not found: ${dto.token}`,
                    "token",
                    dto.token,
                    { reason: "NOT_FOUND" }
                  ) as WorkflowError),
                  onSome: (token) => Effect.succeed(token)
                })
              ),
              Effect.flatMap((token) =>
                // 4. Load document and ensure permission (with workspace validation)
                loadDocument(this.documentRepository, token.documentId, dto.workspaceId).pipe(
                  Effect.flatMap((document) =>
                    ensurePermission(this.accessPolicyRepository, actor, document, "read").pipe(
                      Effect.flatMap(() =>
                        // 5. Validate token for use (ownership, expiry, usage checks)
                        token.validateForUse(actor.id).pipe(
                          Effect.provideService(Clock.Clock, Clock.make()),
                          Effect.mapError(mapDownloadTokenDomainError("validateForUse", dto.token))
                        )
                      )
                    )
                  )
                )
              ),
              Effect.flatMap(() =>
                // 6. Mark token as used and persist via repository (which calls markAsUsed internally)
                this.downloadTokenRepository.markAsUsed(dto.token).pipe(
                  Effect.mapError((error) => {
                    // Try domain error mapping first (handles already used, expired, etc.)
                    if (error instanceof DownloadTokenAlreadyUsedError || 
                        error instanceof BusinessRuleViolationError) {
                      return mapDownloadTokenDomainError("markAsUsed", dto.token)(error)
                    }
                    // Otherwise use persistence error mapping
                    return mapDownloadTokenPersistenceError("markAsUsed")(error)
                  })
                )
              ),
              Effect.flatMap((usedToken) =>
                // 7. Serialize and return
                this.serializeToken(usedToken)
              )
            )
          )
        )
      ),
      Effect.provideService(Clock.Clock, Clock.make())
    )
  }

  revokeDownloadToken(
    input: RevokeDownloadTokenCommandEncoded
  ): Effect.Effect<RevokeDownloadTokenResponseEncoded, WorkflowError | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode command DTO using schema validation
      S.decodeUnknown(RevokeDownloadTokenCommandSchema)(input),
      Effect.flatMap((dto) =>
        // 2. Load actor
        loadActor(this.userRepository, dto.actorId).pipe(
          Effect.flatMap((actor) =>
            // 3. Load token by ID
            this.downloadTokenRepository.findById(dto.tokenId).pipe(
              Effect.mapError(mapDownloadTokenPersistenceError("findById")),
              Effect.flatMap((tokenOption) =>
                Option.match(tokenOption, {
                  onNone: () => Effect.fail(new DownloadTokenValidationError(
                    `Token not found: ${dto.tokenId}`,
                    "tokenId",
                    dto.tokenId,
                    { reason: "NOT_FOUND" }
                  ) as WorkflowError),
                  onSome: (token) => Effect.succeed(token)
                })
              ),
              Effect.flatMap((token) =>
                // 4. Load document and ensure permission (with workspace validation)
                loadDocument(this.documentRepository, token.documentId, dto.workspaceId).pipe(
                  Effect.flatMap((document) =>
                    ensurePermission(this.accessPolicyRepository, actor, document, "read").pipe(
                      Effect.flatMap(() =>
                        // 5. Delete token via repository
                        this.downloadTokenRepository.delete(dto.tokenId).pipe(
                          Effect.mapError((error) => {
                            // Try domain error mapping first for NOT_FOUND
                            if (error instanceof DownloadTokenNotFoundError) {
                              return mapDownloadTokenDomainError("delete", dto.tokenId)(error)
                            }
                            // Otherwise use persistence error mapping
                            return mapDownloadTokenPersistenceError("delete")(error)
                          })
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      ),
      Effect.map((success) => ({
        success,
        tokenId: input.tokenId
      }))
    )
  }

  // ===== BATCH HELPERS =====

  getValidTokensForUser(
    documentId: DocumentId,
    userId: UserId
  ): Effect.Effect<readonly DownloadTokenEntity[], WorkflowDependencyError> {
    return pipe(
      this.downloadTokenRepository.findValidTokens(documentId, userId),
      Effect.mapError((error) => {
        if (error instanceof DatabaseError) {
          return new WorkflowDependencyError(
            `Database error fetching valid tokens for document: ${documentId} and user: ${userId}`,
            "DownloadTokenRepository",
            "findValidTokens",
            { originalError: error }
          )
        }
        return new WorkflowDependencyError(
          `Failed to fetch valid tokens for document: ${documentId} and user: ${userId}`,
          "DownloadTokenRepository",
          "findValidTokens",
          { originalError: error }
        )
      })
    )
  }
}

