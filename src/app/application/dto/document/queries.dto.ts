import { Schema as S } from "effect"
import { DocumentId, UserId, WorkspaceId } from "@domain/refined/ids"
import { DocumentFields } from "@domain/document/document.schema"
import { PermissionLevelSchema, AccessPolicyFields } from "@domain/accessPolicy/access-policy.schema"
import { PageNumber, DocumentPageSize } from "@domain/utils/pagination"

// ===== INPUT SCHEMAS (Client-supplied, no auth/workspace fields) =====

export const GetDocumentInputSchema = S.Struct({
  documentId: DocumentId
})

export const ListDocumentsInputSchema = S.Struct({
  ownerId: S.optional(DocumentFields.ownerId),
  tags: DocumentFields.tags,
  search: S.optional(S.String.pipe(
    S.transform(S.String, {
      decode: (input) => input.trim(),
      encode: (value) => value
    })
  )),
  pageNum: S.optional(PageNumber),
  pageSize: S.optional(DocumentPageSize)
})

export const GetDocumentAccessInputSchema = S.Struct({
  documentId: DocumentId,
  requiredPermission: S.optional(PermissionLevelSchema)
})

// ===== QUERY SCHEMAS (Internal, with injected auth/workspace fields) =====

export const GetDocumentQuerySchema = GetDocumentInputSchema.pipe(
  S.extend(S.Struct({
    workspaceId: WorkspaceId,
    actorId: UserId
  }))
)
export type GetDocumentQuery = S.Schema.Type<typeof GetDocumentQuerySchema>
export type GetDocumentQueryEncoded = S.Schema.Encoded<typeof GetDocumentQuerySchema>


export const ListDocumentsQuerySchema = ListDocumentsInputSchema.pipe(
  S.extend(S.Struct({
    workspaceId: WorkspaceId,
    actorId: UserId
  }))
)
export type ListDocumentsQuery = S.Schema.Type<typeof ListDocumentsQuerySchema>
export type ListDocumentsQueryEncoded = S.Schema.Encoded<typeof ListDocumentsQuerySchema>


export const GetDocumentAccessQuerySchema = GetDocumentAccessInputSchema.pipe(
  S.extend(S.Struct({
    workspaceId: WorkspaceId,
    actorId: UserId
  }))
)
export type GetDocumentAccessQuery = S.Schema.Type<typeof GetDocumentAccessQuerySchema>
export type GetDocumentAccessQueryEncoded = S.Schema.Encoded<typeof GetDocumentAccessQuerySchema>


export const DocumentAccessResponseSchema = S.Struct({
  hasAccess: S.Boolean,
  permissionLevel: PermissionLevelSchema,
  policies: S.Array(S.Struct({
    id: S.String,
    resourceId: AccessPolicyFields.resourceId,
    subjectType: AccessPolicyFields.subjectType,
    subjectId: AccessPolicyFields.subjectId,
    role: AccessPolicyFields.role,
    actions: AccessPolicyFields.actions,
    effect: AccessPolicyFields.effect
  }))
})
export type DocumentAccessResponseEncoded = S.Schema.Encoded<typeof DocumentAccessResponseSchema>


