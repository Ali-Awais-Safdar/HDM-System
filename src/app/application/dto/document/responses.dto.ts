import { Schema as S } from "effect"
import { DocumentId, DocumentVersionId, UserId } from "@domain/refined/ids"
import { DocumentFields } from "@domain/document/document.schema"
import { DateTimeFromString } from "@domain/refined/date-time"
import { FileKey } from "@domain/refined/file-reference"
import { Sha256 } from "@domain/refined/checksum"
import { DocumentVersionFields } from "@domain/documentVersion/document-version.schema"
import { PageNumber, DocumentPageSize } from "@domain/utils/pagination"
import { Optional } from "@domain/utils/schema.utils"


export const DocumentResponseSchema = S.Struct({
  id: DocumentId,
  ownerId: UserId,
  title: DocumentFields.title,
  description: DocumentFields.description,
  tags: DocumentFields.tags,
  publishStatus: DocumentFields.publishStatus,
  publishNotes: DocumentFields.publishNotes,
  createdAt: DateTimeFromString, // ISO date string
  updatedAt: S.optional(DateTimeFromString) // ISO date string, optional
})
export type DocumentResponseEncoded = S.Schema.Encoded<typeof DocumentResponseSchema>

export const DocumentSummarySchema = S.Struct({
  id: DocumentId,
  ownerId: UserId,
  title: DocumentFields.title,
  description: DocumentFields.description,
  tags: DocumentFields.tags,
  publishStatus: DocumentFields.publishStatus,
  createdAt: DateTimeFromString
})

export const PaginatedDocumentsResponseSchema = S.Struct({
  data: S.Array(DocumentSummarySchema),
  total: S.Number,
  pageNum: PageNumber,
  pageSize: DocumentPageSize,
  totalPages: S.Number
})
export type PaginatedDocumentsResponseEncoded = S.Schema.Encoded<typeof PaginatedDocumentsResponseSchema>

export const InitiateUploadResponseSchema = S.Struct({
  fileKey: FileKey,
  checksum: Sha256,
  contentRef: FileKey
})
export type InitiateUploadResponse = S.Schema.Type<typeof InitiateUploadResponseSchema>

export const ConfirmUploadResponseSchema = S.Struct({
  versionId: DocumentVersionId,
  documentId: DocumentVersionFields.documentId,
  version: DocumentVersionFields.version,
  file: DocumentVersionFields.file,
  createdBy: Optional(UserId), // Optional (converted to null in presentation layer)
  createdAt: S.String, // ISO date string (workflow converts Date to ISO)
  updatedAt: S.optional(S.String) // Optional ISO date string
})
export type ConfirmUploadResponse = S.Schema.Type<typeof ConfirmUploadResponseSchema>


