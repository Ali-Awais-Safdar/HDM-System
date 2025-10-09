import { Schema as S } from "effect"
import { Uuid } from "@domain/refined/uuid"

const makeIdSchema = <const Brand extends string>(brand: Brand) =>
  Uuid.pipe(S.brand(brand))

export const DocumentId = makeIdSchema("DocumentId")
export type DocumentId = S.Schema.Type<typeof DocumentId>

export const DocumentVersionId = makeIdSchema("DocumentVersionId")
export type DocumentVersionId = S.Schema.Type<typeof DocumentVersionId>

export const UserId = makeIdSchema("UserId")
export type UserId = S.Schema.Type<typeof UserId>

export const DownloadTokenId = makeIdSchema("DownloadTokenId")
export type DownloadTokenId = S.Schema.Type<typeof DownloadTokenId>

export const WorkspaceId = makeIdSchema("WorkspaceId")
export type WorkspaceId = S.Schema.Type<typeof WorkspaceId>

export const AccessPolicyId = makeIdSchema("AccessPolicyId")
export type AccessPolicyId = S.Schema.Type<typeof AccessPolicyId>

export const makeDocumentId = (input: unknown) =>
  S.decodeUnknown(DocumentId)(input)
export const makeDocumentVersionId = (input: unknown) =>
  S.decodeUnknown(DocumentVersionId)(input)
export const makeUserId = (input: unknown) => S.decodeUnknown(UserId)(input)
export const makeDownloadTokenId = (input: unknown) =>
  S.decodeUnknown(DownloadTokenId)(input)
export const makeWorkspaceId = (input: unknown) =>
  S.decodeUnknown(WorkspaceId)(input)
export const makeAccessPolicyId = (input: unknown) =>
  S.decodeUnknown(AccessPolicyId)(input)

export const makeDocumentIdSync = (input: unknown) =>
  S.decodeUnknownSync(DocumentId)(input)
export const makeDocumentVersionIdSync = (input: unknown) =>
  S.decodeUnknownSync(DocumentVersionId)(input)
export const makeUserIdSync = (input: unknown) =>
  S.decodeUnknownSync(UserId)(input)
export const makeDownloadTokenIdSync = (input: unknown) =>
  S.decodeUnknownSync(DownloadTokenId)(input)
export const makeWorkspaceIdSync = (input: unknown) =>
  S.decodeUnknownSync(WorkspaceId)(input)
export const makeAccessPolicyIdSync = (input: unknown) =>
  S.decodeUnknownSync(AccessPolicyId)(input)
