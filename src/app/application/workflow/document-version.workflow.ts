import "reflect-metadata"

import { Effect, Option, pipe, Schema as S, ParseResult, Clock } from "effect"
import { injectable, inject } from "tsyringe"

// Domain repositories
import { DocumentRepository } from "@domain/document/document.repository"
import { DocumentVersionRepository } from "@domain/documentVersion/document-version.repository"
import { AccessPolicyRepository } from "@domain/accessPolicy/access-policy.repository"
import { UserRepository } from "@domain/user/user.repository"

// Domain errors
import { DocumentVersionNotFoundError } from "@domain/documentVersion/document-version.error"

// Application errors
import { WorkflowError } from "@application/errors/application.errors"

// Application DTOs
import {
  GetDocumentVersionQuerySchema,
  GetDocumentVersionQueryEncoded,
  ListDocumentVersionsQuerySchema,
  ListDocumentVersionsQueryEncoded,
  GetLatestDocumentVersionQuerySchema,
  GetLatestDocumentVersionQueryEncoded
} from "@application/dto/documentVersion/commands.dto"
import {
  DocumentVersionResponseEncoded,
  LatestDocumentVersionResponseEncoded,
  PaginatedDocumentVersionsResponseEncoded
} from "@application/dto/documentVersion/responses.dto"

// Application workflow helpers
import {
  loadActor,
  loadDocument,
  loadDocumentVersion,
  ensureRead,
  serializeDocumentVersion,
  mapDocumentVersionPersistenceError,
  mapDocumentVersionError,
  applyPagination
} from "@application/workflow/helpers"

// DI tokens
import { TOKENS } from "@infra/di/container"

/**
 * Responsibilities:
 * - Coordinate document version creation, retrieval, and listing
 * - Validate permissions for version operations
 * - Enforce idempotency and version integrity
 * - Map version errors to application-level errors
 */
@injectable()
export class DocumentVersionWorkflow {
  constructor(
    @inject(TOKENS.DOCUMENT_VERSION_REPOSITORY)
    private readonly documentVersionRepository: DocumentVersionRepository,
    
    @inject(TOKENS.DOCUMENT_REPOSITORY)
    private readonly documentRepository: DocumentRepository,
    
    @inject(TOKENS.USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    
    @inject(TOKENS.ACCESS_POLICY_REPOSITORY)
    private readonly accessPolicyRepository: AccessPolicyRepository
  ) {}

  listDocumentVersions(
    input: ListDocumentVersionsQueryEncoded
  ): Effect.Effect<PaginatedDocumentVersionsResponseEncoded, WorkflowError | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode query DTO using schema validation
      S.decodeUnknown(ListDocumentVersionsQuerySchema)(input),
      Effect.flatMap((dto) =>
        // 2. Load actor and document in parallel (with workspace validation)
        Effect.all([
          loadActor(this.userRepository, dto.actorId),
          loadDocument(this.documentRepository, dto.documentId, dto.workspaceId)
        ]).pipe(
          Effect.flatMap(([actor, document]) =>
            // 3. Check read permission
            ensureRead(this.accessPolicyRepository, actor, document).pipe(
              Effect.flatMap(() =>
                // 4. Fetch all versions for the document
                this.documentVersionRepository.findByDocumentId(dto.documentId).pipe(
                  Effect.mapError(mapDocumentVersionPersistenceError("findByDocumentId"))
                )
              )
            )
          ),
          Effect.flatMap((versions) => {
            // 5. Apply pagination and serialize versions using applyPagination helper
            const pageNum = dto.pageNum || 1
            const pageSize = dto.pageSize || 10
            
            return applyPagination(
              versions,
              versions.length,
              pageNum,
              pageSize,
              serializeDocumentVersion
            ).pipe(
              Effect.map((serializedVersions): PaginatedDocumentVersionsResponseEncoded => ({
                data: serializedVersions.data.map((v) => ({
                  id: v.id,
                  documentId: v.documentId,
                  version: v.version,
                  file: v.file,
                  createdBy: v.createdBy,
                  createdAt: v.createdAt
                })),
                total: serializedVersions.total,
                pageNum: serializedVersions.pageNum,
                pageSize: serializedVersions.pageSize,
                totalPages: serializedVersions.totalPages
              }))
            )
          })
        )
      ),
      Effect.mapError((error) => {
        if (error instanceof ParseResult.ParseError) {
          return error
        }
        // Apply proper error mapping
        if (error instanceof WorkflowError) {
          return error
        }
        return mapDocumentVersionError("findByDocumentId")(error)
      })
    )
  }

  getLatestDocumentVersion(
    input: GetLatestDocumentVersionQueryEncoded
  ): Effect.Effect<LatestDocumentVersionResponseEncoded, WorkflowError | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode query DTO using schema validation
      S.decodeUnknown(GetLatestDocumentVersionQuerySchema)(input),
      Effect.flatMap((dto) =>
        // 2. Load actor and document in parallel (with workspace validation)
        Effect.all([
          loadActor(this.userRepository, dto.actorId),
          loadDocument(this.documentRepository, dto.documentId, dto.workspaceId)
        ]).pipe(
          Effect.flatMap(([actor, document]) =>
            // 3. Check read permission
            ensureRead(this.accessPolicyRepository, actor, document).pipe(
              Effect.flatMap(() =>
                // 4. Fetch latest version, carrying dto through the pipeline
                this.documentVersionRepository.findLatestByDocumentId(dto.documentId).pipe(
                  Effect.mapError(mapDocumentVersionPersistenceError("findLatestByDocumentId")),
                  Effect.map((versionOption) => ({ dto, versionOption }))
                )
              )
            )
          ),
          Effect.mapError(mapDocumentVersionError("findLatestByDocumentId")),
          Effect.flatMap(({ dto, versionOption }) =>
            // 5. Handle Option.none case using decoded dto.documentId
            Option.match(versionOption, {
              onNone: () => Effect.fail(new DocumentVersionNotFoundError(
                `No versions found for document: ${dto.documentId}`,
                "documentId",
                dto.documentId
              )),
              onSome: (version) => Effect.succeed(version)
            })
          ),
          Effect.flatMap((version) =>
            // 6. Serialize and return
            serializeDocumentVersion(version)
          ),
          Effect.map((serialized): LatestDocumentVersionResponseEncoded => ({
            id: serialized.id,
            documentId: serialized.documentId,
            version: serialized.version,
            file: serialized.file,
            createdBy: serialized.createdBy,
            createdAt: serialized.createdAt,
            updatedAt: serialized.updatedAt || undefined
          }))
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

  getDocumentVersionById(
    input: GetDocumentVersionQueryEncoded
  ): Effect.Effect<DocumentVersionResponseEncoded, WorkflowError | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode query DTO using schema validation
      S.decodeUnknown(GetDocumentVersionQuerySchema)(input),
      Effect.flatMap((dto) =>
        // 2. Load actor
        loadActor(this.userRepository, dto.actorId).pipe(
          Effect.flatMap((actor) =>
            // 3. Load version by ID
            loadDocumentVersion(this.documentVersionRepository, dto.versionId).pipe(
              Effect.mapError(mapDocumentVersionError("getVersion")),
              Effect.flatMap((version) =>
                // 4. Load parent document to check access (with workspace validation)
                loadDocument(this.documentRepository, version.documentId, dto.workspaceId).pipe(
                  Effect.flatMap((document) =>
                    // 5. Ensure read permission for parent document
                    ensureRead(this.accessPolicyRepository, actor, document).pipe(
                      Effect.map(() => version)
                    )
                  )
                )
              )
            )
          ),
          Effect.flatMap((version) =>
            // 6. Serialize and return
            serializeDocumentVersion(version)
          ),
          Effect.map((serialized): DocumentVersionResponseEncoded => ({
            id: serialized.id,
            documentId: serialized.documentId,
            version: serialized.version,
            file: serialized.file,
            createdBy: serialized.createdBy,
            createdAt: serialized.createdAt,
            updatedAt: serialized.updatedAt || undefined
          }))
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
}

