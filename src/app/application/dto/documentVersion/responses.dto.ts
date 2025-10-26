import { Schema as S } from "effect"
import { DocumentVersionId } from "@domain/refined/ids"
import { DocumentVersionFields } from "@domain/documentVersion/document-version.schema"
import { FileMetadataFields } from "@domain/documentVersion/file-metadata.vo"
import { PageNumber, VersionPageSize } from "@domain/utils/pagination"

export const DocumentVersionResponseSchema = S.Struct({
  id: DocumentVersionId,
  documentId: DocumentVersionFields.documentId,
  version: DocumentVersionFields.version,
  file: DocumentVersionFields.file,
  createdBy: DocumentVersionFields.createdBy,
  createdAt: S.Date,
  updatedAt: S.optional(S.Date)
})
export type DocumentVersionResponse = S.Schema.Type<typeof DocumentVersionResponseSchema>
export type DocumentVersionResponseEncoded = S.Schema.Encoded<typeof DocumentVersionResponseSchema>

export const decodeDocumentVersionResponse = S.decodeUnknown(DocumentVersionResponseSchema)

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
  createdAt: S.Date
})
export type DocumentVersionSummary = S.Schema.Type<typeof DocumentVersionSummarySchema>
export type DocumentVersionSummaryEncoded = S.Schema.Encoded<typeof DocumentVersionSummarySchema>

export const decodeDocumentVersionSummary = S.decodeUnknown(DocumentVersionSummarySchema)

export const PaginatedDocumentVersionsResponseSchema = S.Struct({
  data: S.Array(DocumentVersionSummarySchema),
  total: S.Number,
  pageNum: PageNumber,
  pageSize: VersionPageSize,
  totalPages: S.Number
})
export type PaginatedDocumentVersionsResponse = S.Schema.Type<typeof PaginatedDocumentVersionsResponseSchema>
export type PaginatedDocumentVersionsResponseEncoded = S.Schema.Encoded<typeof PaginatedDocumentVersionsResponseSchema>

export const decodePaginatedDocumentVersionsResponse = S.decodeUnknown(PaginatedDocumentVersionsResponseSchema)

export const LatestDocumentVersionResponseSchema = DocumentVersionResponseSchema
export type LatestDocumentVersionResponse = S.Schema.Type<typeof LatestDocumentVersionResponseSchema>
export type LatestDocumentVersionResponseEncoded = S.Schema.Encoded<typeof LatestDocumentVersionResponseSchema>

export const decodeLatestDocumentVersionResponse = S.decodeUnknown(LatestDocumentVersionResponseSchema)

export const DocumentVersionDTO = {
  // Response Schemas
  DocumentVersionResponseSchema,
  DocumentVersionSummarySchema,
  PaginatedDocumentVersionsResponseSchema,
  LatestDocumentVersionResponseSchema,
  
  // Response Decoders
  decodeDocumentVersionResponse,
  decodeDocumentVersionSummary,
  decodePaginatedDocumentVersionsResponse,
  decodeLatestDocumentVersionResponse
} as const
