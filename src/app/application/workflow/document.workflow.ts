import "reflect-metadata"

import { Effect, Option, pipe, Schema as S, ParseResult, Clock } from "effect"
import { injectable, inject } from "tsyringe"

// Domain entities
import { DocumentEntity, SerializedDocument } from "@domain/document/document.entity"
import { AccessPolicyEntity } from "@domain/accessPolicy/access-policy.entity"

// Domain repositories
import { DocumentRepository, DocumentSearchFilters } from "@domain/document/document.repository"
import { DocumentVersionRepository } from "@domain/documentVersion/document-version.repository"
import { DownloadTokenRepository } from "@domain/downloadToken/download-token.repository"
import { AccessPolicyRepository } from "@domain/accessPolicy/access-policy.repository"
import { UserRepository } from "@domain/user/user.repository"

// Domain services
import { DocumentAccessService } from "@domain/accessPolicy/document-access.service"

// Domain errors
import { DocumentNotFoundError } from "@domain/document/document.error"

// Application errors
import { PermissionCheckError, WorkflowError, WorkflowDependencyError } from "@application/errors/application.errors"

// Application DTOs
import { 
  CreateDocumentCommandSchema, 
  CreateDocumentCommandEncoded,
  UpdateDocumentCommandSchema, 
  UpdateDocumentCommandEncoded, 
  PublishDocumentCommandSchema, 
  PublishDocumentCommandEncoded,
  DeleteDocumentCommandSchema,
  DeleteDocumentCommandEncoded
} from "@application/dto/document/commands.dto"
import { 
  GetDocumentQuerySchema, 
  GetDocumentQueryEncoded, 
  ListDocumentsQuerySchema, 
  ListDocumentsQueryEncoded,
  GetDocumentAccessQuerySchema,
  GetDocumentAccessQueryEncoded,
  DocumentAccessResponseEncoded
} from "@application/dto/document/queries.dto"
import { 
  PaginatedDocumentsResponseEncoded 
} from "@application/dto/document/responses.dto"

// Application workflow helpers
import {
  loadActor,
  loadDocument,
  loadActorAccessContext,
  ensurePermission,
  serializeDocument,
  serializeDocumentSummary,
  getEffectivePermissionLevel,
  mapDocumentDomainError,
  mapDocumentPersistenceError,
  optionToUndefined,
  optionToNull,
  optionArrayToUndefined
} from "@application/workflow/helpers"

// Application workflows
import { AccessPolicyWorkflow } from "./access-policy.workflow"

// Refined types
import { DocumentId } from "@domain/refined/ids"

// DI tokens
import { TOKENS } from "@infra/di/container"

/**
 * DocumentWorkflow - Application layer workflow for document operations
 */
@injectable()
export class DocumentWorkflow {
  constructor(
    @inject(TOKENS.DOCUMENT_REPOSITORY)
    private readonly documentRepository: DocumentRepository,
    
    @inject(TOKENS.DOCUMENT_VERSION_REPOSITORY)
    private readonly documentVersionRepository: DocumentVersionRepository,
    
    @inject(TOKENS.DOWNLOAD_TOKEN_REPOSITORY)
    private readonly downloadTokenRepository: DownloadTokenRepository,
    
    @inject(TOKENS.ACCESS_POLICY_REPOSITORY)
    private readonly accessPolicyRepository: AccessPolicyRepository,
    
    @inject(TOKENS.USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    
    @inject(TOKENS.ACCESS_POLICY_WORKFLOW)
    private readonly accessPolicyWorkflow: AccessPolicyWorkflow
  ) {}

  createDocument(input: CreateDocumentCommandEncoded): Effect.Effect<SerializedDocument, WorkflowError | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode DTO using schema validation
      S.decodeUnknown(CreateDocumentCommandSchema)(input),
      Effect.flatMap((dto) => 
        // 2. Load actor to validate ownership context
        loadActor(this.userRepository, dto.ownerId).pipe(
          Effect.flatMap(() =>
            // 3. Generate ID and get current timestamp
            Effect.all([
              Effect.sync(() => crypto.randomUUID()),
              Clock.currentTimeMillis.pipe(Effect.map((ms) => new Date(ms)))
            ])
          ),
          Effect.flatMap(([generatedIdString, now]) =>
            // 4. Validate generated UUID with schema-first boundary rule
            S.decodeUnknown(DocumentId)(generatedIdString).pipe(
              Effect.mapError((error) => new WorkflowDependencyError(
                `Failed to validate generated document ID: ${error.message}`,
                "DocumentId",
                "validation",
                { originalError: error, generatedId: generatedIdString }
              )),
              Effect.flatMap((validatedId) => {
                // 5. Build SerializedDocument with validated ID, workspaceId, and timestamp
                const documentData: Partial<SerializedDocument> = {
                  id: validatedId,
                  workspaceId: dto.workspaceId,
                  ownerId: dto.ownerId,
                  title: dto.title,
                  description: optionToUndefined(dto.description),
                  tags: optionArrayToUndefined(dto.tags),
                  publishStatus: "draft" as const,
                  publishNotes: undefined,
                  createdAt: now.toISOString(),
                  updatedAt: undefined
                }
                
                // 6. Create document entity (will validate and fill defaults)
                return DocumentEntity.create(documentData as SerializedDocument)
              })
            )
          )
        )
      ),
      Effect.mapError(mapDocumentDomainError("create")),
      Effect.flatMap((document) =>
        // 7. Persist with repository
        this.documentRepository.save(document).pipe(
          Effect.mapError(mapDocumentPersistenceError("save"))
        )
      ),
      Effect.flatMap((savedDocument) =>
        // 8. Return serialized document
        serializeDocument(savedDocument)
      )
    )
  }

  updateDocument(input: UpdateDocumentCommandEncoded): Effect.Effect<SerializedDocument, WorkflowError | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode DTO using schema validation
      S.decodeUnknown(UpdateDocumentCommandSchema)(input),
      Effect.flatMap((dto) => 
        // 2. Load actor and document in parallel (with workspace validation)
        Effect.all([
          loadActor(this.userRepository, dto.actorId),
          loadDocument(this.documentRepository, dto.id, dto.workspaceId)
        ]).pipe(
          Effect.flatMap(([actor, document]) =>
            // 3. Check write permission
            ensurePermission(this.accessPolicyRepository, actor, document, "write").pipe(
              Effect.flatMap(() => {
                // 4. Apply domain mutations in declarative pipeline
                return pipe(
                  Effect.succeed(document),
                  // Apply title mutation if provided
                  Effect.flatMap((doc) =>
                    dto.title !== undefined
                      ? doc.rename(dto.title)
                      : Effect.succeed(doc)
                  ),
                  // Apply description mutation if provided
                  Effect.flatMap((doc) =>
                    dto.description !== undefined
                      ? pipe(
                          // Convert Option<string | undefined> to Option<string>
                          Option.match(dto.description, {
                            onNone: () => Option.none<string>(),
                            onSome: (desc) => desc !== undefined ? Option.some(desc) : Option.none<string>()
                          }),
                          (descriptionOption) => doc.updateDescription(descriptionOption)
                        )
                      : Effect.succeed(doc)
                  ),
                  // Apply tags mutation if provided
                  Effect.flatMap((doc) =>
                    dto.tags !== undefined
                      ? pipe(
                          // Handle Option<readonly string[]> for tags
                          Option.match(dto.tags, {
                            onNone: () => Effect.succeed(doc),
                            onSome: (tagsArray) => {
                              if (tagsArray.length > 0) {
                                // Remove all existing tags first, then add new ones
                                return doc.removeTags([...doc.tagsOrEmpty]).pipe(
                                  Effect.flatMap((docWithoutTags) => 
                                    docWithoutTags.addTags([...tagsArray]) // Convert readonly to mutable
                                  )
                                )
                              } else {
                                // Remove all tags if empty array provided
                                return doc.removeTags([...doc.tagsOrEmpty])
                              }
                            }
                          })
                        )
                      : Effect.succeed(doc)
                  )
                )
              })
            )
          )
        )
      ),
      Effect.mapError(mapDocumentDomainError("update")),
      Effect.flatMap((updatedDocument) =>
        // 5. Persist with repository
        this.documentRepository.save(updatedDocument).pipe(
          Effect.mapError(mapDocumentPersistenceError("save"))
        )
      ),
      Effect.flatMap((savedDocument) =>
        // 6. Return serialized document
        serializeDocument(savedDocument)
      )
    )
  }

  publishDocument(input: PublishDocumentCommandEncoded): Effect.Effect<SerializedDocument, WorkflowError | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode DTO using schema validation
      S.decodeUnknown(PublishDocumentCommandSchema)(input),
      Effect.flatMap((dto) => 
        // 2. Load actor and document (with workspace validation)
        Effect.all([
          loadActor(this.userRepository, dto.actorId),
          loadDocument(this.documentRepository, dto.documentId, dto.workspaceId)
        ]).pipe(
          Effect.flatMap(([actor, document]) =>
            // 3. Check admin access using ensurePermission helper
            ensurePermission(this.accessPolicyRepository, actor, document, "admin").pipe(
              Effect.flatMap(() => {
                // 4. Apply domain mutations in declarative pipeline
                return pipe(
                  Effect.succeed(document),
                  // Update publish status
                  Effect.flatMap((doc) => doc.updatePublishStatus(dto.publishStatus)),
                  // Update publish notes if provided
                  Effect.flatMap((doc) =>
                    dto.publishNotes !== undefined
                      ? pipe(
                          // Convert Option<string | undefined> to Option<string>
                          Option.match(dto.publishNotes, {
                            onNone: () => Option.none<string>(),
                            onSome: (note) => note !== undefined ? Option.some(note) : Option.none<string>()
                          }),
                          (notesOption) => doc.updatePublishNotes(notesOption)
                        )
                      : Effect.succeed(doc)
                  )
                )
              })
            )
          ),
          Effect.flatMap((updatedDocument) =>
            // 5. Persist with repository
            this.documentRepository.save(updatedDocument).pipe(
              Effect.mapError(mapDocumentPersistenceError("save"))
            )
          ),
          Effect.flatMap((savedDocument) =>
            // 6. Sync collaborator policies when publish status transitions
            this.syncCollaboratorPoliciesOnPublishStatusChange(savedDocument, dto.publishStatus).pipe(
              Effect.flatMap(() =>
                // 7. Return serialized document
                serializeDocument(savedDocument)
              )
            )
          )
        )
      ),
      Effect.mapError(mapDocumentDomainError("publish"))
    )
  }

  private syncCollaboratorPoliciesOnPublishStatusChange(
    document: DocumentEntity, 
    newPublishStatus: "draft" | "published" | "unpublished"
  ): Effect.Effect<void, WorkflowDependencyError> {
    return pipe(
      // 1. Get all existing policies for the document
      this.accessPolicyWorkflow.getPoliciesForDocument(document.id),
      Effect.flatMap((allPolicies) => {
        // 2. Filter out owner policies (owner always has full access)
        const collaboratorPolicies = allPolicies.filter((policy) => {
          // Keep policies that are not for the document owner
          return Option.match(policy.subjectId, {
            onNone: () => true, // Role-based policies
            onSome: (subjectId) => subjectId !== document.ownerId
          })
        })

        // 3. Apply business rules based on publish status transition
        return this.applyPublishStatusPolicyRules(document, newPublishStatus, collaboratorPolicies)
      }),
      Effect.mapError((error) => new WorkflowDependencyError(
        `Failed to sync collaborator policies for document ${document.id}`,
        "AccessPolicyWorkflow",
        "syncPolicies",
        { documentId: document.id, newPublishStatus, originalError: error }
      ))
    )
  }

  private applyPublishStatusPolicyRules(
    document: DocumentEntity,
    newPublishStatus: "draft" | "published" | "unpublished",
    collaboratorPolicies: readonly AccessPolicyEntity[]
  ): Effect.Effect<void, WorkflowDependencyError> {
    switch (newPublishStatus) {
      case "published":
        // When publishing: ensure collaborators maintain their access
        // No policy changes needed - existing policies remain valid
        return Effect.void

      case "unpublished":
        // When unpublishing: restrict collaborator access to read-only
        return this.restrictCollaboratorAccessToReadOnly(document, collaboratorPolicies)

      case "draft":
        // When returning to draft: maintain existing access policies
        // No policy changes needed - existing policies remain valid
        return Effect.void

      default:
        return Effect.void
    }
  }

  /**
   * Restrict collaborator access to read-only when document is unpublished
   * Collects all failures and surfaces them via WorkflowDependencyError
   * Only proceeds when every policy update succeeds
   */
  private restrictCollaboratorAccessToReadOnly(
    document: DocumentEntity,
    collaboratorPolicies: readonly AccessPolicyEntity[]
  ): Effect.Effect<void, WorkflowDependencyError> {
    if (collaboratorPolicies.length === 0) {
      return Effect.void
    }

    // Update each collaborator policy to only allow read access
    // Collect results with both successes and failures
    return pipe(
      Effect.forEach(
        collaboratorPolicies,
        (policy) => 
          this.accessPolicyWorkflow.updatePolicyActions({
            workspaceId: document.workspaceId,
            policyId: policy.id,
            actions: ["read"],
            actorId: document.ownerId // Owner is performing the update
          }).pipe(
            Effect.map(() => ({ success: true as const, policyId: policy.id })),
            Effect.catchAll((error) => Effect.succeed({ success: false as const, policyId: policy.id, error: error as WorkflowError })),
            Effect.provideService(Clock.Clock, Clock.make())
          ),
        { concurrency: "unbounded" }
      ),
      Effect.flatMap((results) => {
        const failures = results.filter((r) => !r.success)
        
        if (failures.length > 0) {
          return Effect.fail(new WorkflowDependencyError(
            `Failed to update ${failures.length} of ${collaboratorPolicies.length} collaborator policies`,
            "AccessPolicyWorkflow",
            "updatePolicyActions",
            { 
              failedPolicyIds: failures.map(f => f.policyId),
              errors: failures.map(f => f.error),
              documentId: document.id
            }
          ))
        }
        return Effect.void
      })
    )
  }

  getDocument(input: GetDocumentQueryEncoded): Effect.Effect<SerializedDocument, WorkflowError | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode DTO using schema validation
      S.decodeUnknown(GetDocumentQuerySchema)(input),
      Effect.flatMap((dto) =>
        // 2. Load actor and document (with workspace validation)
        Effect.all([
          loadActor(this.userRepository, dto.actorId),
          loadDocument(this.documentRepository, dto.documentId, dto.workspaceId)
        ]).pipe(
          Effect.flatMap(([actor, document]) =>
            // 3. Check read permission
            ensurePermission(this.accessPolicyRepository, actor, document, "read").pipe(
              Effect.flatMap(() =>
                // 4. Return serialized document
                serializeDocument(document)
              )
            )
          )
        )
      ),
      Effect.mapError((error) => {
        // Map domain errors to WorkflowError
        if (error instanceof DocumentNotFoundError) {
          return new WorkflowDependencyError(
            `Document not found: ${error.message}`,
            "DocumentRepository",
            "findById",
            { originalError: error }
          )
        }
        if (error instanceof PermissionCheckError) {
          return error // Already a WorkflowError
        }
        return error as unknown as WorkflowError
      })
    )
  }

  listDocuments(input: ListDocumentsQueryEncoded): Effect.Effect<PaginatedDocumentsResponseEncoded, WorkflowError | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode DTO using schema validation
      S.decodeUnknown(ListDocumentsQuerySchema)(input),
      Effect.flatMap((dto) =>
        // 2. Validate actor exists
        loadActor(this.userRepository, dto.actorId).pipe(
          Effect.flatMap(() => {
            // 3. Build search filters with workspace, caller-provided pagination, and actor context
            const pageNum = dto.pageNum || 1
            const pageSize = dto.pageSize || 10
            const searchFilters: DocumentSearchFilters = {
              workspaceId: dto.workspaceId,
              ...(dto.search && { query: dto.search }),
              ...(Option.isSome(dto.tags) && { tags: Option.getOrElse(dto.tags, () => []) }),
              ...(dto.ownerId && { ownerId: dto.ownerId }),
              actorId: dto.actorId, // Pass actor context for repository-level permission filtering
              paginationOptions: {
                pageNum,
                pageSize
              }
            }

            // 4. Search documents with repository-level permission filtering
            return this.documentRepository.search(searchFilters).pipe(
              Effect.mapError(mapDocumentPersistenceError("search")),
              Effect.flatMap((paginatedResults) => {
                // 5. Serialize accessible documents (already filtered by repository)
                return pipe(
                  Effect.forEach(
                    paginatedResults.data,
                    serializeDocumentSummary,
                    { concurrency: "unbounded" }
                  ),
                  Effect.map((serializedData) => ({
                    data: serializedData,
                    total: paginatedResults.total,
                    pageNum: paginatedResults.pageNum,
                    pageSize: paginatedResults.pageSize,
                    totalPages: paginatedResults.totalPages
                  }))
                )
              })
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

  private checkDocumentDependencies(
    documentId: DocumentId
  ): Effect.Effect<void, WorkflowDependencyError> {
    return pipe(
      // Check for versions, tokens, and policies in parallel
      Effect.all([
        this.documentVersionRepository.findByDocumentId(documentId).pipe(
          Effect.map((versions) => ({ type: "versions" as const, count: versions.length })),
          Effect.catchAll(() => Effect.succeed({ type: "versions" as const, count: 0 }))
        ),
        this.downloadTokenRepository.findByDocumentId(documentId).pipe(
          Effect.map((tokens) => ({ type: "tokens" as const, count: tokens.length })),
          Effect.catchAll(() => Effect.succeed({ type: "tokens" as const, count: 0 }))
        ),
        this.accessPolicyWorkflow.getPoliciesForDocument(documentId).pipe(
          Effect.map((policies) => ({ type: "policies" as const, count: policies.length })),
          Effect.catchAll(() => Effect.succeed({ type: "policies" as const, count: 0 }))
        )
      ]),
      Effect.flatMap((results: Array<{ type: string; count: number }>) => {
        const dependencies = results.filter((result) => result.count > 0)
        
        if (dependencies.length > 0) {
          const dependencyDetails = dependencies.map((dep) => `${dep.count} ${dep.type}`).join(", ")
          return Effect.fail(new WorkflowDependencyError(
            `Cannot delete document with existing dependencies: ${dependencyDetails}. Use force=true to override.`,
            "Document",
            "delete",
            { documentId, dependencies }
          ))
        }
        
        return Effect.void
      })
    )
  }

  deleteDocument(input: DeleteDocumentCommandEncoded): Effect.Effect<boolean, WorkflowError | ParseResult.ParseError, never> {
    return pipe(
      // 1. Decode DTO using schema validation
      S.decodeUnknown(DeleteDocumentCommandSchema)(input),
      Effect.flatMap((dto) =>
        // 2. Load actor and document in parallel (with workspace validation)
        Effect.all([
          loadActor(this.userRepository, dto.actorId),
          loadDocument(this.documentRepository, dto.id, dto.workspaceId)
        ]).pipe(
          Effect.flatMap(([actor, document]) =>
            // 3. Check admin permission
            ensurePermission(this.accessPolicyRepository, actor, document, "admin").pipe(
              Effect.flatMap(() => {
                // 4. Check for dependencies if force flag is not set
                if (!dto.force) {
                  return this.checkDocumentDependencies(dto.id)
                }
                return Effect.void
              }),
              Effect.flatMap(() =>
                // 5. Delete document via repository
                this.documentRepository.delete(dto.id).pipe(
                  Effect.map(() => true),
                  Effect.mapError((error) => new WorkflowDependencyError(
                    `Failed to delete document: ${error instanceof Error ? error.message : String(error)}`,
                    "DocumentRepository",
                    "delete",
                    { originalError: error }
                  ))
                )
              )
            )
          )
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

  getDocumentAccess(
    input: GetDocumentAccessQueryEncoded
  ): Effect.Effect<DocumentAccessResponseEncoded, WorkflowError | ParseResult.ParseError, never> {
    return pipe(
      // 1. Decode query DTO using schema validation
      S.decodeUnknown(GetDocumentAccessQuerySchema)(input),
      Effect.flatMap((dto) =>
        // 2. Load actor and document (with workspace validation)
        Effect.all([
          loadActor(this.userRepository, dto.actorId),
          loadDocument(this.documentRepository, dto.documentId, dto.workspaceId)
        ]).pipe(
          Effect.flatMap(([actor, document]) =>
            // 3. Load actor access context (policies)
            loadActorAccessContext(this.accessPolicyRepository, actor, document).pipe(
              Effect.flatMap((actorPolicies) => {
                const requestedPermission = dto.requiredPermission || "read"
                
                // 4. Check access using DocumentAccessService.canAccessDocument
                return pipe(
                  DocumentAccessService.canAccessDocument(actor, document, actorPolicies, requestedPermission),
                  Effect.map((accessResult) => ({
                    hasAccess: accessResult.granted,
                    policies: actorPolicies
                  })),
                  // If access check fails, still return response with hasAccess: false
                  Effect.catchAll(() => 
                    Effect.succeed({
                      hasAccess: false,
                      policies: actorPolicies
                    })
                  ),
                  Effect.flatMap(({ hasAccess, policies }) =>
                    // 5. Get effective permission level using helper
                    getEffectivePermissionLevel(actor, document, policies).pipe(
                      Effect.map((effectiveLevel) => ({
                        hasAccess,
                        permissionLevel: effectiveLevel || "read",
                        policies
                      })),
                      Effect.catchAll(() =>
                        Effect.succeed({
                          hasAccess,
                          permissionLevel: "read" as const,
                          policies
                        })
                      )
                    )
                  ),
                  Effect.map(({ hasAccess, permissionLevel, policies }) => ({
                    hasAccess,
                    permissionLevel,
                    policies: policies.map(p => ({
                      id: p.id,
                      resourceId: p.resourceId,
                      subjectType: p.subjectType,
                      subjectId: optionToNull(p.subjectId),
                      role: optionToNull(p.role),
                      actions: p.actions,
                      effect: p.effect
                    }))
                  }))
                )
              })
            )
          )
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