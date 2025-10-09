import { Schema as S, Option } from "effect"
import { Optional } from "@domain/utils/schema.utils"
import { DateTimeFromAny } from "@domain/refined/date-time"
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
  createdAt: DateTimeFromAny,
  updatedAt: Optional(DateTimeFromAny), // Accepts null/undefined and transforms to Option<Date>
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
  updated_at: S.Union(S.Date, S.Null),
  created_by: S.Union(S.String, S.Null)
})
export type DocumentVersionRow = S.Schema.Type<typeof DocumentVersionRow>

export const DocumentVersionCodec = S.transform(DocumentVersionRow, DocumentVersion, {
  decode: (r) => ({
    id: S.decodeUnknownSync(DocumentVersionId)(r.id),
    documentId: S.decodeUnknownSync(DocumentId)(r.document_id),
    version: r.version,
    checksum: S.decodeUnknownSync(Sha256)(r.checksum),
    fileKey: S.decodeUnknownSync(FileKey)(r.file_key),
    mimeType: S.decodeUnknownSync(MimeType)(r.mime_type),
    size: S.decodeUnknownSync(FileSize)(r.size),
    createdAt: r.created_at,
    updatedAt: Option.fromNullable(r.updated_at),
    createdBy: Option.fromNullable(r.created_by != null ? S.decodeUnknownSync(UserId)(r.created_by) : null)
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
    updated_at: Option.getOrNull(d.updatedAt as any),
    created_by: Option.getOrNull(d.createdBy as any)
  }),
  strict: false
})

export const makeDocumentVersion = (input: unknown) => S.decodeUnknown(DocumentVersion)(input)
export const makeDocumentVersionRow = (input: unknown) => S.decodeUnknown(DocumentVersionRow)(input)
