import "reflect-metadata"

import { Effect, Option, pipe, Schema as S, ParseResult, Clock } from "effect"
import { injectable, inject } from "tsyringe"

// Domain repositories
import { DownloadTokenRepository } from "@domain/downloadToken/download-token.repository"
import { DocumentAggregateRepository } from "@domain/document/document-aggregate.repository"
import { AccessPolicyRepository } from "@domain/accessPolicy/access-policy.repository"
import { UserRepository } from "@domain/user/user.repository"

// Domain errors
import { DownloadTokenNotFoundError, DownloadTokenValidationError, DownloadTokenAlreadyUsedError } from "@domain/downloadToken/download-token.error"
import { BusinessRuleViolationError } from "@domain/utils/base.errors"

// Application errors
import { 
  WorkflowError,
  DownloadTokenGenerationError,
  PermissionCheckError,
  WorkflowDependencyError,
  FileNotFoundError
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
  UseDownloadTokenCommandSchema,
  DownloadFileWithTokenCommandEncoded,
  DownloadFileWithTokenCommandSchema
} from "@application/dto/downloadToken/commands.dto"

import {
  DownloadTokenResponseEncoded,
  PaginatedDownloadTokensResponseEncoded,
  ValidateDownloadTokenResponseEncoded,
  RevokeDownloadTokenResponseEncoded
} from "@application/dto/downloadToken/responses.dto"

// Application workflow helpers
import {
  createEntityId,
  loadActor,
  loadDocument,
  ensurePermission,
  mapToWorkflowDependencyError,
  mapDownloadTokenPersistenceError,
  mapDownloadTokenDomainError,
  applyPagination,
  recordAudit
} from "@application/workflow/helpers"

// Application ports
import { FileStoragePort, type DownloadFileResponse } from "@application/services/ports/file-storage.port"

// DI tokens
import { TOKENS } from "@infra/di/container"

// Audit
import { AuditPort } from "@application/services/ports/audit.port"

// Refined types
import { DownloadTokenId, DocumentId, WorkspaceId } from "@domain/refined/ids"
import { DownloadTokenEntity, SerializedDownloadToken } from "@domain/downloadToken/download-token.entity"

/**
 * Responsibilities:
 * - Coordinate download token creation, validation, and usage
 * - Validate permissions for token operations
 * - Ensure token ownership and validity
 * - Map token errors to application-level errors
 * - Download files using validated tokens
 */
@injectable()
export class DownloadTokenWorkflow {
  constructor(
    @inject(TOKENS.DOWNLOAD_TOKEN_REPOSITORY)
    private readonly downloadTokenRepository: DownloadTokenRepository,
    
    @inject(TOKENS.DOCUMENT_AGGREGATE_REPOSITORY)
    private readonly documentAggregateRepository: DocumentAggregateRepository,
    
    @inject(TOKENS.USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    
    @inject(TOKENS.ACCESS_POLICY_REPOSITORY)
    private readonly accessPolicyRepository: AccessPolicyRepository,
    
    @inject(TOKENS.FILE_STORAGE_PORT)
    private readonly fileStoragePort: FileStoragePort,
    
    @inject(TOKENS.AUDIT_PORT)
    private readonly audit: AuditPort
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

  private loadDocumentWithVersion(
    documentId: string,
    workspaceId: string,
    _actorId: string
  ): Effect.Effect<
    { document: ReturnType<typeof loadDocument> extends Effect.Effect<infer R, any, any> ? R : never; version: any },
    WorkflowError,
    Clock.Clock
  > {
    // documentId and workspaceId are already typed as branded strings from token entity
    return pipe(
      loadDocument(this.documentAggregateRepository, documentId as DocumentId, workspaceId as WorkspaceId),
      Effect.flatMap((document) =>
        // Load aggregate to get version with fileKey
        this.documentAggregateRepository.loadById(documentId as any).pipe(
          Effect.mapError((error) => new WorkflowDependencyError(
            `Failed to load document aggregate: ${error instanceof Error ? error.message : String(error)}`,
            "DocumentAggregateRepository",
            "loadById",
            { originalError: error }
          ) as WorkflowError),
          Effect.flatMap((aggOption) =>
            Option.match(aggOption, {
              onNone: () => Effect.fail(new WorkflowDependencyError(
                `Document aggregate not found: ${documentId}`,
                "DocumentAggregateRepository",
                "loadById",
                { documentId: documentId as any }
              ) as WorkflowError),
              onSome: (aggregate) => {
                // Get latest version
                const versionOption = aggregate.getLatestVersion()
                return Option.match(versionOption, {
                  onNone: () => Effect.fail(new WorkflowDependencyError(
                    `No versions found for document: ${documentId}`,
                    "DocumentAggregate",
                    "getLatestVersion",
                    { documentId: documentId as any }
                  ) as WorkflowError),
                  onSome: (version) => Effect.succeed({ document, version })
                })
              }
            })
          )
        )
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
          loadDocument(this.documentAggregateRepository, dto.documentId, dto.workspaceId)
        ]).pipe(
          Effect.flatMap(([actor, document]) =>
            // 3. Ensure download permission (read level)
            ensurePermission(this.accessPolicyRepository, actor, document, "read").pipe(
              Effect.flatMap(() =>
                // 4. Generate token ID and token string
                Effect.all([
                  createEntityId(DownloadTokenId, "DownloadTokenId"),
                  Effect.sync(() => {
                    // Generate a secure random token string (URL-safe base64)
                    const bytes = new Uint8Array(32)
                    crypto.getRandomValues(bytes)
                    return Buffer.from(bytes).toString('base64url')
                  })
                ])
              ),
              Effect.flatMap(([validatedId, tokenString]) => {
                // 5. Build token data and return { dto, token }
                const tokenData: Partial<SerializedDownloadToken> = {
                  id: validatedId,
                  token: tokenString,
                  documentId: dto.documentId,
                  issuedTo: dto.issuedTo,
                  expiresAt: dto.expiresAt.toISOString() // Convert Date to ISO string for encoded format
                }
                
                return DownloadTokenEntity.create(tokenData as SerializedDownloadToken).pipe(
                  Effect.map((token) => ({ dto, token }))
                )
              })
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
      Effect.flatMap(({ dto, token }) =>
        this.downloadTokenRepository.save(token).pipe(
          Effect.mapError((error) => new DownloadTokenGenerationError(
            `Failed to save download token: ${error instanceof Error ? error.message : String(error)}`,
            dto.documentId,
            dto.issuedTo,
            { originalError: error }
          )),
          Effect.map((savedToken) => ({ dto, savedToken }))
        )
      ),
      Effect.flatMap(({ dto, savedToken }) =>
        // Record success audit event after token creation
        recordAudit(this.audit, {
          actorId: dto.actorId,
          workspaceId: dto.workspaceId,
          resourceType: "download_token",
          resourceId: savedToken.id,
          action: "create",
          outcome: "success" as const,
          metadata: {
            documentId: dto.documentId,
            issuedTo: dto.issuedTo,
            expiresAt: dto.expiresAt.toISOString() // Convert Date to ISO string for audit metadata
          }
        }).pipe(
          Effect.map(() => savedToken)
        )
      ),
      Effect.flatMap((savedToken) =>
        // Return serialized token
        this.serializeToken(savedToken)
      ),
      Effect.catchAll((error) => {
        // Record failure audit event for token creation failures
        const errorMessage = error instanceof Error ? error.message : String(error)
        
        // Record audit for authenticated actors only
        return recordAudit(this.audit, {
          actorId: input.actorId,
          workspaceId: input.workspaceId,
          resourceType: "download_token",
          resourceId: input.documentId, // Use documentId as resourceId when token creation fails
          action: "create",
          outcome: "failure" as const,
          reason: errorMessage,
          metadata: {
            documentId: input.documentId,
            issuedTo: input.issuedTo,
            errorMessage
          }
        }).pipe(
          Effect.flatMap(() => Effect.fail(error))
        )
      })
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
                loadDocument(this.documentAggregateRepository, token.documentId, dto.workspaceId).pipe(
                  Effect.flatMap((document) =>
                    // 6. Ensure download permission (read level)
                    ensurePermission(this.accessPolicyRepository, actor, document, "read").pipe(
                      Effect.flatMap(() =>
                        // 7. Validate token ownership, expiry, and usage status
                        token.validateForUse(actor.id).pipe(
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
      })
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
          loadDocument(this.documentAggregateRepository, dto.documentId, dto.workspaceId)
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
                loadDocument(this.documentAggregateRepository, token.documentId, dto.workspaceId).pipe(
                  Effect.flatMap((document) =>
                    ensurePermission(this.accessPolicyRepository, actor, document, "read").pipe(
                      Effect.flatMap(() =>
                        // 5. Validate token for use (ownership, expiry, usage checks)
                        token.validateForUse(actor.id).pipe(
                          Effect.mapError(mapDownloadTokenDomainError("validateForUse", dto.token))
                        )
                      ),
                      Effect.map(() => ({ token, document, dto }))
                    )
                  )
                )
              ),
              Effect.flatMap(({ document, dto }) =>
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
                  }),
                  Effect.map((usedToken) => ({ usedToken, document, dto }))
                )
              ),
              Effect.flatMap(({ usedToken, document, dto }) =>
                // 7. Record audit event
                recordAudit(this.audit, {
                  actorId: dto.actorId,
                  workspaceId: dto.workspaceId,
                  resourceType: "download_token",
                  resourceId: usedToken.id,
                  action: "use",
                  outcome: "success" as const,
                  metadata: {
                    documentId: document.id,
                    documentTitle: document.title
                  }
                }).pipe(
                  Effect.map(() => usedToken)
                )
              ),
              Effect.flatMap((usedToken) =>
                // 8. Serialize and return
                this.serializeToken(usedToken)
              )
            )
          )
        )
      )
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
                loadDocument(this.documentAggregateRepository, token.documentId, dto.workspaceId).pipe(
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
                          }),
                          Effect.map((deleted) => ({ deleted, token, document, dto }))
                        )
                      )
                    )
                  )
                )
              ),
              Effect.flatMap(({ deleted, token, document, dto }) =>
                // 6. Record audit event
                recordAudit(this.audit, {
                  actorId: dto.actorId,
                  workspaceId: dto.workspaceId,
                  resourceType: "download_token",
                  resourceId: token.id,
                  action: "revoke",
                  outcome: "success" as const,
                  metadata: {
                    documentId: document.id,
                    documentTitle: document.title
                  }
                }).pipe(
                  Effect.map(() => deleted)
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

  /**
   * Downloads a file using a validated download token.
   * 
   * This method:
   * 1. Validates and marks token as used
   * 2. Retrieves document version and file metadata
   * 3. Downloads file from storage
   * 4. Records audit event
   * 5. Returns file stream and metadata
   */
  downloadFileWithToken(
    input: DownloadFileWithTokenCommandEncoded
  ): Effect.Effect<
    { stream: DownloadFileResponse; documentId: string; version: number },
    WorkflowError | ParseResult.ParseError,
    Clock.Clock
  > {
    return pipe(
      // 1. Decode command DTO using schema validation
      S.decodeUnknown(DownloadFileWithTokenCommandSchema)(input),
      Effect.flatMap((dto) =>
        // 2. Load actor
        loadActor(this.userRepository, dto.actorId).pipe(
          Effect.flatMap((actor) =>
            // 3. Fetch and validate token
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
                // 4. Load document aggregate and ensure permission
                this.loadDocumentWithVersion(token.documentId, dto.workspaceId, actor.id).pipe(
                  Effect.flatMap(({ document, version }) =>
                    // 5. Validate token for use (ownership, expiry, usage checks)
                    token.validateForUse(actor.id).pipe(
                      Effect.mapError(mapDownloadTokenDomainError("validateForUse", dto.token)),
                      Effect.flatMap(() =>
                        // 6. Mark token as used
                        this.downloadTokenRepository.markAsUsed(dto.token).pipe(
                          Effect.mapError((error) => {
                            if (error instanceof DownloadTokenAlreadyUsedError || 
                                error instanceof BusinessRuleViolationError) {
                              return mapDownloadTokenDomainError("markAsUsed", dto.token)(error)
                            }
                            return mapDownloadTokenPersistenceError("markAsUsed")(error)
                          }),
                          Effect.map((usedToken) => ({ usedToken, document, version, dto }))
                        )
                      )
                    )
                  )
                )
              ),
              Effect.flatMap(({ usedToken, document, version, dto }) =>
                // 7. Download file from storage using fileKey from version
                this.fileStoragePort.downloadFile(version.fileKey).pipe(
                  Effect.mapError((error) => {
                    if (error.code === "NOT_FOUND") {
                      return new FileNotFoundError(
                        `File not found in storage: ${version.fileKey}`,
                        version.fileKey,
                        { originalError: error }
                      ) as WorkflowError
                    }
                    return new WorkflowDependencyError(
                      `Failed to download file: ${error.message}`,
                      "FileStoragePort",
                      "downloadFile",
                      { originalError: error, storageError: error.code }
                    ) as WorkflowError
                  }),
                  Effect.map((downloadResponse) => ({ 
                    downloadResponse, 
                    usedToken, 
                    document, 
                    version, 
                    dto 
                  }))
                )
              ),
              Effect.flatMap(({ downloadResponse, usedToken, document, version, dto }) =>
                // 8. Record audit event for file download
                recordAudit(this.audit, {
                  actorId: dto.actorId,
                  workspaceId: dto.workspaceId,
                  resourceType: "download_token",
                  resourceId: usedToken.id,
                  action: "download",
                  outcome: "success" as const,
                  metadata: {
                    documentId: document.id,
                    documentTitle: document.title,
                    version: version.version,
                    fileKey: version.fileKey,
                    mimeType: downloadResponse.metadata.mimeType,
                    fileSize: downloadResponse.metadata.size
                  }
                }).pipe(
                  Effect.map(() => ({
                    stream: downloadResponse,
                    documentId: document.id,
                    version: version.version
                  }))
                )
              )
            )
          )
        )
      )
    )
  }
}

