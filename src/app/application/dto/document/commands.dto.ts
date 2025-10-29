import { Schema as S } from "effect"
import { DocumentId, UserId, WorkspaceId } from "@domain/refined/ids"
import { Sha256 } from "@domain/refined/checksum"
import { FileKey } from "@domain/refined/file-reference"
import { DocumentFields, DocumentStruct } from "@domain/document/document.schema"
import { FileMetadataFields } from "@domain/documentVersion/file-metadata.vo"
import { DocumentVersionFields } from "@domain/documentVersion/document-version.schema"
import { VersionNumber } from "@domain/documentVersion/version-number.vo"

// ===== INPUT SCHEMAS (Client-supplied, no auth/workspace fields) =====

export const CreateDocumentInputSchema = S.Struct({
  title: DocumentFields.title,
  description: DocumentFields.description,
  tags: DocumentFields.tags
})

// ===== COMMAND SCHEMAS (Internal, with injected auth/workspace fields) =====

export const CreateDocumentCommandSchema = CreateDocumentInputSchema.pipe(
  S.extend(S.Struct({
    workspaceId: WorkspaceId,
    ownerId: DocumentFields.ownerId, // Injected from actorId by withActorAndWorkspace
    actorId: UserId // Injected from authenticated context
  }))
)
export type CreateDocumentCommand = S.Schema.Type<typeof CreateDocumentCommandSchema>
export type CreateDocumentCommandEncoded = S.Schema.Encoded<typeof CreateDocumentCommandSchema>

export const InitiateUploadInputSchema = S.Struct({
  documentId: DocumentVersionFields.documentId,
  mimeType: FileMetadataFields.mimeType,
  size: FileMetadataFields.size,
  contentRef: FileKey,
  checksum: S.optional(Sha256)
})
export type InitiateUploadInput = S.Schema.Type<typeof InitiateUploadInputSchema>

export const InitiateUploadCommandSchema = InitiateUploadInputSchema.pipe(
  S.extend(S.Struct({
    workspaceId: WorkspaceId,
    actorId: UserId
  }))
)
export type InitiateUploadCommand = S.Schema.Type<typeof InitiateUploadCommandSchema>
export type InitiateUploadCommandEncoded = S.Schema.Encoded<typeof InitiateUploadCommandSchema>

export const ConfirmUploadInputSchema = S.Struct({
  documentId: DocumentVersionFields.documentId,
  fileKey: FileKey,
  checksum: Sha256,
  mimeType: FileMetadataFields.mimeType,
  size: FileMetadataFields.size,
  contentRef: FileKey,
  versionHint: S.optional(VersionNumber)
})
export type ConfirmUploadInput = S.Schema.Type<typeof ConfirmUploadInputSchema>

export const ConfirmUploadCommandSchema = ConfirmUploadInputSchema.pipe(
  S.extend(S.Struct({
    workspaceId: WorkspaceId,
    actorId: UserId
  }))
)
export type ConfirmUploadCommand = S.Schema.Type<typeof ConfirmUploadCommandSchema>
export type ConfirmUploadCommandEncoded = S.Schema.Encoded<typeof ConfirmUploadCommandSchema>

export const PublishDocumentInputSchema = S.Struct({
  documentId: DocumentId,
  publishStatus: DocumentFields.publishStatus,
  publishNotes: DocumentFields.publishNotes
})
export type PublishDocumentInput = S.Schema.Type<typeof PublishDocumentInputSchema>

export const PublishDocumentCommandSchema = PublishDocumentInputSchema.pipe(
  S.extend(S.Struct({
    workspaceId: WorkspaceId,
    actorId: UserId
  }))
)
export type PublishDocumentCommand = S.Schema.Type<typeof PublishDocumentCommandSchema>
export type PublishDocumentCommandEncoded = S.Schema.Encoded<typeof PublishDocumentCommandSchema>

export const UpdateDocumentInputSchema = DocumentStruct.pick("title", "description", "tags")
  .pipe(S.partialWith({ exact: true }))
  .pipe(S.extend(S.Struct({ id: DocumentId })))
export type UpdateDocumentInput = S.Schema.Type<typeof UpdateDocumentInputSchema>

export const UpdateDocumentCommandSchema = UpdateDocumentInputSchema.pipe(
  S.extend(S.Struct({
    workspaceId: WorkspaceId,
    actorId: UserId
  }))
)
export type UpdateDocumentCommand = S.Schema.Type<typeof UpdateDocumentCommandSchema>
export type UpdateDocumentCommandEncoded = S.Schema.Encoded<typeof UpdateDocumentCommandSchema>

export const DeleteDocumentInputSchema = S.Struct({
  id: DocumentId,
  force: S.optional(S.Boolean)
})
export type DeleteDocumentInput = S.Schema.Type<typeof DeleteDocumentInputSchema>

export const DeleteDocumentCommandSchema = DeleteDocumentInputSchema.pipe(
  S.extend(S.Struct({
    workspaceId: WorkspaceId,
    actorId: UserId
  }))
)
export type DeleteDocumentCommand = S.Schema.Type<typeof DeleteDocumentCommandSchema>
export type DeleteDocumentCommandEncoded = S.Schema.Encoded<typeof DeleteDocumentCommandSchema>
