import { Schema as S } from "effect"

export const DocumentPublishStatus = S.Union(
  S.Literal("draft"),
  S.Literal("published"),
  S.Literal("unpublished")
).pipe(
  S.brand("DocumentPublishStatus")
)

export type DocumentPublishStatus = S.Schema.Type<typeof DocumentPublishStatus>
