import "reflect-metadata"

import { Effect, Option, pipe, Schema as S, ParseResult, Clock } from "effect"
import { injectable, inject } from "tsyringe"

// Domain entities
import { AccessPolicyEntity, SerializedAccessPolicy, PermissionAction } from "@domain/accessPolicy/access-policy.entity"
import { DocumentEntity } from "@domain/document/document.entity"
import { UserEntity } from "@domain/user/user.entity"

// Domain repositories
import { AccessPolicyRepository } from "@domain/accessPolicy/access-policy.repository"
import { DocumentRepository } from "@domain/document/document.repository"
import { UserRepository } from "@domain/user/user.repository"

// Domain errors
import {
  AccessPolicyNotFoundError,
  AccessPolicyValidationError
} from "@domain/accessPolicy/access-policy.error"
import { DatabaseError, BusinessRuleViolationError } from "@domain/utils/base.errors"

// Application errors
import { PermissionCheckError, WorkflowError, WorkflowDependencyError } from "@application/errors/application.errors"

// Application DTOs
import {
  AddPolicyCommandSchema,
  AddPolicyCommandEncoded,
  UpdatePolicyActionsCommandSchema,
  UpdatePolicyActionsCommandEncoded,
  RemovePolicyCommandSchema,
  RemovePolicyCommandEncoded,
  GetDocumentPoliciesQuerySchema,
  GetDocumentPoliciesQueryEncoded,
  GetActorPoliciesQuerySchema,
  GetActorPoliciesQueryEncoded,
  AccessPolicyResponseEncoded
} from "@application/dto/accessPolicy"

// Application workflow helpers
import {
  createEntityId,
  loadActor,
  loadDocument,
  ensurePermission,
  filterPoliciesByActor,
  mapAccessPolicyPersistenceError,
  mapAccessPolicyDomainError,
  mapAccessPolicyDeletionError,
  optionToUndefined,
  recordAudit
} from "@application/workflow/helpers"

// Refined types
import { AccessPolicyId, DocumentId } from "@domain/refined/ids"

// DI tokens
import { TOKENS } from "@infra/di/container"

// Audit
import { AuditPort } from "@application/services/ports/audit.port"

/*
 * Responsibilities:
 * - Coordinate access policy creation, updates, and removal
 * - Validate permissions for policy management operations
 * - Enforce access control rules
 * - Map policy errors to application-level errors
 */
@injectable()
export class AccessPolicyWorkflow {
  constructor(
    @inject(TOKENS.ACCESS_POLICY_REPOSITORY)
    private readonly accessPolicyRepository: AccessPolicyRepository,
    
    @inject(TOKENS.DOCUMENT_REPOSITORY)
    private readonly documentRepository: DocumentRepository,
    
    @inject(TOKENS.USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    
    @inject(TOKENS.AUDIT_PORT)
    private readonly audit: AuditPort
  ) {}

  // ===== PRIVATE HELPER METHODS =====

  private ensureAdmin(
    actor: UserEntity,
    document: DocumentEntity
  ): Effect.Effect<void, PermissionCheckError | WorkflowDependencyError> {
    return ensurePermission(
      this.accessPolicyRepository,
      actor,
      document,
      "admin"
    )
  }

  private loadPolicy(
    policyId: AccessPolicyId
  ): Effect.Effect<AccessPolicyEntity, AccessPolicyNotFoundError | WorkflowDependencyError> {
    return pipe(
      this.accessPolicyRepository.findById(policyId),
      Effect.mapError((error) => {
        if (error instanceof DatabaseError) {
          return new WorkflowDependencyError(
            `Database error loading access policy: ${policyId}`,
            "AccessPolicyRepository",
            "findById",
            { originalError: error }
          )
        }
        return new AccessPolicyNotFoundError(
          `Failed to load access policy: ${policyId}`,
          "id",
          policyId,
          { originalError: error }
        )
      }),
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.fail(new AccessPolicyNotFoundError(
            `Access policy not found: ${policyId}`,
            "id",
            policyId
          )),
          onSome: (policy) => Effect.succeed(policy)
        })
      )
    )
  }

  // ===== WORKFLOW METHODS =====

  removePolicy(
    input: RemovePolicyCommandEncoded
  ): Effect.Effect<boolean, WorkflowError | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode DTO using schema validation
      S.decodeUnknown(RemovePolicyCommandSchema)(input),
      Effect.flatMap((dto) => 
        // 2. Load actor and policy in parallel
        Effect.all([
          loadActor(this.userRepository, dto.actorId),
          this.loadPolicy(dto.policyId)
        ]).pipe(
          Effect.flatMap(([actor, policy]) =>
            // 3. Load document from policy's resourceId (workspace from DTO)
            loadDocument(this.documentRepository, policy.resourceId, dto.workspaceId).pipe(
              Effect.flatMap((document) =>
                // 4. Check admin permission
                this.ensureAdmin(actor, document).pipe(
                  Effect.flatMap(() => {
                    // 5. Delete policy via repository
                    return pipe(
                      this.accessPolicyRepository.delete(policy.id),
                      Effect.map((deleted) => ({ deleted, policy, dto }))
                    )
                  })
                )
              )
            )
          )
        )
      ),
      Effect.flatMap(({ deleted, policy, dto }) =>
        // 6. Record audit event
        recordAudit(this.audit, {
          actorId: dto.actorId,
          workspaceId: dto.workspaceId,
          resourceType: "access_policy",
          resourceId: policy.id,
          action: "delete",
          outcome: "success" as const,
          metadata: {
            resourceId: policy.resourceId,
            subjectType: policy.subjectType
          }
        }).pipe(
          Effect.map(() => deleted)
        )
      ),
      Effect.mapError(mapAccessPolicyDeletionError)
    )
  }

  updatePolicyActions(
    input: UpdatePolicyActionsCommandEncoded
  ): Effect.Effect<AccessPolicyResponseEncoded, WorkflowError | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode DTO using schema validation
      S.decodeUnknown(UpdatePolicyActionsCommandSchema)(input),
      Effect.flatMap((dto) => 
        // 2. Load actor and policy in parallel
        Effect.all([
          loadActor(this.userRepository, dto.actorId),
          this.loadPolicy(dto.policyId)
        ]).pipe(
          Effect.flatMap(([actor, policy]) =>
            // 3. Load document from policy's resourceId (workspace from DTO)
            loadDocument(this.documentRepository, policy.resourceId, dto.workspaceId).pipe(
              Effect.flatMap((document) =>
                // 4. Check admin permission
                this.ensureAdmin(actor, document).pipe(
                  Effect.flatMap(() => {
                    // 5. Update actions using domain mutation methods
                    return pipe(
                      this.updateActionsOnPolicy(policy, dto.actions),
                      Effect.map((updatedPolicy) => ({ updatedPolicy, dto }))
                    )
                  })
                )
              )
            )
          )
        )
      ),
      Effect.mapError(mapAccessPolicyDomainError("update")),
      Effect.flatMap(({ updatedPolicy, dto }) =>
        // 6. Persist with repository
        this.accessPolicyRepository.save(updatedPolicy).pipe(
          Effect.mapError(mapAccessPolicyPersistenceError({
            resourceId: updatedPolicy.resourceId,
            subjectId: Option.getOrNull(updatedPolicy.subjectId),
            role: Option.getOrNull(updatedPolicy.role)
          })),
          Effect.map((saved) => ({ savedPolicy: saved, dto }))
        )
      ),
      Effect.flatMap(({ savedPolicy, dto }) =>
        // 7. Record audit event
        recordAudit(this.audit, {
          actorId: dto.actorId,
          workspaceId: dto.workspaceId,
          resourceType: "access_policy",
          resourceId: savedPolicy.id,
          action: "update",
          outcome: "success" as const,
          metadata: {
            resourceId: savedPolicy.resourceId,
            actions: savedPolicy.actions
          }
        }).pipe(
          Effect.map(() => savedPolicy)
        )
      ),
      Effect.flatMap((savedPolicy) =>
        // 8. Return serialized policy
        this.serializePolicy(savedPolicy)
      )
    )
  }

  private updateActionsOnPolicy(
    policy: AccessPolicyEntity,
    newActions: readonly PermissionAction[]
  ): Effect.Effect<AccessPolicyEntity, AccessPolicyValidationError | BusinessRuleViolationError, Clock.Clock> {
    const currentActions = policy.actions
    const actionsToAdd = newActions.filter(action => !currentActions.includes(action))
    const actionsToRemove = currentActions.filter(action => !newActions.includes(action))
    
    return pipe(
      // 1. Remove actions that are no longer in the new set
      actionsToRemove.length > 0
        ? policy.removeActions([...actionsToRemove])
        : Effect.succeed(policy),
      Effect.flatMap((policyWithoutActions) =>
        // 2. Add actions that are new
        actionsToAdd.length > 0
          ? policyWithoutActions.addActions([...actionsToAdd])
          : Effect.succeed(policyWithoutActions)
      )
    )
  }

  addPolicy(
    input: AddPolicyCommandEncoded
  ): Effect.Effect<AccessPolicyResponseEncoded, WorkflowError | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode DTO using schema validation
      S.decodeUnknown(AddPolicyCommandSchema)(input),
      Effect.flatMap((dto) =>
        // 2. Load actor and document in parallel (with workspace validation)
        Effect.all([
          loadActor(this.userRepository, dto.actorId),
          loadDocument(this.documentRepository, dto.resourceId, dto.workspaceId)
        ]).pipe(
          Effect.flatMap(([actor, document]) =>
            // 3. Validate subjectId user exists (if user-specific policy) to prevent orphan policies
            pipe(
              Option.match(dto.subjectId, {
                onNone: () => Effect.void,
                onSome: (subjectUserId) => 
                  loadActor(this.userRepository, subjectUserId).pipe(
                    Effect.asVoid,
                    Effect.mapError((error) => new WorkflowDependencyError(
                      `Cannot create policy for non-existent user: ${subjectUserId}`,
                      "UserRepository",
                      "findById",
                      { originalError: error, subjectId: subjectUserId }
                    ))
                  )
              }),
              Effect.flatMap(() =>
                // 4. Check admin permission
                this.ensureAdmin(actor, document)
              ),
              Effect.flatMap(() =>
                // 5. Generate ID and get current timestamp
                Effect.all([
                  createEntityId(AccessPolicyId, "AccessPolicyId"),
                  Clock.currentTimeMillis.pipe(Effect.map((ms) => new Date(ms)))
                ])
              ),
              Effect.flatMap(([validatedId, now]) => {
                // 6. Build SerializedAccessPolicy with validated ID and timestamp
                const policyData: Partial<SerializedAccessPolicy> = {
                  id: validatedId,
                  resourceType: dto.resourceType,
                  resourceId: dto.resourceId,
                  subjectType: dto.subjectType,
                  subjectId: optionToUndefined(dto.subjectId),
                  role: optionToUndefined(dto.role),
                  actions: dto.actions,
                  effect: dto.effect,
                  createdAt: now.toISOString(),
                  updatedAt: undefined
                }
                
                // 7. Create policy entity (will validate and fill defaults)
                return pipe(
                  AccessPolicyEntity.create(policyData as SerializedAccessPolicy),
                  Effect.map((policy) => ({ policy, dto }))
                )
              })
            )
          )
        )
      ),
      Effect.mapError(mapAccessPolicyDomainError("create")),
      Effect.flatMap(({ policy, dto }) =>
        // 9. Persist with repository
        this.accessPolicyRepository.save(policy).pipe(
          Effect.mapError(mapAccessPolicyPersistenceError({
            resourceId: policy.resourceId,
            subjectId: Option.getOrNull(policy.subjectId),
            role: Option.getOrNull(policy.role)
          })),
          Effect.map((saved) => ({ savedPolicy: saved, dto }))
        )
      ),
      Effect.flatMap(({ savedPolicy, dto }) =>
        // 10. Record audit event
        recordAudit(this.audit, {
          actorId: dto.actorId,
          workspaceId: dto.workspaceId,
          resourceType: "access_policy",
          resourceId: savedPolicy.id,
          action: "create",
          outcome: "success" as const,
          metadata: {
            resourceId: savedPolicy.resourceId,
            subjectType: savedPolicy.subjectType,
            actions: savedPolicy.actions,
            effect: savedPolicy.effect
          }
        }).pipe(
          Effect.map(() => savedPolicy)
        )
      ),
      Effect.flatMap((savedPolicy) =>
        // 11. Return serialized policy
        this.serializePolicy(savedPolicy)
      )
    )
  }

  // ===== QUERY WORKFLOWS =====

  getDocumentPolicies(
    input: GetDocumentPoliciesQueryEncoded
  ): Effect.Effect<readonly AccessPolicyResponseEncoded[], WorkflowError | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode query DTO using schema validation
      S.decodeUnknown(GetDocumentPoliciesQuerySchema)(input),
      Effect.flatMap((dto) =>
        // 2. Load actor and document to validate workspace and permissions
        Effect.all([
          loadActor(this.userRepository, dto.actorId),
          loadDocument(this.documentRepository, dto.documentId, dto.workspaceId)
        ]).pipe(
          Effect.flatMap(([actor, document]) =>
            // 3. Ensure read permission to view policies
            ensurePermission(this.accessPolicyRepository, actor, document, "read").pipe(
              Effect.flatMap(() =>
                // 4. Fetch all policies for the document
                this.getPoliciesForDocument(document.id).pipe(
                  Effect.mapError((error) => new WorkflowDependencyError(
                    `Failed to fetch policies for document: ${document.id}`,
                    "AccessPolicyRepository",
                    "findByResourceId",
                    { originalError: error }
                  ))
                )
              )
            )
          )
        )
      ),
      Effect.flatMap((entities) =>
        // 5. Serialize all policies
        Effect.forEach(
          entities,
          (entity) => this.serializePolicy(entity)
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

  getActorPolicies(
    input: GetActorPoliciesQueryEncoded
  ): Effect.Effect<readonly AccessPolicyResponseEncoded[], WorkflowError | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode query DTO using schema validation
      S.decodeUnknown(GetActorPoliciesQuerySchema)(input),
      Effect.flatMap((dto) =>
        // 2. Load actor and document to validate workspace and permissions
        Effect.all([
          loadActor(this.userRepository, dto.actorId),
          loadDocument(this.documentRepository, dto.documentId, dto.workspaceId)
        ]).pipe(
          Effect.flatMap(([actor, document]) =>
            // 3. Ensure read permission
            ensurePermission(this.accessPolicyRepository, actor, document, "read").pipe(
              Effect.flatMap(() =>
                // 4. Get policies filtered for this actor
                this.getPoliciesForActor(document.id, actor).pipe(
                  Effect.mapError((error) => new WorkflowDependencyError(
                    `Failed to fetch actor policies for document: ${document.id}`,
                    "AccessPolicyRepository",
                    "findByResourceId",
                    { originalError: error }
                  ))
                )
              )
            )
          )
        )
      ),
      Effect.flatMap((entities) =>
        // 5. Serialize all policies
        Effect.forEach(
          entities,
          (entity) => this.serializePolicy(entity)
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

  // ===== BATCH HELPERS (internal use) =====

  getPoliciesForDocument(
    documentId: DocumentId
  ): Effect.Effect<readonly AccessPolicyEntity[], WorkflowDependencyError> {
    return pipe(
      this.accessPolicyRepository.findByResourceId(documentId),
      Effect.mapError((error) => {
        if (error instanceof DatabaseError) {
          return new WorkflowDependencyError(
            `Database error fetching policies for document: ${documentId}`,
            "AccessPolicyRepository",
            "findByResourceId",
            { originalError: error }
          )
        }
        return new WorkflowDependencyError(
          `Failed to fetch policies for document: ${documentId}`,
          "AccessPolicyRepository",
          "findByResourceId",
          { originalError: error }
        )
      })
    )
  }

  getPoliciesForActor(
    documentId: DocumentId,
    actor: UserEntity
  ): Effect.Effect<readonly AccessPolicyEntity[], WorkflowDependencyError> {
    return pipe(
      this.getPoliciesForDocument(documentId),
      Effect.map((allPolicies) => filterPoliciesByActor(allPolicies, actor))
    )
  }

  // ===== SERIALIZATION HELPERS =====

  private serializePolicy(
    policy: AccessPolicyEntity
  ): Effect.Effect<AccessPolicyResponseEncoded, WorkflowDependencyError, Clock.Clock> {
    return pipe(
      policy.serialized(),
      Effect.map((serialized) => {
        // Transform to match response schema (convert null to undefined for Optional fields)
        return {
          ...serialized,
          subjectId: serialized.subjectId === null ? undefined : serialized.subjectId,
          role: serialized.role === null ? undefined : serialized.role,
          updatedAt: serialized.updatedAt === null ? undefined : serialized.updatedAt
        }
      }),
      Effect.mapError((error) => new WorkflowDependencyError(
        `Access policy serialization failed: ${error.message}`,
        "AccessPolicyEntity",
        "serialized",
        { originalError: error }
      ))
    )
  }

}

