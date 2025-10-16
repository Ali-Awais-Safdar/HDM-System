import { Effect, Schema as S } from "effect"

/**
 * DocumentDescription value object with validation rules
 * - Optional string
 * - Maximum 1000 characters when present
 * - Trimmed whitespace
 * - Empty string becomes undefined
 */
export const DocumentDescription = S.String.pipe(
  S.filter(
    (value) => {
      if (typeof value !== 'string') return false
      const trimmed = value.trim()
      return trimmed.length === 0 || trimmed.length <= 1000
    },
    { message: () => "Document description must be empty or 1-1000 characters" }
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
  )
)

export type DocumentDescription = S.Schema.Type<typeof DocumentDescription>
