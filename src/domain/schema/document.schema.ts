import { Schema as S } from "effect"
import { DocumentId, UserId, DocumentVersionId } from "../value-objects/id.vo"
import { DateTime } from "../value-objects/datetime.vo"
import { isValidDocumentTitle, isValidDocumentDescription, isValidTagList } from "../guards/domain.guards"
import { fromNullable } from "../utils/option.utils"

// Helper: a normalized, non-empty, deduped tag list with embedded guards
const Tags = S.Array(S.String).pipe(
  S.filter((tags: readonly string[]) => isValidTagList(tags as string[]), { message: () => "Invalid tag list: duplicate tags or too many tags" })
)

// Domain schema with embedded guards
export const Document = S.Struct({
  id: DocumentId,
  ownerId: UserId,
  title: S.String.pipe(
    S.filter(isValidDocumentTitle, { message: () => "Title is required and cannot exceed 255 characters" })
  ),
  description: S.Option(S.String.pipe(
    S.filter(isValidDocumentDescription, { message: () => "Description cannot exceed 1000 characters" })
  )),
  tags: S.Option(Tags),
  currentVersionId: DocumentVersionId,
  createdAt: DateTime,
  updatedAt: S.Option(DateTime) // Option<Date> in domain
})
export type Document = S.Schema.Type<typeof Document>

// Persistence row (snake_case + nullable updated_at) - wire format
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

// Transform Row <-> Domain (normalize at boundaries: null <-> Option)
export const DocumentCodec = S.transform(DocumentRow, Document, {
  decode: (r) => ({
    id: r.id as any,
    ownerId: r.owner_id as any,
    title: r.title,
    description: fromNullable(r.description),
    tags: fromNullable(r.tags),
    currentVersionId: r.current_version_id as any,
    createdAt: r.created_at,
    updatedAt: fromNullable(r.updated_at)
  }),
  encode: (d) => ({
    id: d.id,
    owner_id: d.ownerId,
    title: d.title,
    description: d.description._tag === "Some" ? d.description.value : null,
    tags: d.tags._tag === "Some" ? d.tags.value : null,
    current_version_id: d.currentVersionId,
    created_at: d.createdAt,
    updated_at: d.updatedAt._tag === "Some" ? d.updatedAt.value : null
  }),
  strict: false
})

// Factory functions for creating from unknown input
export const makeDocument = (input: unknown) => S.decodeUnknownSync(Document)(input)
export const makeDocumentRow = (input: unknown) => S.decodeUnknownSync(DocumentRow)(input)
