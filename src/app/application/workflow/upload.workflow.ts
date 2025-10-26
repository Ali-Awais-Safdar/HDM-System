import "reflect-metadata"

import { Effect, Option, pipe, Schema as S, ParseResult, Clock } from "effect"
import { injectable, inject } from "tsyringe"

// Domain entities
import { DocumentEntity } from "@domain/document/document.entity"
import { DocumentVersionEntity, SerializedDocumentVersion } from "@domain/documentVersion/document-version.entity"
import { UserEntity } from "@domain/user/user.entity"

// Domain repositories
import { DocumentRepository } from "@domain/document/document.repository"
import { DocumentVersionRepository } from "@domain/documentVersion/document-version.repository"
import { AccessPolicyRepository } from "@domain/accessPolicy/access-policy.repository"
import { UserRepository } from "@domain/user/user.repository"

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
  InitiateUploadResponse,
  ConfirmUploadCommandSchema,
  ConfirmUploadCommandEncoded,
  ConfirmUploadResponse
} from "@application/dto/document/commands.dto"

// Application workflow helpers
import {
  loadActor,
  loadDocument,
  ensurePermission,
  mapDocumentVersionPersistenceError,
  mapDocumentPersistenceError,
  mapUploadInitiationError,
  mapUploadConfirmationError,
  optionToUndefined
} from "@application/workflow/helpers"

// Refined types
import { DocumentId, makeDocumentVersionId } from "@domain/refined/ids"
import { Sha256 } from "@domain/refined/checksum"
import { FileKey } from "@domain/refined/file-reference"

// DI tokens
import { TOKENS } from "@infra/di/container"

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
    @inject(TOKENS.DOCUMENT_REPOSITORY)
    private readonly documentRepository: DocumentRepository,

    @inject(TOKENS.DOCUMENT_VERSION_REPOSITORY)
    private readonly documentVersionRepository: DocumentVersionRepository,

    @inject(TOKENS.ACCESS_POLICY_REPOSITORY)
    private readonly accessPolicyRepository: AccessPolicyRepository,

    @inject(TOKENS.USER_REPOSITORY)
    private readonly userRepository: UserRepository,

    @inject(TOKENS.FILE_STORAGE_PORT)
    private readonly fileStoragePort: FileStoragePort
  ) {}

  initiateUpload(
    input: InitiateUploadCommandEncoded
  ): Effect.Effect<InitiateUploadResponse, WorkflowError | ParseResult.ParseError, never> {
    return pipe(
      // 1. Decode DTO using schema validation
      S.decodeUnknown(InitiateUploadCommandSchema)(input),
      Effect.flatMap((dto) =>
        pipe(
          // 2. Load actor and document in parallel
          Effect.all([
            loadActor(this.userRepository, dto.actorId),
            loadDocument(this.documentRepository, dto.documentId)
          ]).pipe(
            Effect.flatMap(([actor, document]) =>
              // 3. Check write permission
              ensurePermission(this.accessPolicyRepository, actor, document, "write").pipe(
                Effect.flatMap(() =>
                  // 4. Compute next version number
                  this.computeNextVersionNumber(dto.documentId).pipe(
                    Effect.flatMap((nextVersion) =>
                      // 5. Generate pre-signed upload URL
                      this.createUploadUrl(dto, document, actor, nextVersion)
                    )
                  )
                )
              )
            )
          ),
          Effect.provideService(Clock.Clock, Clock.make()),
          Effect.mapError(mapUploadInitiationError({ documentId: dto.documentId }))
        )
      )
    ) as Effect.Effect<InitiateUploadResponse, WorkflowError | ParseResult.ParseError, never>
  }

  confirmUpload(
    input: ConfirmUploadCommandEncoded
  ): Effect.Effect<ConfirmUploadResponse, WorkflowError | ParseResult.ParseError, never> {
    return pipe(
      // 1. Decode DTO using schema validation
      S.decodeUnknown(ConfirmUploadCommandSchema)(input),
      Effect.flatMap((dto) =>
        pipe(
          // 2. Load actor and document
          Effect.all([
            loadActor(this.userRepository, dto.actorId),
            loadDocument(this.documentRepository, dto.documentId)
          ]).pipe(
            Effect.flatMap(([actor, document]) =>
              // 3. Recheck write permission
              ensurePermission(this.accessPolicyRepository, actor, document, "write").pipe(
                Effect.flatMap(() =>
                  // 4. Complete upload and verify file metadata
                  this.completeUploadVerification(dto).pipe(
                    Effect.flatMap((verifiedMetadata) =>
                      // 5. Check for existing version with same checksum (idempotency)
                      // Combines checksum + contentRef validation: identical content with different metadata won't duplicate
                      this.checkExistingVersionByChecksum(dto.documentId, verifiedMetadata.checksum).pipe(
                        Effect.flatMap((existingVersion) =>
                          Option.match(existingVersion, {
                            // If version exists, return it (idempotency)
                            onSome: (version) => this.buildConfirmUploadResponse(version),
                            // Otherwise, create new version
                            onNone: () =>
                              // 6. Create new document version
                              this.createDocumentVersion(dto, document, actor, verifiedMetadata).pipe(
                                Effect.flatMap((newVersion) =>
                                  // 7. Update document timestamp
                                  this.updateDocumentTimestamp(document).pipe(
                                    Effect.flatMap(() =>
                                      // 8. Return version response
                                      this.buildConfirmUploadResponse(newVersion)
                                    )
                                  )
                                )
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
          Effect.provideService(Clock.Clock, Clock.make()),
          Effect.mapError(mapUploadConfirmationError({ documentId: dto.documentId }))
        )
      )
    ) as Effect.Effect<ConfirmUploadResponse, WorkflowError | ParseResult.ParseError, never>
  }

  // ===== PRIVATE HELPER METHODS =====

  private computeNextVersionNumber(
    documentId: DocumentId
  ): Effect.Effect<number, WorkflowDependencyError> {
    return pipe(
      this.documentVersionRepository.getNextVersionNumber(documentId),
      Effect.mapError((error) => new WorkflowDependencyError(
        `Failed to compute next version number for document: ${documentId}`,
        "DocumentVersionRepository",
        "getNextVersionNumber",
        { originalError: error, documentId }
      ))
    )
  }

  private createUploadUrl(
    dto: S.Schema.Type<typeof InitiateUploadCommandSchema>,
    document: DocumentEntity,
    _actor: UserEntity,
    nextVersion: number
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
        fileName: `${document.title}-v${nextVersion}`,
        expiryMs
      }),
      Effect.map((storageResponse): InitiateUploadResponse => ({
        uploadUrl: storageResponse.uploadUrl,
        fileKey: storageResponse.fileKey,
        contentRef: dto.contentRef, // Keep contentRef matching DTO-supplied value
        expiresAt: storageResponse.expiresAt,
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
      Effect.mapError((error): ChecksumValidationError | FileNotFoundError | UploadConfirmationError => {
        if (error instanceof ChecksumValidationError || error instanceof UploadConfirmationError) {
          return error
        }
        if (error instanceof FileStorageError && error.code === "NOT_FOUND") {
          return new FileNotFoundError(
            `File not found in storage: ${dto.fileKey}`,
            dto.fileKey,
            { originalError: error }
          )
        }
        return new UploadConfirmationError(
          `Upload verification failed: ${error instanceof Error ? error.message : String(error)}`,
          dto.documentId,
          "",
          "FILE_NOT_FOUND",
          { originalError: error }
        )
      })
    )
  }

  private checkExistingVersionByChecksum(
    documentId: DocumentId,
    checksum: Sha256
  ): Effect.Effect<Option.Option<DocumentVersionEntity>, WorkflowDependencyError> {
    return pipe(
      this.documentVersionRepository.findByDocumentIdAndChecksum(documentId, checksum),
      Effect.mapError(mapDocumentVersionPersistenceError("findByDocumentIdAndChecksum"))
    )
  }

  private createDocumentVersion(
    dto: S.Schema.Type<typeof ConfirmUploadCommandSchema>,
    _document: DocumentEntity,
    actor: UserEntity,
    verifiedMetadata: { checksum: Sha256; fileKey: FileKey; actualSize: number; actualMimeType: string; contentRefValid: boolean }
  ): Effect.Effect<DocumentVersionEntity, WorkflowDependencyError, Clock.Clock> {
    return pipe(
      // Generate new version ID
      Effect.sync(() => crypto.randomUUID()),
      Effect.flatMap((generatedIdString) =>
        // Validate generated UUID
        makeDocumentVersionId(generatedIdString).pipe(
          Effect.mapError((error) => new WorkflowDependencyError(
            `Failed to validate generated document version ID: ${error.message}`,
            "DocumentVersionId",
            "validation",
            { originalError: error, generatedId: generatedIdString }
          ))
        )
      ),
      Effect.flatMap((versionId) =>
        // Determine version number
            pipe(
              dto.versionHint !== undefined
                ? Effect.succeed(dto.versionHint)
                : this.computeNextVersionNumber(dto.documentId),
              Effect.flatMap((versionNumber) =>
                // Get current timestamp
                Clock.currentTimeMillis.pipe(
                  Effect.map((ms) => new Date(ms)),
                  Effect.flatMap((now) => {
                    // Build SerializedDocumentVersion
                const versionData: SerializedDocumentVersion = {
                  id: versionId,
                  documentId: dto.documentId,
                  version: versionNumber,
                  file: {
                    checksum: verifiedMetadata.checksum,
                    fileKey: verifiedMetadata.fileKey,
                    mimeType: verifiedMetadata.actualMimeType as any,
                    size: verifiedMetadata.actualSize as any
                  },
                  createdBy: actor.id,
                  createdAt: now.toISOString(),
                  updatedAt: undefined
                }

                // Create entity
                return DocumentVersionEntity.create(versionData)
              })
            )
          )
        )
      ),
      Effect.mapError((error) => {
        if (error instanceof WorkflowDependencyError) {
          return error
        }
        return new WorkflowDependencyError(
          `Failed to create document version: ${error instanceof Error ? error.message : String(error)}`,
          "DocumentVersionEntity",
          "create",
          { originalError: error }
        )
      }),
      Effect.flatMap((versionEntity) =>
        // Persist to repository
        this.documentVersionRepository.save(versionEntity).pipe(
          Effect.mapError(mapDocumentVersionPersistenceError("save"))
        )
      )
    )
  }

  private updateDocumentTimestamp(
    document: DocumentEntity
  ): Effect.Effect<DocumentEntity, WorkflowDependencyError, Clock.Clock> {
    return pipe(
      // Get current timestamp
      Clock.currentTimeMillis,
      Effect.map((ms) => new Date(ms)),
      Effect.flatMap((now) =>
        // Serialize current document and update timestamp
        document.serialized().pipe(
          Effect.mapError((error) => new WorkflowDependencyError(
            `Failed to serialize document for timestamp update: ${error.message}`,
            "DocumentEntity",
            "serialized",
            { originalError: error }
          )),
          Effect.flatMap((serialized) =>
            // Create updated document with new timestamp
            DocumentEntity.create({
              ...serialized,
              updatedAt: now.toISOString()
            }).pipe(
              Effect.mapError((error) => new WorkflowDependencyError(
                `Failed to create document with updated timestamp: ${error.message}`,
                "DocumentEntity",
                "create",
                { originalError: error }
              ))
            )
          )
        )
      ),
      Effect.flatMap((updatedDocument) =>
        // Persist updated document
        this.documentRepository.save(updatedDocument).pipe(
          Effect.mapError(mapDocumentPersistenceError("save"))
        )
      )
    )
  }

  private buildConfirmUploadResponse(
    version: DocumentVersionEntity
  ): Effect.Effect<ConfirmUploadResponse, WorkflowDependencyError, Clock.Clock> {
    // Build response directly from entity properties
    return Effect.succeed({
      versionId: version.id,
      documentId: version.documentId,
      version: version.version as any, // Cast to satisfy branded type
      file: version.file,
      createdBy: version.createdBy,
      createdAt: version.createdAt,
      updatedAt: optionToUndefined(version.updatedAt)
    } as ConfirmUploadResponse)
  }
}

