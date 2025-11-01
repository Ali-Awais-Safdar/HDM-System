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
 * - Coordinate direct file upload with streaming
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
    private readonly audit: AuditPort
  ) {}

  // ===== PRIVATE HELPER METHODS =====

  private uploadFileDirectly(
    dto: S.Schema.Type<typeof InitiateUploadCommandSchema>,
    stream: ReadableStream<Uint8Array>,
    document: DocumentEntity,
    _actor: UserEntity
  ): Effect.Effect<InitiateUploadResponse, UploadInitiationError, Clock.Clock> {
    return pipe(
      // Upload file to storage
      this.fileStoragePort.uploadFile({
        stream,
        metadata: {
          documentId: dto.documentId,
          userId: dto.actorId,
          contentRef: dto.contentRef,
          mimeType: dto.mimeType,
          expectedSize: dto.size
        }
      }),
      Effect.map((uploadResponse): InitiateUploadResponse => ({
        fileKey: uploadResponse.fileKey,
        checksum: uploadResponse.checksum,
        contentRef: dto.contentRef
      })),
      Effect.tap(() =>
        // Record audit event for direct upload
        recordAudit(this.audit, {
          actorId: dto.actorId,
          workspaceId: dto.workspaceId,
          resourceType: "document",
          resourceId: dto.documentId,
          action: "upload_direct",
          outcome: "success" as const,
          metadata: {
            documentId: dto.documentId,
            documentTitle: document.title,
            mimeType: dto.mimeType,
            size: dto.size,
            contentRef: dto.contentRef
          }
        })
      ),
      Effect.mapError((error) => new UploadInitiationError(
        `Failed to upload file directly: ${error instanceof Error ? error.message : String(error)}`,
        dto.documentId,
        document.title,
        { originalError: error, storageError: error instanceof FileStorageError ? error.code : undefined }
      ))
    )
  }

  private verifyFileMetadata(
    dto: S.Schema.Type<typeof ConfirmUploadCommandSchema>
  ): Effect.Effect<
    { checksum: Sha256; fileKey: FileKey; actualSize: number; actualMimeType: string; contentRefValid: boolean },
    ChecksumValidationError | FileNotFoundError | UploadConfirmationError,
    never
  > {
    return pipe(
      // Verify file exists and get metadata
      this.fileStoragePort.downloadFile(dto.fileKey),
      Effect.mapError((error): ChecksumValidationError | FileNotFoundError | UploadConfirmationError => {
        if (error.code === "NOT_FOUND") {
          return new FileNotFoundError(
            `File not found in storage: ${dto.fileKey}`,
            dto.fileKey,
            { originalError: error }
          )
        }
        // Map storage errors to appropriate confirmation error
        return new UploadConfirmationError(
          `Failed to verify file: ${error.message}`,
          dto.documentId,
          "",
          "CHECKSUM_MISMATCH", // Use as generic failure reason
          { originalError: error, storageErrorCode: error.code }
        )
      }),
      Effect.flatMap((fileResponse): Effect.Effect<
        { checksum: Sha256; fileKey: FileKey; actualSize: number; actualMimeType: string; contentRefValid: boolean },
        ChecksumValidationError | FileNotFoundError | UploadConfirmationError,
        never
      > => {
        // Use stored checksum from metadata sidecar as authoritative source
        const storedChecksum = fileResponse.metadata.checksum
        
        // Verify size matches
        if (fileResponse.metadata.size !== dto.size) {
          return Effect.fail(new UploadConfirmationError(
            `File size mismatch: expected ${dto.size}, got ${fileResponse.metadata.size}`,
            dto.documentId,
            "",
            "SIZE_MISMATCH",
            { expectedSize: dto.size, actualSize: fileResponse.metadata.size }
          ))
        }

        // Verify MIME type matches
        if (fileResponse.metadata.mimeType !== dto.mimeType) {
          return Effect.fail(new UploadConfirmationError(
            `MIME type mismatch: expected ${dto.mimeType}, got ${fileResponse.metadata.mimeType}`,
            dto.documentId,
            "",
            "MIME_TYPE_MISMATCH",
            { expectedMimeType: dto.mimeType, actualMimeType: fileResponse.metadata.mimeType }
          ))
        }

        // Validate client-supplied checksum if provided (for informational purposes only)
        // The stored checksum is always the authoritative value used for FileMetadata
        if (dto.checksum !== undefined && dto.checksum !== storedChecksum) {
          return Effect.fail(new ChecksumValidationError(
            `Client-supplied checksum mismatch: provided ${dto.checksum}, stored checksum is ${storedChecksum}`,
            dto.fileKey,
            dto.checksum,
            storedChecksum,
            { clientChecksum: dto.checksum, storedChecksum }
          ))
        }

        return Effect.succeed({
          checksum: storedChecksum, // Use stored checksum as canonical value
          fileKey: dto.fileKey,
          actualSize: fileResponse.metadata.size as unknown as number,
          actualMimeType: fileResponse.metadata.mimeType as unknown as string,
          contentRefValid: true // Always true for direct upload
        })
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

  initiateUpload(
    input: InitiateUploadCommandEncoded & { stream: ReadableStream<Uint8Array> }
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
                // 4. Upload file directly with stream
                this.uploadFileDirectly(dto, input.stream, document, actor)
              )
            )
            )
          ),
          Effect.mapError(mapUploadInitiationError({ documentId: dto.documentId }))
        )
      )
    ) as Effect.Effect<InitiateUploadResponse, WorkflowError | ParseResult.ParseError, Clock.Clock>
  }

  /**
   * This method verifies the file exists and creates the document version.
   */
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
                  // 4. Verify file exists and get metadata
                  this.verifyFileMetadata(dto).pipe(
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
                                      actualMimeType: verifiedMetadata.actualMimeType,
                                      size: verifiedMetadata.actualSize,
                                      expectedSize: dto.size,
                                      checksum: verifiedMetadata.checksum,
                                      fileKey: verifiedMetadata.fileKey
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
}

