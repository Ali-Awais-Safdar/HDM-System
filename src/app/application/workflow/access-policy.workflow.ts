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
  RemovePolicyCommandEncoded
} from "@application/dto/accessPolicy/commands.dto"
import {
  AccessPolicyResponseEncoded
} from "@application/dto/accessPolicy/responses.dto"

// Application workflow helpers
import {
  loadActor,
  loadDocument,
  ensurePermission,
  filterPoliciesByActor,
  mapAccessPolicyPersistenceError,
  mapAccessPolicyDomainError,
  mapAccessPolicyDeletionError,
  optionToUndefined
} from "@application/workflow/helpers"

// Refined types
import { AccessPolicyId, DocumentId } from "@domain/refined/ids"

// DI tokens
import { TOKENS } from "@infra/di/container"

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
    private readonly userRepository: UserRepository
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
                    return this.accessPolicyRepository.delete(policy.id)
                  })
                )
              )
            )
          )
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
                    return this.updateActionsOnPolicy(policy, dto.actions)
                  })
                )
              )
            )
          )
        )
      ),
      Effect.mapError(mapAccessPolicyDomainError("update")),
      Effect.flatMap((updatedPolicy) =>
        // 6. Persist with repository
        this.accessPolicyRepository.save(updatedPolicy).pipe(
          Effect.mapError(mapAccessPolicyPersistenceError({
            resourceId: updatedPolicy.resourceId,
            subjectId: Option.getOrNull(updatedPolicy.subjectId),
            role: Option.getOrNull(updatedPolicy.role)
          }))
        )
      ),
      Effect.flatMap((savedPolicy) =>
        // 7. Return serialized policy
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
                  Effect.sync(() => crypto.randomUUID()),
                  Clock.currentTimeMillis.pipe(Effect.map((ms) => new Date(ms)))
                ])
              ),
              Effect.flatMap(([generatedIdString, now]) =>
                // 6. Validate generated UUID with schema-first boundary rule
                S.decodeUnknown(AccessPolicyId)(generatedIdString).pipe(
                  Effect.mapError((error) => new WorkflowDependencyError(
                    `Failed to validate generated policy ID: ${error.message}`,
                    "AccessPolicyId",
                    "validation",
                    { originalError: error, generatedId: generatedIdString }
                  )),
                  Effect.flatMap((validatedId) => {
                    // 7. Build SerializedAccessPolicy with validated ID and timestamp
                    // Convert DTO Option fields (subjectId/role) to Option types as domain expects
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
                    
                    // 8. Create policy entity (will validate and fill defaults)
                    return AccessPolicyEntity.create(policyData as SerializedAccessPolicy)
                  })
                )
              )
            )
          )
        )
      ),
      Effect.mapError(mapAccessPolicyDomainError("create")),
      Effect.flatMap((policy) =>
        // 9. Persist with repository
        this.accessPolicyRepository.save(policy).pipe(
          Effect.mapError(mapAccessPolicyPersistenceError({
            resourceId: policy.resourceId,
            subjectId: Option.getOrNull(policy.subjectId),
            role: Option.getOrNull(policy.role)
          }))
        )
      ),
      Effect.flatMap((savedPolicy) =>
        // 10. Return serialized policy
        this.serializePolicy(savedPolicy)
      )
    )
  }

  // ===== BATCH HELPERS =====

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
      )),
      Effect.provideService(Clock.Clock, Clock.make())
    )
  }

}

