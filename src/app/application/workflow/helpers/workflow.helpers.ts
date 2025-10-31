import { Effect, Option, pipe, Schema as S } from "effect"
import type { AuditPort, AuditEvent } from "@application/services/ports/audit.port"
import type { LoggerPort } from "@application/services/ports/logger.port"
import { DocumentEntity, SerializedDocument } from "@domain/document/document.entity"
import { DocumentVersionEntity, SerializedDocumentVersion } from "@domain/documentVersion/document-version.entity"
import { UserEntity } from "@domain/user/user.entity"
import { AccessPolicyEntity } from "@domain/accessPolicy/access-policy.entity"
import { DocumentAggregateRepository } from "@domain/document/document-aggregate.repository"
import { AccessPolicyRepository } from "@domain/accessPolicy/access-policy.repository"
import { UserRepository } from "@domain/user/user.repository"
import { DocumentAccessService } from "@domain/accessPolicy/document-access.service"
import { DocumentAccessPolicy } from "@domain/accessPolicy/document-access.policy"
import type { DocumentAccessContext } from "@domain/accessPolicy/document-access.policy"
import { DocumentNotFoundError } from "@domain/document/document.error"
import { DocumentVersionNotFoundError } from "@domain/documentVersion/document-version.error"
import { DatabaseError } from "@domain/utils/base.errors"
import { DocumentAccessDeniedError, DocumentAccessInsufficientPermissionsError, DocumentAccessContextInvalidError } from "@domain/accessPolicy/document-access.error"
import { PermissionCheckError, WorkflowDependencyError } from "@application/errors/application.errors"
import { UserId, DocumentId, DocumentVersionId, WorkspaceId } from "@domain/refined/ids"

// ===== ID GENERATION HELPERS =====

export const createEntityId = <A, I, R = never>(
  schema: S.Schema<A, I, R>,
  label: string
): Effect.Effect<A, WorkflowDependencyError, R> => {
  return pipe(
    Effect.sync(() => crypto.randomUUID()),
    Effect.flatMap((generatedIdString) =>
      S.decodeUnknown(schema)(generatedIdString).pipe(
        Effect.mapError((error) => new WorkflowDependencyError(
          `Failed to validate generated ${label}: ${error.message}`,
          label,
          "validation",
          { originalError: error, generatedId: generatedIdString }
        ))
      )
    )
  )
}

// ===== OPTION CONVERSION HELPERS =====

export const optionToUndefined = <T>(option: Option.Option<T>): T | undefined => {
  return Option.match(option, {
    onNone: () => undefined,
    onSome: (value) => value
  })
}

export const optionToNull = <T>(option: Option.Option<T>): T | null => {
  return Option.match(option, {
    onNone: () => null,
    onSome: (value) => value
  })
}

export const filterUndefined = <T>(option: Option.Option<T | undefined>): Option.Option<T> => {
  return Option.match(option, {
    onNone: () => Option.none<T>(),
    onSome: (value) => value !== undefined ? Option.some(value) : Option.none<T>()
  })
}

// ===== ACTOR LOADING =====

export const loadActor = (
  userRepository: UserRepository,
  userId: UserId
): Effect.Effect<UserEntity, PermissionCheckError> => {
  return pipe(
    userRepository.findById(userId),
    Effect.mapError((error) => new PermissionCheckError(
      `Failed to load user: ${userId}`,
      "",
      userId,
      "user_lookup",
      { originalError: error }
    )),
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(new PermissionCheckError(
          `User not found: ${userId}`,
          "",
          userId,
          "user_lookup"
        )),
        onSome: (user) => Effect.succeed(user)
      })
    )
  )
}

// ===== DOCUMENT LOADING =====

export const loadDocument = (
  aggregateRepository: DocumentAggregateRepository,
  documentId: DocumentId,
  workspaceId: WorkspaceId
): Effect.Effect<DocumentEntity, DocumentNotFoundError | WorkflowDependencyError> => {
  return pipe(
    aggregateRepository.findDocumentById(documentId),
    Effect.mapError((error) => {
      if (error instanceof DatabaseError) {
        return new WorkflowDependencyError(
          `Database error loading document: ${documentId}`,
          "DocumentAggregateRepository",
          "findDocumentById",
          { originalError: error }
        )
      }
      return new DocumentNotFoundError(
        `Failed to load document: ${documentId}`,
        "id",
        documentId,
        { originalError: error }
      )
    }),
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(new DocumentNotFoundError(
          `Document not found: ${documentId}`,
          "id",
          documentId
        )),
        onSome: (document) => {
          // Validate workspace isolation
          if (document.workspaceId !== workspaceId) {
            return Effect.fail(new DocumentNotFoundError(
              `Document not found in workspace: ${documentId}`,
              "id",
              documentId,
              { 
                reason: "workspace_mismatch",
                expectedWorkspace: workspaceId,
                actualWorkspace: document.workspaceId
              }
            ))
          }
          return Effect.succeed(document)
        }
      })
    )
  )
}

// ===== DOCUMENT VERSION LOADING =====

export const loadDocumentVersion = (
  aggregateRepository: DocumentAggregateRepository,
  versionId: DocumentVersionId
): Effect.Effect<DocumentVersionEntity, DocumentVersionNotFoundError | WorkflowDependencyError> => {
  return pipe(
    // 1. Find document ID by version ID (lightweight lookup)
    aggregateRepository.findDocumentIdByVersionId(versionId).pipe(
    Effect.mapError((error) => {
      if (error instanceof DatabaseError) {
        return new WorkflowDependencyError(
            `Database error finding document by version: ${versionId}`,
          "DocumentAggregateRepository",
            "findDocumentIdByVersionId",
          { originalError: error }
        )
      }
      return new DocumentVersionNotFoundError(
          `Version not found: ${versionId}`,
        "id",
        versionId,
        { originalError: error }
      )
    }),
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(new DocumentVersionNotFoundError(
          `Document version not found: ${versionId}`,
            "id",
            versionId
          )),
          onSome: (documentId) => Effect.succeed(documentId)
        })
      )
    ),
    // 2. Load aggregate to access versions
    Effect.flatMap((documentId) =>
      aggregateRepository.loadById(documentId).pipe(
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
            onNone: () => Effect.fail(new WorkflowDependencyError(
              `Document aggregate not found: ${documentId}`,
              "DocumentAggregateRepository",
              "loadById",
              {}
            )),
            onSome: (aggregate) => Effect.succeed(aggregate)
          })
        )
      )
    ),
    // 3. Get version by ID from aggregate
    Effect.flatMap((aggregate) => {
      const versionOption = aggregate.getVersionById(versionId)
      return Option.match(versionOption, {
        onNone: () => Effect.fail(new DocumentVersionNotFoundError(
          `Document version not found in aggregate: ${versionId}`,
          "id",
          versionId
        )),
        onSome: (version) => Effect.succeed(version)
      })
    })
  )
}

// ===== SERIALIZATION =====

export const serializeDocument = (
  document: DocumentEntity
): Effect.Effect<SerializedDocument, WorkflowDependencyError> => {
  return pipe(
    document.serialized(),
    Effect.mapError((error) => new WorkflowDependencyError(
      `Document serialization failed: ${error.message}`,
      "DocumentEntity",
      "serialized",
      { originalError: error }
    ))
  )
}

export const serializeDocumentSummary = (
  document: DocumentEntity
): Effect.Effect<{
  id: string;
  ownerId: string;
  title: string;
  description: string | null | undefined;
  tags: readonly string[];
  publishStatus: "draft" | "published" | "unpublished";
  createdAt: string;
}, WorkflowDependencyError> => {
  return pipe(
    document.serialized(),
    Effect.map((serialized) => ({
      id: serialized.id,
      ownerId: serialized.ownerId,
      title: serialized.title,
      description: serialized.description,
      tags: serialized.tags,
      publishStatus: serialized.publishStatus,
      createdAt: serialized.createdAt
    })),
    Effect.mapError((error) => new WorkflowDependencyError(
      `Document summary serialization failed: ${error.message}`,
      "DocumentEntity",
      "serialized",
      { originalError: error }
    ))
  )
}

export const serializeDocumentVersion = (
  version: DocumentVersionEntity
): Effect.Effect<SerializedDocumentVersion, WorkflowDependencyError> => {
  return pipe(
    version.serialized(),
    Effect.mapError((error) => new WorkflowDependencyError(
      `Document version serialization failed: ${error.message}`,
      "DocumentVersionEntity",
      "serialized",
      { originalError: error }
    ))
  )
}

export const ensureSelfOrAdmin = (
  actor: UserEntity,
  targetUser: UserEntity
): Effect.Effect<void, PermissionCheckError> => {
  const isSameUser = targetUser.id === actor.id
  const isAdmin = actor.isAdmin()

  if (!isSameUser && !isAdmin) {
    return Effect.fail(new PermissionCheckError(
      `Insufficient permissions to perform operation on user ${targetUser.id}. User must be self or have admin role.`,
      targetUser.id,
      actor.id,
      "authorization"
    ))
  }

  return Effect.void
}

export const serializeUserSummary = (
  user: UserEntity
): Effect.Effect<{
  id: string;
  email: string;
  roles: readonly string[];
  workspaceId: string | null | undefined;
  createdAt: string;
  updatedAt: string | undefined;
}, WorkflowDependencyError> => {
  return pipe(
    user.serialized(),
    Effect.map((serialized) => ({
      id: serialized.id,
      email: serialized.email,
      roles: serialized.roles,
      workspaceId: serialized.workspaceId === null ? undefined : serialized.workspaceId,
      createdAt: serialized.createdAt,
      updatedAt: serialized.updatedAt === null ? undefined : serialized.updatedAt
    })),
    Effect.mapError((error) => new WorkflowDependencyError(
      `User summary serialization failed: ${error.message}`,
      "UserEntity",
      "serialized",
      { originalError: error }
    ))
  )
}

// ===== ACCESS POLICY FILTERING =====

export const filterPoliciesByActor = (
  policies: ReadonlyArray<AccessPolicyEntity>,
  actor: UserEntity
): ReadonlyArray<AccessPolicyEntity> => {
  // Split into user-specific and role-based policies
  const userSpecificPolicies = policies.filter((policy) =>
    policy.subjectType === "user" &&
    Option.match(policy.subjectId, {
      onNone: () => false,
      onSome: (subjectId) => subjectId === actor.id
    })
  )

  const roleBasedPolicies = policies.filter((policy) =>
    policy.subjectType === "role" &&
    Option.match(policy.role, {
      onNone: () => false,
      onSome: (policyRole) => actor.roles.includes(policyRole)
    })
  )

  // Combine both types of policies
  return [...userSpecificPolicies, ...roleBasedPolicies]
}

export const loadActorAccessContext = (
  accessPolicyRepository: AccessPolicyRepository,
  actor: UserEntity,
  document: DocumentEntity
): Effect.Effect<ReadonlyArray<AccessPolicyEntity>, WorkflowDependencyError> => {
  return pipe(
    accessPolicyRepository.findByResourceId(document.id),
    Effect.mapError((error) => {
      if (error instanceof DatabaseError) {
        return new WorkflowDependencyError(
          `Database error fetching access policies for document: ${document.id}`,
          "AccessPolicyRepository",
          "findByResourceId",
          { originalError: error }
        )
      }
      return new WorkflowDependencyError(
        `Failed to fetch access policies for document: ${document.id}`,
        "AccessPolicyRepository",
        "findByResourceId",
        { originalError: error }
      )
    }),
    Effect.map((allPolicies) => filterPoliciesByActor(allPolicies, actor))
  )
}

// ===== PERMISSION CHECKING =====

export const ensurePermission = (
  accessPolicyRepository: AccessPolicyRepository,
  actor: UserEntity,
  document: DocumentEntity,
  level: "read" | "write" | "admin"
): Effect.Effect<void, PermissionCheckError | WorkflowDependencyError> => {
  return pipe(
    // Load all relevant policies (user-specific and role-based)
    loadActorAccessContext(accessPolicyRepository, actor, document),
    Effect.flatMap((policies) =>
      // Check access using DocumentAccessService
      DocumentAccessService.canAccessDocument(actor, document, policies, level)
    ),
    Effect.mapError((error) => {
      // Map access service errors to PermissionCheckError
      if (error instanceof DocumentAccessDeniedError || error instanceof DocumentAccessInsufficientPermissionsError) {
        return new PermissionCheckError(
          `Access denied for ${level} operation: ${error.message}`,
          document.id,
          actor.id,
          level,
          { originalError: error }
        )
      }
      if (error instanceof DocumentAccessContextInvalidError) {
        return new PermissionCheckError(
          `Invalid access context for ${level} operation: ${error.message}`,
          document.id,
          actor.id,
          level,
          { originalError: error }
        )
      }
      if (error instanceof WorkflowDependencyError) {
        return error
      }
      return new PermissionCheckError(
        `Access denied for ${level} operation`,
        document.id,
        actor.id,
        level,
        { originalError: error }
      )
    }),
    // DocumentAccessService.canAccessDocument already fails on denial, so we just map to void
    Effect.as(undefined)
  )
}

export const ensureRead = (
  accessPolicyRepository: AccessPolicyRepository,
  actor: UserEntity,
  document: DocumentEntity
): Effect.Effect<void, PermissionCheckError | WorkflowDependencyError> => {
  return ensurePermission(accessPolicyRepository, actor, document, "read")
}

export const getEffectivePermissionLevel = (
  actor: UserEntity,
  document: DocumentEntity,
  policies: ReadonlyArray<AccessPolicyEntity>
): Effect.Effect<"read" | "write" | "admin" | null, WorkflowDependencyError> => {
  return pipe(
    Effect.forEach(policies, (p) => p.serialized()),
    Effect.mapError((e) => new WorkflowDependencyError(
      `Failed to encode policies for permission level calculation`,
      "AccessPolicyEntity",
      "encode",
      { originalError: e }
    )),
    Effect.flatMap((encodedPolicies) => {
      const context: DocumentAccessContext = DocumentAccessService.buildContext(actor, document, encodedPolicies)
      return DocumentAccessPolicy.getEffectivePermissionLevel(context)
    }),
    Effect.mapError((e) => new WorkflowDependencyError(
      `Failed to compute effective permission level`,
      "DocumentAccessPolicy",
      "getEffectivePermissionLevel",
      { originalError: e }
    ))
  )
}

// ===== PAGINATION HELPERS =====

export const applyPagination = <TEntity, TSerialized>(
  entities: readonly TEntity[],
  total: number,
  pageNum: number,
  pageSize: number,
  serializeFn: (entity: TEntity) => Effect.Effect<TSerialized, WorkflowDependencyError>
): Effect.Effect<{ data: TSerialized[]; total: number; pageNum: number; pageSize: number; totalPages: number }, WorkflowDependencyError> => {
  const totalPages = Math.ceil(total / pageSize)
  
  // Calculate pagination slice
  const startIndex = (pageNum - 1) * pageSize
  const endIndex = startIndex + pageSize
  const paginatedEntities = entities.slice(startIndex, endIndex)
  
  return pipe(
    Effect.forEach(
      paginatedEntities,
      serializeFn,
      { concurrency: 16 }
    ),
    Effect.map((serializedData) => ({
      data: serializedData,
      total,
      pageNum,
      pageSize,
      totalPages
    }))
  )
}

// ===== AUDIT HELPER =====

export const recordAudit = (
  auditPort: AuditPort,
  event: AuditEvent,
  logger?: LoggerPort
): Effect.Effect<void, never> => {
  return pipe(
    auditPort.record(event),
    Effect.catchAll((error) => {
      // Log warning if logger is available
      if (logger) {
        logger.warn("Failed to record audit event", {
          error: error instanceof Error ? error.message : String(error),
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          action: event.action
        })
      }
      return Effect.void
    })
  )
}

