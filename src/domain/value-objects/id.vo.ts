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

export const PermissionId = UuidString.pipe(S.brand("PermissionId"))
export type PermissionId = S.Schema.Type<typeof PermissionId>

export const DownloadTokenId = UuidString.pipe(S.brand("DownloadTokenId"))
export type DownloadTokenId = S.Schema.Type<typeof DownloadTokenId>

// Factory functions for creating IDs from unknown input using Effect pipeline
export const makeUserId = (input: unknown) => S.decodeUnknown(UserId)(input)
export const makeDocumentId = (input: unknown) => S.decodeUnknown(DocumentId)(input)
export const makePermissionId = (input: unknown) => S.decodeUnknown(PermissionId)(input)
export const makeDownloadTokenId = (input: unknown) => S.decodeUnknown(DownloadTokenId)(input)
export const makeDocumentVersionId = (input: unknown) => S.decodeUnknown(DocumentVersionId)(input)
