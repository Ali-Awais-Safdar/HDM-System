import { Schema as S } from "effect"
import { DocumentId, DocumentVersionId, UserId } from "@domain/refined/ids"
import { Sha256 } from "@domain/refined/checksum"
import { FileKey } from "@domain/refined/file-reference"
import { DocumentFields, DocumentStruct } from "@domain/document/document.schema"
import { FileMetadataFields } from "@domain/documentVersion/file-metadata.vo"
import { DocumentVersionFields } from "@domain/documentVersion/document-version.schema"
import { VersionNumber } from "@domain/documentVersion/version-number.vo"
import { Optional } from "@domain/utils/schema.utils"

export const CreateDocumentCommandSchema = S.Struct({
  ownerId: DocumentFields.ownerId,
  title: DocumentFields.title,
  description: DocumentFields.description,
  tags: DocumentFields.tags
})
export type CreateDocumentCommand = S.Schema.Type<typeof CreateDocumentCommandSchema>
export type CreateDocumentCommandEncoded = S.Schema.Encoded<typeof CreateDocumentCommandSchema>

export const decodeCreateDocumentCommand = S.decodeUnknown(CreateDocumentCommandSchema)

export const InitiateUploadCommandSchema = S.Struct({
  documentId: DocumentId,
  actorId: UserId,
  mimeType: FileMetadataFields.mimeType,
  size: FileMetadataFields.size,
  contentRef: FileKey, // Use FileKey for proper validation
  checksum: S.optional(Sha256)
})
export type InitiateUploadCommand = S.Schema.Type<typeof InitiateUploadCommandSchema>
export type InitiateUploadCommandEncoded = S.Schema.Encoded<typeof InitiateUploadCommandSchema>

export const decodeInitiateUploadCommand = S.decodeUnknown(InitiateUploadCommandSchema)

export const ConfirmUploadCommandSchema = S.Struct({
  documentId: DocumentVersionFields.documentId,
  actorId: UserId,
  fileKey: FileKey,
  checksum: Sha256,
  mimeType: FileMetadataFields.mimeType,
  size: FileMetadataFields.size,
  contentRef: FileKey, // Use FileKey for proper validation
  versionHint: S.optional(VersionNumber)
})
export type ConfirmUploadCommand = S.Schema.Type<typeof ConfirmUploadCommandSchema>
export type ConfirmUploadCommandEncoded = S.Schema.Encoded<typeof ConfirmUploadCommandSchema>

export const decodeConfirmUploadCommand = S.decodeUnknown(ConfirmUploadCommandSchema)

export const PublishDocumentCommandSchema = S.Struct({
  documentId: DocumentId,
  actorId: UserId,
  publishStatus: DocumentFields.publishStatus,
  publishNotes: DocumentFields.publishNotes
})
export type PublishDocumentCommand = S.Schema.Type<typeof PublishDocumentCommandSchema>
export type PublishDocumentCommandEncoded = S.Schema.Encoded<typeof PublishDocumentCommandSchema>

export const decodePublishDocumentCommand = S.decodeUnknown(PublishDocumentCommandSchema)

export const UpdateDocumentCommandSchema = DocumentStruct.pick("title", "description", "tags")
  .pipe(S.partialWith({ exact: true }))
  .pipe(S.extend(S.Struct({ 
    id: DocumentId,
    actorId: UserId 
  })))
export type UpdateDocumentCommand = S.Schema.Type<typeof UpdateDocumentCommandSchema>
export type UpdateDocumentCommandEncoded = S.Schema.Encoded<typeof UpdateDocumentCommandSchema>

export const decodeUpdateDocumentCommand = S.decodeUnknown(UpdateDocumentCommandSchema)

export const DeleteDocumentCommandSchema = S.Struct({
  id: DocumentId,
  actorId: UserId,
  force: S.optional(S.Boolean)
})
export type DeleteDocumentCommand = S.Schema.Type<typeof DeleteDocumentCommandSchema>
export type DeleteDocumentCommandEncoded = S.Schema.Encoded<typeof DeleteDocumentCommandSchema>

export const decodeDeleteDocumentCommand = S.decodeUnknown(DeleteDocumentCommandSchema)

export const InitiateUploadResponseSchema = S.Struct({
  uploadUrl: S.String,
  fileKey: FileKey,
  contentRef: FileKey,
  expiresAt: S.String, // ISO date string (workflow converts Date to ISO)
  uploadToken: S.String
})
export type InitiateUploadResponse = S.Schema.Type<typeof InitiateUploadResponseSchema>
export type InitiateUploadResponseEncoded = S.Schema.Encoded<typeof InitiateUploadResponseSchema>

export const decodeInitiateUploadResponse = S.decodeUnknown(InitiateUploadResponseSchema)

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
export type ConfirmUploadResponseEncoded = S.Schema.Encoded<typeof ConfirmUploadResponseSchema>

export const decodeConfirmUploadResponse = S.decodeUnknown(ConfirmUploadResponseSchema)

export const DocumentCommandDTO = {
  // Command Schemas
  CreateDocumentCommandSchema,
  InitiateUploadCommandSchema,
  ConfirmUploadCommandSchema,
  PublishDocumentCommandSchema,
  UpdateDocumentCommandSchema,
  DeleteDocumentCommandSchema,
  
  // Response Schemas
  InitiateUploadResponseSchema,
  ConfirmUploadResponseSchema,
  
  // Command Decoders
  decodeCreateDocumentCommand,
  decodeInitiateUploadCommand,
  decodeConfirmUploadCommand,
  decodePublishDocumentCommand,
  decodeUpdateDocumentCommand,
  decodeDeleteDocumentCommand,
  
  // Response Decoders
  decodeInitiateUploadResponse,
  decodeConfirmUploadResponse
} as const
