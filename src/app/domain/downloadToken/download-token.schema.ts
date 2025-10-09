import { Schema as S, Option } from "effect"
import { Optional } from "@domain/utils/schema.utils"
import { DateTimeFromAny } from "@domain/refined/date-time"
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
  expiresAt: DateTimeFromAny.pipe(
    DownloadTokenGuards.ValidExpiryDate // Guards integrated into schema
  ),
  usedAt: Optional(DateTimeFromAny.pipe(DownloadTokenGuards.ValidUsedDate)), // Guards integrated into schema
  createdAt: DateTimeFromAny,
  updatedAt: Optional(DateTimeFromAny) // Accepts null/undefined and transforms to Option<Date>
})
export type DownloadToken = S.Schema.Type<typeof DownloadToken>

export const DownloadTokenRow = S.Struct({
  id: S.String,
  token: S.String,
  document_id: S.String,
  issued_to: S.String,
  expires_at: S.Date,
  used_at: S.Union(S.Date, S.Null),
  created_at: S.Date,
  updated_at: S.Union(S.Date, S.Null)
})
export type DownloadTokenRow = S.Schema.Type<typeof DownloadTokenRow>

export const DownloadTokenCodec = S.transform(DownloadTokenRow, DownloadToken, {
  decode: (r) => ({
    id: S.decodeUnknownSync(DownloadTokenId)(r.id),
    token: r.token,
    documentId: S.decodeUnknownSync(DocumentId)(r.document_id),
    issuedTo: S.decodeUnknownSync(UserId)(r.issued_to),
    expiresAt: r.expires_at,
    usedAt: Option.fromNullable(r.used_at),
    createdAt: r.created_at,
    updatedAt: Option.fromNullable(r.updated_at)
  }),
  encode: (d) => ({
    id: d.id,
    token: d.token,
    document_id: d.documentId,
    issued_to: d.issuedTo,
    expires_at: d.expiresAt,
    used_at: Option.getOrNull(d.usedAt),
    created_at: d.createdAt,
    updated_at: Option.getOrNull(d.updatedAt as any)
  }),
  strict: false
})

export const makeDownloadToken = (input: unknown) => S.decodeUnknown(DownloadToken)(input)
export const makeDownloadTokenRow = (input: unknown) => S.decodeUnknown(DownloadTokenRow)(input)
