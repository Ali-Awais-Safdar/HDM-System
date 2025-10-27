import { Schema as S } from "effect"
import { DocumentId, DocumentVersionId, UserId, WorkspaceId } from "@domain/refined/ids"
import { DocumentVersionFields } from "@domain/documentVersion/document-version.schema"
import { PageNumber, VersionPageSize } from "@domain/utils/pagination"

export const GetDocumentVersionQuerySchema = S.Struct({
  workspaceId: WorkspaceId,
  versionId: DocumentVersionId,
  actorId: UserId
})
export type GetDocumentVersionQuery = S.Schema.Type<typeof GetDocumentVersionQuerySchema>
export type GetDocumentVersionQueryEncoded = S.Schema.Encoded<typeof GetDocumentVersionQuerySchema>

export const decodeGetDocumentVersionQuery = S.decodeUnknown(GetDocumentVersionQuerySchema)

export const ListDocumentVersionsQuerySchema = S.Struct({
  workspaceId: WorkspaceId,
  documentId: DocumentVersionFields.documentId,
  actorId: UserId,
  pageNum: S.optional(PageNumber),
  pageSize: S.optional(VersionPageSize)
})
export type ListDocumentVersionsQuery = S.Schema.Type<typeof ListDocumentVersionsQuerySchema>
export type ListDocumentVersionsQueryEncoded = S.Schema.Encoded<typeof ListDocumentVersionsQuerySchema>

export const decodeListDocumentVersionsQuery = S.decodeUnknown(ListDocumentVersionsQuerySchema)

export const GetLatestDocumentVersionQuerySchema = S.Struct({
  workspaceId: WorkspaceId,
  documentId: DocumentId,
  actorId: UserId
})
export type GetLatestDocumentVersionQuery = S.Schema.Type<typeof GetLatestDocumentVersionQuerySchema>
export type GetLatestDocumentVersionQueryEncoded = S.Schema.Encoded<typeof GetLatestDocumentVersionQuerySchema>

export const decodeGetLatestDocumentVersionQuery = S.decodeUnknown(GetLatestDocumentVersionQuerySchema)

export const DocumentVersionQueryDTO = {
  // Query Schemas
  GetDocumentVersionQuerySchema,
  ListDocumentVersionsQuerySchema,
  GetLatestDocumentVersionQuerySchema,
  
  // Decoders
  decodeGetDocumentVersionQuery,
  decodeListDocumentVersionsQuery,
  decodeGetLatestDocumentVersionQuery
} as const
