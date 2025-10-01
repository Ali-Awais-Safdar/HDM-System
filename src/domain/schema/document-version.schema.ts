import { Schema as S } from "effect"
import { DocumentVersionId, DocumentId, UserId } from "../value-objects/id.vo"
import { Sha256 } from "../value-objects/checksum.vo"
import { FileKey, MimeType, FileSize } from "../value-objects/file-ref.vo"
import { DateTime } from "../value-objects/datetime.vo"
import { isPositiveNumber } from "../guards/domain.guards"
import { fromNullable } from "../utils/option.utils"

// Domain schema with embedded guards
export const DocumentVersion = S.Struct({
  id: DocumentVersionId,
  documentId: DocumentId,
  version: S.Number.pipe(
    S.int(), 
    S.filter(isPositiveNumber, { message: () => "Version must be a positive integer" })
  ),
  checksum: Sha256,
  fileKey: FileKey,
  mimeType: MimeType,
  size: FileSize,
  createdAt: DateTime,
  createdBy: S.Option(UserId) // Option<UserId> in domain for optional fields
})
export type DocumentVersion = S.Schema.Type<typeof DocumentVersion>

// Persistence/DTO shape (snake_case + nullable created_by) - wire format
export const DocumentVersionRow = S.Struct({
  id: S.String,
  document_id: S.String,
  version: S.Number,
  checksum: S.String,
  file_key: S.String,
  mime_type: S.String,
  size: S.Number,
  created_at: S.Date,
  created_by: S.Union(S.String, S.Null) // nullable in persistence
})
export type DocumentVersionRow = S.Schema.Type<typeof DocumentVersionRow>

// Codec (transform Row <-> Domain with normalization at boundaries)
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
    createdBy: fromNullable(r.created_by as any)
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
    created_by: d.createdBy._tag === "Some" ? d.createdBy.value : null
  }),
  strict: false
})

// Factory functions for creating from unknown input using Effect pipeline
export const makeDocumentVersion = (input: unknown) => S.decodeUnknown(DocumentVersion)(input)
export const makeDocumentVersionRow = (input: unknown) => S.decodeUnknown(DocumentVersionRow)(input)
