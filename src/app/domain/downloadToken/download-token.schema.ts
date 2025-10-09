import { Schema as S } from "effect"
import { fromNullable } from "@domain/utils/option.utils"
import { Optional } from "@domain/utils/schema.utils"
import { DateTime } from "@domain/refined/date-time"
import { DocumentId, DownloadTokenId, UserId } from "@domain/refined/ids"
import { DownloadTokenGuards } from "@domain/downloadToken/download-token.guards"

export const DownloadToken = S.Struct({
  id: DownloadTokenId,
  token: S.String.pipe(
    S.filter(s => s.trim().length > 0, { message: () => "Token cannot be empty" }),
    DownloadTokenGuards.ValidToken // Guards integrated into schema
  ),
  documentId: DocumentId,
  issuedTo: UserId,
  expiresAt: DateTime.pipe(
    DownloadTokenGuards.ValidExpiryDate // Guards integrated into schema
  ),
  usedAt: Optional(DateTime.pipe(DownloadTokenGuards.ValidUsedDate)), // Guards integrated into schema
  createdAt: DateTime
})
export type DownloadToken = S.Schema.Type<typeof DownloadToken>

export const DownloadTokenRow = S.Struct({
  id: S.String,
  token: S.String,
  document_id: S.String,
  issued_to: S.String,
  expires_at: S.Date,
  used_at: S.Union(S.Date, S.Null),
  created_at: S.Date
})
export type DownloadTokenRow = S.Schema.Type<typeof DownloadTokenRow>

export const DownloadTokenCodec = S.transform(DownloadTokenRow, DownloadToken, {
  decode: (r) => ({
    id: r.id as any,
    token: r.token,
    documentId: r.document_id as any,
    issuedTo: r.issued_to as any,
    expiresAt: r.expires_at,
    usedAt: fromNullable(r.used_at),
    createdAt: r.created_at
  }),
  encode: (d) => ({
    id: d.id,
    token: d.token,
    document_id: d.documentId,
    issued_to: d.issuedTo,
    expires_at: d.expiresAt,
    used_at: d.usedAt._tag === "Some" ? d.usedAt.value : null,
    created_at: d.createdAt
  }),
  strict: false
})

export const makeDownloadToken = (input: unknown) => S.decodeUnknown(DownloadToken)(input)
export const makeDownloadTokenRow = (input: unknown) => S.decodeUnknown(DownloadTokenRow)(input)
