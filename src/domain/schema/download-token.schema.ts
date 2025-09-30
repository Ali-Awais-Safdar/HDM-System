import { Schema as S, Option } from "effect"
import { DownloadTokenId, UserId, DocumentId } from "../value-objects/id.vo"
import { DateTime } from "../value-objects/datetime.vo"

export const DownloadToken = S.Struct({
  id: DownloadTokenId,
  token: S.String.pipe(
    S.filter(s => s.trim().length > 0, { message: () => "Token cannot be empty" }),
    S.filter(s => s.length >= 32, { message: () => "Token must be at least 32 characters" })
  ),
  documentId: DocumentId,
  issuedTo: UserId,
  expiresAt: DateTime,
  usedAt: S.Option(DateTime),
  createdAt: DateTime
})
export type DownloadToken = S.Schema.Type<typeof DownloadToken>

// Persistence row (snake_case)
export const DownloadTokenRow = S.Struct({
  token: S.String,
  document_id: S.String,
  issued_to: S.String,
  expires_at: S.Date,
  used_at: S.Union(S.Date, S.Null),
  created_at: S.Date
})
export type DownloadTokenRow = S.Schema.Type<typeof DownloadTokenRow>

// Transform Row <-> Domain (Option <-> null)
export const DownloadTokenCodec = S.transform(DownloadTokenRow, DownloadToken, {
  decode: (r) => ({
    id: r.token as any, // Using token as ID for now, can be updated if needed
    token: r.token,
    documentId: r.document_id as any,
    issuedTo: r.issued_to as any,
    expiresAt: r.expires_at,
    usedAt: r.used_at == null ? Option.none() : Option.some(r.used_at),
    createdAt: r.created_at
  }),
  encode: (d) => ({
    token: d.token,
    document_id: d.documentId,
    issued_to: d.issuedTo,
    expires_at: d.expiresAt,
    used_at: d.usedAt._tag === "Some" ? d.usedAt.value : null,
    created_at: d.createdAt
  }),
  strict: false
})

// Factory functions
export const makeDownloadToken = (input: unknown) => S.decodeUnknownSync(DownloadToken)(input)
export const makeDownloadTokenRow = (input: unknown) => S.decodeUnknownSync(DownloadTokenRow)(input)
