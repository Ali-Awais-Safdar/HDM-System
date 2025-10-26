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
  updatedAt: DateTimeFromString // ISO date string
})
export type DocumentResponse = S.Schema.Type<typeof DocumentResponseSchema>
export type DocumentResponseEncoded = S.Schema.Encoded<typeof DocumentResponseSchema>

export const decodeDocumentResponse = S.decodeUnknown(DocumentResponseSchema)


export const DocumentSummarySchema = S.Struct({
  id: DocumentId,
  ownerId: UserId,
  title: DocumentFields.title,
  description: DocumentFields.description,
  tags: DocumentFields.tags,
  publishStatus: DocumentFields.publishStatus,
  createdAt: DateTimeFromString
})
export type DocumentSummary = S.Schema.Type<typeof DocumentSummarySchema>
export type DocumentSummaryEncoded = S.Schema.Encoded<typeof DocumentSummarySchema>

export const decodeDocumentSummary = S.decodeUnknown(DocumentSummarySchema)


export const PaginatedDocumentsResponseSchema = S.Struct({
  data: S.Array(DocumentSummarySchema),
  total: S.Number,
  pageNum: PageNumber,
  pageSize: DocumentPageSize,
  totalPages: S.Number
})
export type PaginatedDocumentsResponse = S.Schema.Type<typeof PaginatedDocumentsResponseSchema>
export type PaginatedDocumentsResponseEncoded = S.Schema.Encoded<typeof PaginatedDocumentsResponseSchema>

export const decodePaginatedDocumentsResponse = S.decodeUnknown(PaginatedDocumentsResponseSchema)

export const DocumentResponseDTO = {
  // Response Schemas
  DocumentResponseSchema,
  DocumentSummarySchema,
  PaginatedDocumentsResponseSchema,
  
  // Response Decoders
  decodeDocumentResponse,
  decodeDocumentSummary,
  decodePaginatedDocumentsResponse
} as const
