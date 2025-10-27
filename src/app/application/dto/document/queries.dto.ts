import { Schema as S } from "effect"
import { DocumentId, UserId, WorkspaceId } from "@domain/refined/ids"
import { DocumentFields } from "@domain/document/document.schema"
import { PermissionLevelSchema, AccessPolicyFields } from "@domain/accessPolicy/access-policy.schema"
import { PageNumber, DocumentPageSize } from "@domain/utils/pagination"

export const GetDocumentQuerySchema = S.Struct({
  workspaceId: WorkspaceId,
  documentId: DocumentId,
  actorId: UserId
})
export type GetDocumentQuery = S.Schema.Type<typeof GetDocumentQuerySchema>
export type GetDocumentQueryEncoded = S.Schema.Encoded<typeof GetDocumentQuerySchema>

export const decodeGetDocumentQuery = S.decodeUnknown(GetDocumentQuerySchema)

export const ListDocumentsQuerySchema = S.Struct({
  workspaceId: WorkspaceId,
  actorId: UserId,
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
export type ListDocumentsQuery = S.Schema.Type<typeof ListDocumentsQuerySchema>
export type ListDocumentsQueryEncoded = S.Schema.Encoded<typeof ListDocumentsQuerySchema>

export const decodeListDocumentsQuery = S.decodeUnknown(ListDocumentsQuerySchema)

export const GetDocumentAccessQuerySchema = S.Struct({
  workspaceId: WorkspaceId,
  documentId: DocumentId,
  actorId: UserId,
  requiredPermission: S.optional(PermissionLevelSchema)
})
export type GetDocumentAccessQuery = S.Schema.Type<typeof GetDocumentAccessQuerySchema>
export type GetDocumentAccessQueryEncoded = S.Schema.Encoded<typeof GetDocumentAccessQuerySchema>

export const decodeGetDocumentAccessQuery = S.decodeUnknown(GetDocumentAccessQuerySchema)

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
export type DocumentAccessResponse = S.Schema.Type<typeof DocumentAccessResponseSchema>
export type DocumentAccessResponseEncoded = S.Schema.Encoded<typeof DocumentAccessResponseSchema>

export const decodeDocumentAccessResponse = S.decodeUnknown(DocumentAccessResponseSchema)

export const DocumentQueryDTO = {
  // Query Schemas
  GetDocumentQuerySchema,
  ListDocumentsQuerySchema,
  GetDocumentAccessQuerySchema,
  
  // Response Schemas
  DocumentAccessResponseSchema,
  
  // Query Decoders
  decodeGetDocumentQuery,
  decodeListDocumentsQuery,
  decodeGetDocumentAccessQuery,
  
  // Response Decoders
  decodeDocumentAccessResponse
} as const
