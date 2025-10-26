import { Schema as S } from "effect"
import { Optional } from "@domain/utils/schema.utils"
import { DocumentId, UserId } from "@domain/refined/ids"
import { BaseEntitySchema } from "@domain/utils/schema.base"
import { DocumentTitle } from "@domain/document/document-title.vo"
import { DocumentDescription } from "@domain/document/document-description.vo"
import { TagList } from "@domain/document/tag-list.vo"
import { DocumentPublishStatus } from "@domain/document/document-publish-status.vo"
import { DocumentPublishNotes } from "@domain/document/document-publish-notes.vo"

export const DocumentStruct = S.Struct({
  ownerId: UserId,
  title: DocumentTitle,
  description: Optional(DocumentDescription),
  tags: Optional(TagList),
  publishStatus: DocumentPublishStatus,
  publishNotes: Optional(DocumentPublishNotes)
})

export const DocumentFields = DocumentStruct.fields

export const Document = S.extend(
  BaseEntitySchema(DocumentId),
  DocumentStruct
)
export type Document = S.Schema.Type<typeof Document>
