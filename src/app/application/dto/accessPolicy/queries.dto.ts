import { Schema as S } from "effect"
import { DocumentId, UserId, WorkspaceId } from "@domain/refined/ids"

// ===== INPUT SCHEMAS (Client-supplied, no auth/workspace fields) =====

export const GetDocumentPoliciesInputSchema = S.Struct({
  documentId: DocumentId
})

export const GetActorPoliciesInputSchema = S.Struct({
  documentId: DocumentId
})

// ===== QUERY SCHEMAS (Internal, with injected auth/workspace fields) =====

export const GetDocumentPoliciesQuerySchema = S.Struct({
  workspaceId: WorkspaceId,
  documentId: DocumentId,
  actorId: UserId
})
export type GetDocumentPoliciesQueryEncoded = S.Schema.Encoded<typeof GetDocumentPoliciesQuerySchema>

export const GetActorPoliciesQuerySchema = S.Struct({
  workspaceId: WorkspaceId,
  documentId: DocumentId,
  actorId: UserId
})
export type GetActorPoliciesQueryEncoded = S.Schema.Encoded<typeof GetActorPoliciesQuerySchema>

