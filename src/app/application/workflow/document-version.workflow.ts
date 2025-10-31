import "reflect-metadata"

import { Effect, Option, pipe, Schema as S, ParseResult, Clock } from "effect"
import { injectable, inject } from "tsyringe"

// Domain repositories
import { DocumentAggregateRepository } from "@domain/document/document-aggregate.repository"
import { AccessPolicyRepository } from "@domain/accessPolicy/access-policy.repository"
import { UserRepository } from "@domain/user/user.repository"

// Domain errors
import { DocumentVersionNotFoundError } from "@domain/documentVersion/document-version.error"
import { DatabaseError } from "@domain/utils/base.errors"

// Application errors
import { WorkflowError, WorkflowDependencyError } from "@application/errors/application.errors"

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
    @inject(TOKENS.DOCUMENT_AGGREGATE_REPOSITORY)
    private readonly documentAggregateRepository: DocumentAggregateRepository,
    
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
          loadDocument(this.documentAggregateRepository, dto.documentId, dto.workspaceId)
        ]).pipe(
          Effect.flatMap(([actor, document]) =>
            // 3. Check read permission
            ensureRead(this.accessPolicyRepository, actor, document).pipe(
              Effect.flatMap(() =>
                // 4. Load aggregate to access versions
                this.documentAggregateRepository.loadById(dto.documentId).pipe(
                  Effect.mapError((error) => {
                    if (error instanceof DatabaseError) {
                      return new WorkflowDependencyError(
                        `Database error loading aggregate: ${dto.documentId}`,
                        "DocumentAggregateRepository",
                        "loadById",
                        { originalError: error }
                      )
                    }
                    return new WorkflowDependencyError(
                      `Failed to load aggregate: ${dto.documentId}`,
                      "DocumentAggregateRepository",
                      "loadById",
                      { originalError: error }
                    )
                  }),
                  Effect.flatMap(
                    Option.match({
                      onNone: () => Effect.fail(new WorkflowDependencyError(
                        `Document aggregate not found: ${dto.documentId}`,
                        "DocumentAggregateRepository",
                        "loadById",
                        {}
                      )),
                      onSome: (aggregate) => Effect.succeed(aggregate)
                    })
                  )
                )
              )
            )
          ),
          Effect.flatMap((aggregate) => {
            // 5. Get versions from aggregate and apply pagination
            const versions = aggregate.getVersions()
            // Reverse to show latest first (descending order for UX)
            const versionsDescending = [...versions].reverse()
            const pageNum = dto.pageNum || 1
            const pageSize = dto.pageSize || 10
            
            return applyPagination(
              versionsDescending,
              versionsDescending.length,
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
        return mapDocumentVersionError("loadById")(error)
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
          loadDocument(this.documentAggregateRepository, dto.documentId, dto.workspaceId)
        ]).pipe(
          Effect.flatMap(([actor, document]) =>
            // 3. Check read permission
            ensureRead(this.accessPolicyRepository, actor, document).pipe(
              Effect.flatMap(() =>
                // 4. Load aggregate to access versions
                this.documentAggregateRepository.loadById(dto.documentId).pipe(
                  Effect.mapError((error) => {
                    if (error instanceof DatabaseError) {
                      return new WorkflowDependencyError(
                        `Database error loading aggregate: ${dto.documentId}`,
                        "DocumentAggregateRepository",
                        "loadById",
                        { originalError: error }
                      )
                    }
                    return new WorkflowDependencyError(
                      `Failed to load aggregate: ${dto.documentId}`,
                      "DocumentAggregateRepository",
                      "loadById",
                      { originalError: error }
                    )
                  }),
                  Effect.flatMap(
                    Option.match({
                      onNone: () => Effect.fail(new WorkflowDependencyError(
                        `Document aggregate not found: ${dto.documentId}`,
                        "DocumentAggregateRepository",
                        "loadById",
                        {}
                      )),
                      onSome: (aggregate) => Effect.succeed(aggregate)
                    })
                  )
                )
              )
            )
          ),
          Effect.flatMap((aggregate) => {
                // 5. Get latest version from aggregate
                const latestVersionOption = aggregate.getLatestVersion()
                return Option.match(latestVersionOption, {
                  onNone: () => Effect.fail(new DocumentVersionNotFoundError(
                    `No versions found for document: ${dto.documentId}`,
                    "documentId",
                    dto.documentId
                  )),
                  onSome: (version) => Effect.succeed(version)
                })
          }),
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
        // 2. Load actor and document version in parallel
        Effect.all([
          loadActor(this.userRepository, dto.actorId),
          loadDocumentVersion(this.documentAggregateRepository, dto.versionId)
        ]).pipe(
          Effect.flatMap(([actor, version]) =>
            // 3. Load parent document to check access (with workspace validation)
            loadDocument(this.documentAggregateRepository, version.documentId, dto.workspaceId).pipe(
            Effect.flatMap((document) =>
            // 4. Ensure read permission for parent document
            ensureRead(this.accessPolicyRepository, actor, document).pipe(
              Effect.map(() => version)
                )
              )
            )
          ),
          Effect.flatMap((version) =>
            // 5. Serialize and return
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

