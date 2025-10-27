import { Effect, Option, pipe } from "effect"

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

export const optionArrayToUndefined = <T>(option: Option.Option<readonly T[]>): readonly T[] | undefined => {
  return Option.match(option, {
    onNone: () => undefined,
    onSome: (arr) => arr
  })
}
import { DocumentEntity, SerializedDocument } from "@domain/document/document.entity"
import { DocumentVersionEntity, SerializedDocumentVersion } from "@domain/documentVersion/document-version.entity"
import { UserEntity } from "@domain/user/user.entity"
import { AccessPolicyEntity } from "@domain/accessPolicy/access-policy.entity"
import { DocumentRepository } from "@domain/document/document.repository"
import { DocumentVersionRepository } from "@domain/documentVersion/document-version.repository"
import { AccessPolicyRepository } from "@domain/accessPolicy/access-policy.repository"
import { UserRepository } from "@domain/user/user.repository"
import { DocumentAccessService } from "@domain/accessPolicy/document-access.service"
import { DocumentAccessPolicy } from "@domain/accessPolicy/document-access.policy"
import { DocumentNotFoundError } from "@domain/document/document.error"
import { DocumentVersionNotFoundError } from "@domain/documentVersion/document-version.error"
import { DatabaseError } from "@domain/utils/base.errors"
import { DocumentAccessDeniedError, DocumentAccessInsufficientPermissionsError, DocumentAccessContextInvalidError } from "@domain/accessPolicy/document-access.error"
import { PermissionCheckError, WorkflowDependencyError } from "@application/errors/application.errors"
import { UserId, DocumentId, DocumentVersionId, WorkspaceId } from "@domain/refined/ids"
import { Schema as S } from "effect"
import { AccessPolicySchema } from "@domain/accessPolicy/access-policy.schema"

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
  documentRepository: DocumentRepository,
  documentId: DocumentId,
  workspaceId: WorkspaceId
): Effect.Effect<DocumentEntity, DocumentNotFoundError | WorkflowDependencyError> => {
  return pipe(
    documentRepository.findById(documentId),
    Effect.mapError((error) => {
      if (error instanceof DatabaseError) {
        return new WorkflowDependencyError(
          `Database error loading document: ${documentId}`,
          "DocumentRepository",
          "findById",
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
  versionRepository: DocumentVersionRepository,
  versionId: DocumentVersionId
): Effect.Effect<DocumentVersionEntity, DocumentVersionNotFoundError | WorkflowDependencyError> => {
  return pipe(
    versionRepository.findById(versionId),
    Effect.mapError((error) => {
      if (error instanceof DatabaseError) {
        return new WorkflowDependencyError(
          `Database error loading document version: ${versionId}`,
          "DocumentVersionRepository",
          "findById",
          { originalError: error }
        )
      }
      return new DocumentVersionNotFoundError(
        `Failed to load document version: ${versionId}`,
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
        onSome: (version) => Effect.succeed(version)
      })
    )
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
  description: string | undefined;
  tags: readonly string[] | undefined;
  publishStatus: "draft" | "published" | "unpublished";
  createdAt: string;
}, WorkflowDependencyError> => {
  return pipe(
    document.serialized(),
    Effect.map((serialized) => ({
      id: serialized.id,
      ownerId: serialized.ownerId,
      title: serialized.title,
      description: serialized.description === null ? undefined : serialized.description,
      tags: serialized.tags === null ? undefined : serialized.tags,
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

/**
 * Batch load access policies for multiple documents and filter by actor
 * Returns a Map<DocumentId, AccessPolicyEntity[]> for efficient lookups
 */
export const loadBatchActorAccessContext = (
  accessPolicyRepository: AccessPolicyRepository,
  actor: UserEntity,
  documents: ReadonlyArray<DocumentEntity>
): Effect.Effect<Map<DocumentId, ReadonlyArray<AccessPolicyEntity>>, WorkflowDependencyError> => {
  if (documents.length === 0) {
    return Effect.succeed(new Map())
  }

  // Extract unique document IDs
  const documentIds = [...new Set(documents.map(doc => doc.id))]

  return pipe(
    // Fetch all policies for all documents in parallel
    Effect.forEach(
      documentIds,
      (documentId) =>
        accessPolicyRepository.findByResourceId(documentId).pipe(
          Effect.mapError((error) => {
            if (error instanceof DatabaseError) {
              return new WorkflowDependencyError(
                `Database error fetching access policies for document: ${documentId}`,
                "AccessPolicyRepository",
                "findByResourceId",
                { originalError: error }
              )
            }
            return new WorkflowDependencyError(
              `Failed to fetch access policies for document: ${documentId}`,
              "AccessPolicyRepository",
              "findByResourceId",
              { originalError: error }
            )
          }),
          Effect.map((policies) => ({ documentId, policies }))
        ),
      { concurrency: "unbounded" }
    ),
    Effect.map((policyResults) => {
      // Build Map<DocumentId, AccessPolicyEntity[]> with filtered policies
      const policyMap = new Map<DocumentId, ReadonlyArray<AccessPolicyEntity>>()
      
      for (const { documentId, policies } of policyResults) {
        policyMap.set(documentId, filterPoliciesByActor(policies, actor))
      }
      
      return policyMap
    })
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
    // Encode policies to build the context
    Effect.forEach(policies, (p) => S.encode(AccessPolicySchema)(p as unknown as any)),
    Effect.mapError((e) => new WorkflowDependencyError(
      `Failed to encode policies for permission level calculation`,
      "AccessPolicyEntity",
      "encode",
      { originalError: e }
    )),
    Effect.flatMap((encodedPolicies) => {
      const context = {
        userId: actor.id,
        roles: actor.roles,
        documentId: document.id,
        documentOwnerId: document.ownerId,
        userPolicies: encodedPolicies.map((ep: any) => ({
          subjectType: ep.subjectType,
          subjectId: ep.subjectId && ep.subjectId._tag === "Some" ? ep.subjectId.value : undefined,
          role: ep.role && ep.role._tag === "Some" ? ep.role.value : undefined,
          actions: ep.actions
        }))
      }
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
      { concurrency: "unbounded" }
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

