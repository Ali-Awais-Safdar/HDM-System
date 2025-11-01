import "reflect-metadata"

import { Effect, Option, pipe, Schema as S, ParseResult, Clock } from "effect"
import { injectable, inject } from "tsyringe"

// Domain entities
import { DocumentEntity } from "@domain/document/document.entity"
import { DocumentVersionEntity } from "@domain/documentVersion/document-version.entity"
import { UserEntity } from "@domain/user/user.entity"
import { FileMetadata } from "@domain/documentVersion/file-metadata.vo"

// Domain repositories
import { DocumentAggregateRepository } from "@domain/document/document-aggregate.repository"
import { AccessPolicyRepository } from "@domain/accessPolicy/access-policy.repository"
import { UserRepository } from "@domain/user/user.repository"

// Domain errors
import { DatabaseError } from "@domain/utils/base.errors"

// Application services
import { FileStoragePort, FileStorageError } from "@application/services/ports/file-storage.port"

// Application errors
import {
  UploadInitiationError,
  UploadConfirmationError,
  ChecksumValidationError,
  FileNotFoundError,
  WorkflowDependencyError,
  WorkflowError
} from "@application/errors/application.errors"

// Application DTOs
import {
  InitiateUploadCommandSchema,
  InitiateUploadCommandEncoded,
  ConfirmUploadCommandSchema,
  ConfirmUploadCommandEncoded
} from "@application/dto/document/commands.dto"
import {
  InitiateUploadResponse,
  ConfirmUploadResponse
} from "@application/dto/document/responses.dto"

// Application workflow helpers
import {
  loadActor,
  loadDocument,
  ensurePermission,
  mapUploadInitiationError,
  mapUploadConfirmationError,
  recordAudit,
  createEntityId
} from "@application/workflow/helpers"
import { LoggerPort } from "@application/services/ports/logger.port"

// Refined types
import { DocumentId, DocumentVersionId } from "@domain/refined/ids"
import { Sha256 } from "@domain/refined/checksum"
import { FileKey } from "@domain/refined/file-reference"

// DI tokens
import { TOKENS } from "@infra/di/container"

// Audit
import { AuditPort } from "@application/services/ports/audit.port"

/**
 * Responsibilities:
 * - Coordinate upload initiation with pre-signed URL generation
 * - Validate permissions for upload operations
 * - Confirm uploads and create document versions
 * - Enforce idempotency through checksum/contentRef validation
 * - Map storage errors to application-level errors
 */
@injectable()
export class UploadWorkflow {
  constructor(
    @inject(TOKENS.DOCUMENT_AGGREGATE_REPOSITORY)
    private readonly documentAggregateRepository: DocumentAggregateRepository,

    @inject(TOKENS.ACCESS_POLICY_REPOSITORY)
    private readonly accessPolicyRepository: AccessPolicyRepository,

    @inject(TOKENS.USER_REPOSITORY)
    private readonly userRepository: UserRepository,

    @inject(TOKENS.FILE_STORAGE_PORT)
    private readonly fileStoragePort: FileStoragePort,

    @inject(TOKENS.AUDIT_PORT)
    private readonly audit: AuditPort,

    @inject(TOKENS.LOGGER_PORT)
    private readonly logger: LoggerPort
  ) {}

  initiateUpload(
    input: InitiateUploadCommandEncoded
  ): Effect.Effect<InitiateUploadResponse, WorkflowError | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode DTO using schema validation
      S.decodeUnknown(InitiateUploadCommandSchema)(input),
      Effect.flatMap((dto) =>
        pipe(
          // 2. Load actor and document in parallel (with workspace validation)
          Effect.all([
            loadActor(this.userRepository, dto.actorId),
            loadDocument(this.documentAggregateRepository, dto.documentId, dto.workspaceId)
          ]).pipe(
            Effect.flatMap(([actor, document]) =>
              // 3. Check write permission
            ensurePermission(this.accessPolicyRepository, actor, document, "write").pipe(
              Effect.flatMap(() =>
                // 4. Generate pre-signed upload URL (version resolved at confirm)
                this.createUploadUrl(dto, document, actor)
              )
            )
            )
          ),
          Effect.mapError(mapUploadInitiationError({ documentId: dto.documentId }))
        )
      )
    ) as Effect.Effect<InitiateUploadResponse, WorkflowError | ParseResult.ParseError, Clock.Clock>
  }

  confirmUpload(
    input: ConfirmUploadCommandEncoded
  ): Effect.Effect<ConfirmUploadResponse, WorkflowError | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode DTO using schema validation
      S.decodeUnknown(ConfirmUploadCommandSchema)(input),
      Effect.flatMap((dto) =>
        pipe(
          // 2. Load actor and document (with workspace validation)
          Effect.all([
            loadActor(this.userRepository, dto.actorId),
            loadDocument(this.documentAggregateRepository, dto.documentId, dto.workspaceId)
          ]).pipe(
            Effect.flatMap(([actor, document]) =>
              // 3. Recheck write permission
              ensurePermission(this.accessPolicyRepository, actor, document, "write").pipe(
                Effect.flatMap(() =>
                  // 4. Complete upload and verify file metadata
                  this.completeUploadVerification(dto).pipe(
                    // Log and fail on verification issues
                    Effect.flatMap((verifiedMetadata) => {
                      // Log verification details for traceability
                      return Effect.sync(() => {
                        this.logger.info("Upload verification completed", {
                          documentId: dto.documentId,
                          fileKey: dto.fileKey,
                          contentRefValid: verifiedMetadata.contentRefValid,
                          checksum: verifiedMetadata.checksum,
                          actualSize: verifiedMetadata.actualSize,
                          actualMimeType: verifiedMetadata.actualMimeType,
                          expectedSize: dto.size,
                          expectedMimeType: dto.mimeType
                        })
                      }).pipe(
                        Effect.flatMap(() => {
                          // Check for critical mismatches
                          if (!verifiedMetadata.contentRefValid) {
                            // Fail upload if contentRef doesn't match (security issue)
                            const error = new UploadConfirmationError(
                              `Content reference mismatch: file uploaded with mismatched contentRef`,
                              dto.documentId,
                              "",
                              "CONTENT_REF_MISMATCH",
                              {
                                expectedContentRef: dto.contentRef,
                                fileKey: dto.fileKey
                              }
                            )
                            this.logger.error("Upload verification failed: content reference mismatch", {
                              documentId: dto.documentId,
                              fileKey: dto.fileKey,
                              error: error.message
                            })
                            return Effect.fail(error)
                          }
                          return Effect.succeed(verifiedMetadata)
                        })
                      )
                    }),
                    Effect.flatMap((verifiedMetadata) =>
                      // 5. Check for existing version with same checksum (idempotency)
                      // Combines checksum + contentRef validation: identical content with different metadata won't duplicate
                      this.checkExistingVersionByChecksum(dto.documentId, verifiedMetadata.checksum).pipe(
                        Effect.flatMap((existingVersion) =>
                          Option.match(existingVersion, {
                            // If version exists, return it (idempotency)
                            onSome: (version) => this.buildConfirmUploadResponse(version),
                            // Otherwise, create new version via aggregate
                            onNone: () =>
                              // 6. Load aggregate and record upload
                              this.documentAggregateRepository.loadById(dto.documentId).pipe(
                                Effect.flatMap((aggOpt) =>
                                  Option.match(aggOpt, {
                                    onNone: () => Effect.fail(new WorkflowDependencyError(
                                      `Document aggregate not found: ${dto.documentId}`,
                                      "DocumentAggregateRepository",
                                      "loadById",
                                      { documentId: dto.documentId }
                                    )),
                                    onSome: (aggregate) => {
                                      return pipe(
                                        S.decodeUnknown(FileMetadata)({
                                          checksum: verifiedMetadata.checksum,
                                          fileKey: verifiedMetadata.fileKey,
                                          mimeType: verifiedMetadata.actualMimeType,
                                          size: verifiedMetadata.actualSize
                                        }),
                                        Effect.mapError((error) => new WorkflowDependencyError(
                                          `Failed to decode file metadata: ${error.message}`,
                                          "FileMetadata",
                                          "decode",
                                          { originalError: error }
                                        )),
                                        Effect.flatMap((fileMetadata) =>
                                          createEntityId(DocumentVersionId, "DocumentVersionId").pipe(
                                            Effect.flatMap((versionId) =>
                                              aggregate.recordUpload(
                                                fileMetadata,
                                                Option.some(actor.id),
                                                dto.versionHint,
                                                versionId
                                              )
                                            )
                                          )
                                        ),
                                        Effect.flatMap((updatedAggregate) =>
                                          // 7. Persist aggregate (document + new version)
                                          this.documentAggregateRepository.save(updatedAggregate)
                                        ),
                                        Effect.mapError((error) => new WorkflowDependencyError(
                                          `Failed to record upload: ${error instanceof Error ? error.message : String(error)}`,
                                          "DocumentAggregate",
                                          "recordUpload",
                                          { originalError: error, documentId: dto.documentId }
                                        ))
                                      )
                                    }
                                  })
                                ),
                                Effect.flatMap((savedAggregate) => {
                                  // 8. Get latest version (newly created)
                                  const latestVersionOption = savedAggregate.getLatestVersion()
                                  if (Option.isNone(latestVersionOption)) {
                                    return Effect.fail(new WorkflowDependencyError(
                                      "Failed to retrieve newly created version",
                                      "DocumentAggregate",
                                      "getLatestVersion",
                                      {}
                                    ))
                                  }
                                  const newVersion = latestVersionOption.value
                                  // 9. Record audit event
                                  return recordAudit(this.audit, {
                                    actorId: dto.actorId,
                                    workspaceId: dto.workspaceId,
                                    resourceType: "document_version",
                                    resourceId: newVersion.id,
                                    action: "upload_confirm",
                                    outcome: "success" as const,
                                    metadata: {
                                      documentId: document.id,
                                      version: newVersion.version,
                                      mimeType: dto.mimeType,
                                      expectedMimeType: dto.mimeType,
                                      actualMimeType: verifiedMetadata.actualMimeType,
                                      size: verifiedMetadata.actualSize,
                                      expectedSize: dto.size,
                                      contentRefValid: verifiedMetadata.contentRefValid,
                                      checksum: verifiedMetadata.checksum
                                    }
                                  }).pipe(
                                    Effect.flatMap(() =>
                                      // 9. Return version response
                                      this.buildConfirmUploadResponse(newVersion)
                                    )
                                  )
                                })
                              )
                          })
                        )
                      )
                    )
                  )
                )
              )
            )
          ),
          Effect.mapError(mapUploadConfirmationError({ documentId: dto.documentId }))
        )
      )
    ) as Effect.Effect<ConfirmUploadResponse, WorkflowError | ParseResult.ParseError, Clock.Clock>
  }

  // ===== PRIVATE HELPER METHODS =====

  private createUploadUrl(
    dto: S.Schema.Type<typeof InitiateUploadCommandSchema>,
    document: DocumentEntity,
    _actor: UserEntity,
    nextVersion?: number
  ): Effect.Effect<InitiateUploadResponse, UploadInitiationError, Clock.Clock> {
    // Default expiry: 15 minutes
    const expiryMs = 15 * 60 * 1000

    return pipe(
      this.fileStoragePort.createUploadUrl({
        documentId: dto.documentId,
        userId: dto.actorId,
        contentRef: dto.contentRef,
        mimeType: dto.mimeType,
        fileSize: dto.size,
        fileName: `${document.title}`,
        expiryMs
      }),
      Effect.map((storageResponse): InitiateUploadResponse => ({
        uploadUrl: storageResponse.uploadUrl,
        fileKey: storageResponse.fileKey,
        contentRef: dto.contentRef, // Keep contentRef matching DTO-supplied value
        expiresAt: storageResponse.expiresAt.toISOString(), // Convert Date to ISO string
        uploadToken: storageResponse.contentRef // Expose storage-generated token separately
      })),
      Effect.mapError((error) => new UploadInitiationError(
        `Failed to create upload URL: ${error.message}`,
        dto.documentId,
        `${document.title}-v${nextVersion}`,
        { originalError: error, storageError: error.code }
      ))
    )
  }

  private completeUploadVerification(
    dto: S.Schema.Type<typeof ConfirmUploadCommandSchema>
  ): Effect.Effect<
    { checksum: Sha256; fileKey: FileKey; actualSize: number; actualMimeType: string; contentRefValid: boolean },
    ChecksumValidationError | FileNotFoundError | UploadConfirmationError,
    never
  > {
    return pipe(
      this.fileStoragePort.completeUpload({
        fileKey: dto.fileKey,
        contentRef: dto.contentRef,
        expectedSize: dto.size,
        expectedMimeType: dto.mimeType
      }),
      Effect.flatMap((uploadResult): Effect.Effect<
        { checksum: Sha256; fileKey: FileKey; actualSize: number; actualMimeType: string; contentRefValid: boolean },
        ChecksumValidationError | UploadConfirmationError,
        never
      > => {
        // Verify checksum matches - fail fast if wrong
        if (uploadResult.checksum !== dto.checksum) {
          return Effect.fail(new ChecksumValidationError(
            `Checksum mismatch: expected ${dto.checksum}, got ${uploadResult.checksum}`,
            dto.checksum,
            uploadResult.checksum,
            dto.fileKey,
            { contentRef: dto.contentRef }
          ))
        }

        // Verify size is valid - fail fast if wrong
        if (!uploadResult.verificationMetadata.sizeValid) {
          return Effect.fail(new UploadConfirmationError(
            `File size mismatch: expected ${dto.size}, got ${uploadResult.actualSize}`,
            dto.documentId,
            "", // versionId not yet created
            "SIZE_MISMATCH",
            { expectedSize: dto.size, actualSize: uploadResult.actualSize }
          ))
        }

        // Verify MIME type is valid - fail fast if wrong
        if (!uploadResult.verificationMetadata.mimeTypeValid) {
          return Effect.fail(new UploadConfirmationError(
            `MIME type mismatch: expected ${dto.mimeType}, got ${uploadResult.actualMimeType}`,
            dto.documentId,
            "", // versionId not yet created
            "MIME_TYPE_MISMATCH",
            { expectedMimeType: dto.mimeType, actualMimeType: uploadResult.actualMimeType }
          ))
        }

        // Return verification result including contentRefValid status
        // Let caller decide how to handle contentRef mismatches
        return Effect.succeed({
          checksum: uploadResult.checksum,
          fileKey: uploadResult.fileKey,
          actualSize: uploadResult.actualSize as unknown as number,
          actualMimeType: uploadResult.actualMimeType as unknown as string,
          contentRefValid: uploadResult.verificationMetadata.contentRefValid
        })
      }),
      Effect.mapError((error: unknown): ChecksumValidationError | FileNotFoundError | UploadConfirmationError => {
        if (error instanceof ChecksumValidationError || error instanceof UploadConfirmationError) {
          return error
        }
        if (error instanceof FileStorageError) {
          if (error.code === "NOT_FOUND") {
            return new FileNotFoundError(
              `File not found in storage: ${dto.fileKey}`,
              dto.fileKey,
              { originalError: error }
            )
          }
          // Map other FileStorageError codes to CHECKSUM_MISMATCH as generic validation failure
          return new UploadConfirmationError(
            `Upload verification failed: ${error.message}`,
            dto.documentId,
            "",
            "CHECKSUM_MISMATCH",
            { originalError: error, storageErrorCode: error.code }
          )
        }
        const errorMessage = error instanceof Error ? error.message : String(error)
        return new UploadConfirmationError(
          `Upload verification failed: ${errorMessage}`,
          dto.documentId,
          "",
          "CHECKSUM_MISMATCH",
          { originalError: error }
        )
      })
    )
  }

  private checkExistingVersionByChecksum(
    documentId: DocumentId,
    checksum: Sha256
  ): Effect.Effect<Option.Option<DocumentVersionEntity>, WorkflowDependencyError, Clock.Clock> {
    return pipe(
      // Load aggregate to check for existing version by checksum
      this.documentAggregateRepository.loadById(documentId).pipe(
        Effect.mapError((error) => {
          if (error instanceof DatabaseError) {
            return new WorkflowDependencyError(
              `Database error loading aggregate: ${documentId}`,
              "DocumentAggregateRepository",
              "loadById",
              { originalError: error }
            )
          }
          return new WorkflowDependencyError(
            `Failed to load aggregate: ${documentId}`,
            "DocumentAggregateRepository",
            "loadById",
            { originalError: error }
          )
        }),
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.succeed(Option.none<DocumentVersionEntity>()),
            onSome: (aggregate) => {
              // Use aggregate helper to check for existing version by checksum
              const versionOption = aggregate.getVersionByChecksum(checksum)
              return Effect.succeed(versionOption)
            }
          })
        )
      )
    )
  }


  private buildConfirmUploadResponse(
    version: DocumentVersionEntity
  ): Effect.Effect<ConfirmUploadResponse, WorkflowDependencyError, Clock.Clock> {
    // Build response directly from entity properties, converting Date to ISO string
    return Effect.succeed({
      versionId: version.id,
      documentId: version.documentId,
      version: version.version,
      file: version.file,
      createdBy: version.createdBy,
      createdAt: version.createdAt.toISOString(), // Convert Date to ISO string
      updatedAt: Option.match(version.updatedAt, {
        onNone: () => undefined,
        onSome: (date) => date.toISOString()
      })
    } as ConfirmUploadResponse)
  }
}

