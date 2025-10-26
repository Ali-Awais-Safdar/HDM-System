import { Schema as S, Effect } from "effect"

export const DocumentPublishNotes = S.String.pipe(
  S.filter(
    (value) => {
      if (typeof value !== 'string') return false
      const trimmed = value.trim()
      return trimmed.length === 0 || trimmed.length <= 1000
    },
    { message: () => "Document publish notes must be empty or 1-1000 characters" }
  ),
  S.transformOrFail(
    S.Union(S.Undefined, S.String),
    {
      strict: false,
      decode: (input) => {
        if (input === undefined || input === null) return Effect.succeed(undefined as any)
        const trimmed = (input as string).trim()
        return Effect.succeed((trimmed.length === 0 ? undefined : trimmed) as any)
      },
      encode: (value) => Effect.succeed(value as any)
    }
  ),
  S.brand("DocumentPublishNotes")
)

export type DocumentPublishNotes = S.Schema.Type<typeof DocumentPublishNotes>
