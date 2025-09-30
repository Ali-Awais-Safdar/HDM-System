import { Schema as S, Option } from "effect"
import { DocumentId, UserId, DocumentVersionId } from "../value-objects/id.vo"
import { DateTime } from "../value-objects/datetime.vo"

// Helper: a normalized, non-empty, deduped tag list
const Tags = S.Array(S.String.pipe(S.filter(s => s.trim().length > 0, { message: () => "tag empty" })))
  .pipe(S.filter(arr => new Set(arr.map(s => s.trim().toLowerCase())).size === arr.length, { message: () => "duplicate tags" }))

export const Document = S.Struct({
  id: DocumentId,
  ownerId: UserId,
  title: S.String.pipe(S.filter(s => s.trim().length > 0, { message: () => "title required" })),
  description: S.optional(S.String),
  tags: S.optional(Tags),
  currentVersionId: DocumentVersionId,

  createdAt: DateTime,
  updatedAt: S.Option(DateTime) // Option<Date> in domain
})
export type Document = S.Schema.Type<typeof Document>

// Persistence row (snake_case + nullable updated_at)
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

// Transform Row <-> Domain (Option <-> null)
export const DocumentCodec = S.transform(DocumentRow, Document, {
  decode: (r) => ({
    id: r.id as any,
    ownerId: r.owner_id as any,
    title: r.title,
    description: r.description,
    tags: r.tags,
    currentVersionId: r.current_version_id as any,
    createdAt: r.created_at,
    updatedAt: r.updated_at == null ? Option.none() : Option.some(r.updated_at)
  }),
  encode: (d) => ({
    id: d.id,
    owner_id: d.ownerId,
    title: d.title,
    description: d.description,
    tags: d.tags,
    current_version_id: d.currentVersionId,
    created_at: d.createdAt,
    updated_at: d.updatedAt._tag === "Some" ? d.updatedAt.value : null
  }),
  strict: false
})

// Factory functions for creating Document from unknown input
export const makeDocument = (input: unknown) => S.decodeUnknownSync(Document)(input)
export const makeDocumentRow = (input: unknown) => S.decodeUnknownSync(DocumentRow)(input)
