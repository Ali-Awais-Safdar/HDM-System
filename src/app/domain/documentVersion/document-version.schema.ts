import { Schema as S } from "effect"
import { fromNullable, toNullable } from "@domain/utils/option.utils"
import { Optional } from "@domain/utils/schema.utils"
import { DateTime } from "@domain/refined/date-time"
import { Sha256 } from "@domain/refined/checksum"
import { FileKey, FileSize, MimeType } from "@domain/refined/file-reference"
import { DocumentId, DocumentVersionId, UserId } from "@domain/refined/ids"
import { DocumentVersionGuards } from "@domain/documentVersion/document-version.guards"

export const DocumentVersion = S.Struct({
  id: DocumentVersionId,
  documentId: DocumentId,
  version: S.Number.pipe(
    S.int(), 
    DocumentVersionGuards.ValidVersion // Guards integrated into schema
  ),
  checksum: Sha256.pipe(DocumentVersionGuards.ValidChecksum), // Guards integrated into schema
  fileKey: FileKey,
  mimeType: MimeType.pipe(DocumentVersionGuards.ValidMimeType), // Guards integrated into schema
  size: FileSize.pipe(DocumentVersionGuards.ValidFileSize), // Guards integrated into schema
  createdAt: DateTime,
  createdBy: Optional(UserId) // Accepts null/undefined and transforms to Option<UserId>
})
export type DocumentVersion = S.Schema.Type<typeof DocumentVersion>

export const DocumentVersionRow = S.Struct({
  id: S.String,
  document_id: S.String,
  version: S.Number,
  checksum: S.String,
  file_key: S.String,
  mime_type: S.String,
  size: S.Number,
  created_at: S.Date,
  created_by: S.Union(S.String, S.Null)
})
export type DocumentVersionRow = S.Schema.Type<typeof DocumentVersionRow>

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
    created_by: toNullable(d.createdBy as any)
  }),
  strict: false
})

export const makeDocumentVersion = (input: unknown) => S.decodeUnknown(DocumentVersion)(input)
export const makeDocumentVersionRow = (input: unknown) => S.decodeUnknown(DocumentVersionRow)(input)
