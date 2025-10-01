import { Schema as S } from "effect"
import { DownloadTokenId, UserId, DocumentId } from "../value-objects/id.vo"
import { DateTime } from "../value-objects/datetime.vo"
import { isValidToken, isFutureDate } from "../guards/domain.guards"
import { fromNullable } from "../utils/option.utils"

// Domain schema with embedded guards
export const DownloadToken = S.Struct({
  id: DownloadTokenId,
  token: S.String.pipe(
    S.filter(s => s.trim().length > 0, { message: () => "Token cannot be empty" }),
    S.filter(isValidToken, { message: () => "Token must be at least 32 characters" })
  ),
  documentId: DocumentId,
  issuedTo: UserId,
  expiresAt: DateTime.pipe(
    S.filter(isFutureDate, { message: () => "Expiration date must be in the future" })
  ),
  usedAt: S.Option(DateTime),
  createdAt: DateTime
})
export type DownloadToken = S.Schema.Type<typeof DownloadToken>

// Persistence row (snake_case) - wire format
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

// Transform Row <-> Domain (normalize at boundaries: null <-> Option)
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

// Factory functions for creating from unknown input using Effect pipeline
export const makeDownloadToken = (input: unknown) => S.decodeUnknown(DownloadToken)(input)
export const makeDownloadTokenRow = (input: unknown) => S.decodeUnknown(DownloadTokenRow)(input)
