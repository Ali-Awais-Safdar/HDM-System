import { Schema as S } from "effect"
import { DocumentVersionId, UserId, WorkspaceId } from "@domain/refined/ids"
import { DocumentVersionFields } from "@domain/documentVersion/document-version.schema"
import { PageNumber, VersionPageSize } from "@domain/utils/pagination"

// ===== INPUT SCHEMAS (Client-supplied, no auth/workspace fields) =====

export const GetDocumentVersionInputSchema = S.Struct({
  versionId: DocumentVersionId
})

export const ListDocumentVersionsInputSchema = S.Struct({
  documentId: DocumentVersionFields.documentId,
  pageNum: S.optional(PageNumber),
  pageSize: S.optional(VersionPageSize)
})

export const GetLatestDocumentVersionInputSchema = S.Struct({
  documentId: DocumentVersionFields.documentId
})

// ===== QUERY SCHEMAS (Internal, with injected auth/workspace fields) =====

export const GetDocumentVersionQuerySchema = GetDocumentVersionInputSchema.pipe(
  S.extend(S.Struct({
    workspaceId: WorkspaceId,
    actorId: UserId
  }))
)
export type GetDocumentVersionQuery = S.Schema.Type<typeof GetDocumentVersionQuerySchema>
export type GetDocumentVersionQueryEncoded = S.Schema.Encoded<typeof GetDocumentVersionQuerySchema>


export const ListDocumentVersionsQuerySchema = ListDocumentVersionsInputSchema.pipe(
  S.extend(S.Struct({
    workspaceId: WorkspaceId,
    actorId: UserId
  }))
)
export type ListDocumentVersionsQuery = S.Schema.Type<typeof ListDocumentVersionsQuerySchema>
export type ListDocumentVersionsQueryEncoded = S.Schema.Encoded<typeof ListDocumentVersionsQuerySchema>


export const GetLatestDocumentVersionQuerySchema = GetLatestDocumentVersionInputSchema.pipe(
  S.extend(S.Struct({
    workspaceId: WorkspaceId,
    actorId: UserId
  }))
)
export type GetLatestDocumentVersionQuery = S.Schema.Type<typeof GetLatestDocumentVersionQuerySchema>
export type GetLatestDocumentVersionQueryEncoded = S.Schema.Encoded<typeof GetLatestDocumentVersionQuerySchema>


