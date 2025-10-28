import { Schema as S } from "effect"
import { DocumentVersionId } from "@domain/refined/ids"
import { DocumentVersionFields } from "@domain/documentVersion/document-version.schema"
import { FileMetadataFields } from "@domain/documentVersion/file-metadata.vo"
import { PageNumber, VersionPageSize } from "@domain/utils/pagination"
import { DateTimeFromString } from "@domain/refined/date-time"

export const DocumentVersionResponseSchema = S.Struct({
  id: DocumentVersionId,
  documentId: DocumentVersionFields.documentId,
  version: DocumentVersionFields.version,
  file: DocumentVersionFields.file,
  createdBy: DocumentVersionFields.createdBy,
  createdAt: DateTimeFromString,
  updatedAt: S.optional(DateTimeFromString)
})
export type DocumentVersionResponseEncoded = S.Schema.Encoded<typeof DocumentVersionResponseSchema>

export const DocumentVersionSummarySchema = S.Struct({
  id: DocumentVersionId,
  documentId: DocumentVersionFields.documentId,
  version: DocumentVersionFields.version,
  file: S.Struct({
    fileKey: FileMetadataFields.fileKey,
    mimeType: FileMetadataFields.mimeType,
    size: FileMetadataFields.size,
    checksum: FileMetadataFields.checksum
  }),
  createdBy: DocumentVersionFields.createdBy,
  createdAt: DateTimeFromString
})

export const PaginatedDocumentVersionsResponseSchema = S.Struct({
  data: S.Array(DocumentVersionSummarySchema),
  total: S.Number,
  pageNum: PageNumber,
  pageSize: VersionPageSize,
  totalPages: S.Number
})
export type PaginatedDocumentVersionsResponseEncoded = S.Schema.Encoded<typeof PaginatedDocumentVersionsResponseSchema>

export const LatestDocumentVersionResponseSchema = DocumentVersionResponseSchema
export type LatestDocumentVersionResponseEncoded = S.Schema.Encoded<typeof LatestDocumentVersionResponseSchema>

