import { Option, Schema as S } from "effect"
import { DocumentGuards } from "@domain/document/document.guards"
import { Optional } from "@domain/utils/schema.utils"
import { DateTimeFromAny } from "@domain/refined/date-time"
import { DocumentId, DocumentVersionId, UserId } from "@domain/refined/ids"

const Tags = S.Array(S.String).pipe(DocumentGuards.ValidTagList)

export const Document = S.Struct({
  id: DocumentId,
  ownerId: UserId,
  title: S.String.pipe(DocumentGuards.ValidTitle), // Validation logic integrated into schema
  description: Optional(S.String.pipe(DocumentGuards.ValidDescription)), // Accepts null/undefined and transforms to Option<string>
  tags: Optional(Tags), // Accepts null/undefined and transforms to Option<readonly string[]>
  currentVersionId: DocumentVersionId,
  createdAt: DateTimeFromAny,
  updatedAt: Optional(DateTimeFromAny) // Accepts null/undefined and transforms to Option<Date>
})
export type Document = S.Schema.Type<typeof Document>

export const DocumentRow = S.Struct({
  id: S.String,
  owner_id: S.String,
  title: S.String,
  description: S.optional(S.String),
  tags: S.optional(S.Array(S.String)),
  current_version_id: S.String,
  created_at: S.Date,
  updated_at: S.Union(S.Date, S.Null)
})
export type DocumentRow = S.Schema.Type<typeof DocumentRow>

export const DocumentCodec = S.transform(DocumentRow, Document, {
  decode: (r) => ({
    id: S.decodeUnknownSync(DocumentId)(r.id),
    ownerId: S.decodeUnknownSync(UserId)(r.owner_id),
    title: r.title,
    description: Option.fromNullable(r.description),
    tags: Option.fromNullable(r.tags),
    currentVersionId: S.decodeUnknownSync(DocumentVersionId)(r.current_version_id),
    createdAt: r.created_at,
    updatedAt: Option.fromNullable(r.updated_at)
  }),
  encode: (d) => ({
    id: d.id,
    owner_id: d.ownerId,
    title: d.title,
    description: Option.getOrNull(d.description as any),
    tags: Option.match(d.tags, {
      onNone: () => null,
      onSome: (value) => Array.isArray(value) ? [...value] : []
    }),
    current_version_id: d.currentVersionId,
    created_at: d.createdAt,
    updated_at: Option.getOrNull(d.updatedAt as any)
  }),
  strict: false
})

export const makeDocument = (input: unknown) => S.decodeUnknown(Document)(input)
export const makeDocumentRow = (input: unknown) => S.decodeUnknown(DocumentRow)(input)
