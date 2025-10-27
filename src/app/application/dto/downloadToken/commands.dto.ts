import { Schema as S } from "effect"
import { DownloadTokenId, UserId, WorkspaceId } from "@domain/refined/ids"
import { DownloadTokenStruct, DownloadTokenFields } from "@domain/downloadToken/download-token.schema"
import { DownloadTokenString } from "@domain/downloadToken/download-token.string.vo"
import { PageNumber, VersionPageSize } from "@domain/utils/pagination"

export const CreateDownloadTokenCommandSchema = DownloadTokenStruct.pick("documentId", "issuedTo", "expiresAt")
  .pipe(S.extend(S.Struct({ workspaceId: WorkspaceId, actorId: UserId })))
export type CreateDownloadTokenCommand = S.Schema.Type<typeof CreateDownloadTokenCommandSchema>
export type CreateDownloadTokenCommandEncoded = S.Schema.Encoded<typeof CreateDownloadTokenCommandSchema>

export const ValidateDownloadTokenQuerySchema = S.Struct({
  workspaceId: WorkspaceId,
  token: DownloadTokenString,
  actorId: UserId
})
export type ValidateDownloadTokenQuery = S.Schema.Type<typeof ValidateDownloadTokenQuerySchema>
export type ValidateDownloadTokenQueryEncoded = S.Schema.Encoded<typeof ValidateDownloadTokenQuerySchema>

export const ListDownloadTokensQuerySchema = S.Struct({
  workspaceId: WorkspaceId,
  documentId: DownloadTokenFields.documentId,
  actorId: UserId,
  pageNum: S.optional(PageNumber),
  pageSize: S.optional(VersionPageSize)
})
export type ListDownloadTokensQuery = S.Schema.Type<typeof ListDownloadTokensQuerySchema>
export type ListDownloadTokensQueryEncoded = S.Schema.Encoded<typeof ListDownloadTokensQuerySchema>

export const RevokeDownloadTokenCommandSchema = S.Struct({
  workspaceId: WorkspaceId,
  tokenId: DownloadTokenId,
  actorId: UserId
})
export type RevokeDownloadTokenCommand = S.Schema.Type<typeof RevokeDownloadTokenCommandSchema>
export type RevokeDownloadTokenCommandEncoded = S.Schema.Encoded<typeof RevokeDownloadTokenCommandSchema>

export const UseDownloadTokenCommandSchema = S.Struct({
  workspaceId: WorkspaceId,
  token: DownloadTokenString,
  actorId: UserId
})
export type UseDownloadTokenCommand = S.Schema.Type<typeof UseDownloadTokenCommandSchema>
export type UseDownloadTokenCommandEncoded = S.Schema.Encoded<typeof UseDownloadTokenCommandSchema>

export const DownloadTokenDTO = {
  // Schemas
  CreateDownloadTokenCommandSchema,
  ValidateDownloadTokenQuerySchema,
  ListDownloadTokensQuerySchema,
  RevokeDownloadTokenCommandSchema,
  UseDownloadTokenCommandSchema
} as const
