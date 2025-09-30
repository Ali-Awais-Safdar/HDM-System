import { Schema as S } from "effect"
import { DocumentVersionId, DocumentId, UserId } from "../value-objects/id.vo"
import { Sha256 } from "../value-objects/checksum.vo"
import { FileKey, MimeType, FileSize } from "../value-objects/file-ref.vo"
import { DateTime } from "../value-objects/datetime.vo"

export const DocumentVersion = S.Struct({
  id: DocumentVersionId,
  documentId: DocumentId,
  version: S.Number.pipe(S.int(), S.filter(n => n > 0, { message: () => "version > 0" })),
  checksum: Sha256,
  fileKey: FileKey,
  mimeType: MimeType,
  size: FileSize,
  createdAt: DateTime,
  createdBy: S.optional(UserId) // optional if your model allows; else require
})
export type DocumentVersion = S.Schema.Type<typeof DocumentVersion>

// Persistence/DTO shape example (snake_case + nullable dates if any)
export const DocumentVersionRow = S.Struct({
  id: S.String,                // same string underneath
  document_id: S.String,
  version: S.Number,
  checksum: S.String,
  file_key: S.String,
  mime_type: S.String,
  size: S.Number,
  created_at: S.Date,          // DB drivers often give Date directly
  created_by: S.optional(S.String)
})
export type DocumentVersionRow = S.Schema.Type<typeof DocumentVersionRow>

// Codec (transform Row <-> Domain)
export const DocumentVersionCodec = S.transform(DocumentVersionRow, DocumentVersion, {
  decode: (r) => ({
    id: r.id as any,
    documentId: r.document_id as any,
    version: r.version,
    checksum: r.checksum as any,
    fileKey: r.file_key as any,
    mimeType: r.mime_type as any,
    size: r.size as any,
    createdAt: r.created_at,
    createdBy: r.created_by as any
  }),
  encode: (d) => ({
    id: d.id,
    document_id: d.documentId,
    version: d.version,
    checksum: d.checksum,
    file_key: d.fileKey,
    mime_type: d.mimeType,
    size: d.size,
    created_at: d.createdAt,
    created_by: d.createdBy
  }),
  strict: false
})

// Factory functions for creating DocumentVersion from unknown input
export const makeDocumentVersion = (input: unknown) => S.decodeUnknownSync(DocumentVersion)(input)
export const makeDocumentVersionRow = (input: unknown) => S.decodeUnknownSync(DocumentVersionRow)(input)
