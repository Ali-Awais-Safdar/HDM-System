import { Schema as S } from "effect"

// Conservative UUID check; you can swap with stricter v4/v7 if needed
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const UuidString = S.String.pipe(
  S.filter((s) => UUID_RE.test(s), { message: () => "Invalid UUID" }),
  S.brand("UuidString")
)
export type UuidString = S.Schema.Type<typeof UuidString>

export const DocumentId = UuidString.pipe(S.brand("DocumentId"))
export type DocumentId = S.Schema.Type<typeof DocumentId>

export const DocumentVersionId = UuidString.pipe(S.brand("DocumentVersionId"))
export type DocumentVersionId = S.Schema.Type<typeof DocumentVersionId>

export const UserId = UuidString.pipe(S.brand("UserId"))
export type UserId = S.Schema.Type<typeof UserId>

export const DownloadTokenId = UuidString.pipe(S.brand("DownloadTokenId"))
export type DownloadTokenId = S.Schema.Type<typeof DownloadTokenId>

export const WorkspaceId = UuidString.pipe(S.brand("WorkspaceId"))
export type WorkspaceId = S.Schema.Type<typeof WorkspaceId>

export const makeUserId = (input: unknown) => S.decodeUnknown(UserId)(input)
export const makeDocumentId = (input: unknown) => S.decodeUnknown(DocumentId)(input)
export const makeDownloadTokenId = (input: unknown) => S.decodeUnknown(DownloadTokenId)(input)
export const makeDocumentVersionId = (input: unknown) => S.decodeUnknown(DocumentVersionId)(input)
export const makeWorkspaceId = (input: unknown) => S.decodeUnknown(WorkspaceId)(input)

export const makeUserIdSync = (input: unknown) => S.decodeUnknownSync(UserId)(input)
export const makeDocumentIdSync = (input: unknown) => S.decodeUnknownSync(DocumentId)(input)
export const makeDownloadTokenIdSync = (input: unknown) => S.decodeUnknownSync(DownloadTokenId)(input)
export const makeDocumentVersionIdSync = (input: unknown) => S.decodeUnknownSync(DocumentVersionId)(input)
export const makeWorkspaceIdSync = (input: unknown) => S.decodeUnknownSync(WorkspaceId)(input)
