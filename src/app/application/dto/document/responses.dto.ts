import { Schema as S } from "effect"
import { DocumentId, UserId } from "@domain/refined/ids"
import { DocumentFields } from "@domain/document/document.schema"
import { DateTimeFromString } from "@domain/refined/date-time"
import { PageNumber, DocumentPageSize } from "@domain/utils/pagination"


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


