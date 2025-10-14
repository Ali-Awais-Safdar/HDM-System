import { Schema as S } from "effect"
import { BaseEntitySchema } from "@domain/utils/schema.base"
import { DocumentId, DocumentVersionId } from "@domain/refined/ids"
import { VersionNumber } from "@domain/documentVersion/version-number.vo"
import { VersionAuthor } from "@domain/documentVersion/version-author.vo"
import { FileMetadata } from "@domain/documentVersion/file-metadata.vo"

export const DocumentVersion = S.extend(
  BaseEntitySchema(DocumentVersionId),
  S.Struct({
  documentId: DocumentId,
  version: VersionNumber,
  file: FileMetadata,
  createdBy: VersionAuthor
})
)
export type DocumentVersion = S.Schema.Type<typeof DocumentVersion>
