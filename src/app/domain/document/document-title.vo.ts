import { Schema as S } from "effect"

/**
 * DocumentTitle value object with validation rules
 * - Non-empty string
 * - Maximum 255 characters
 * - Trimmed whitespace
 * - No leading/trailing spaces
 */
export const DocumentTitle = S.String.pipe(
  S.filter(
    (value) => {
      if (typeof value !== 'string') return false
      const trimmed = value.trim()
      return trimmed.length > 0 && trimmed.length <= 255
    },
    { message: () => "Document title must be 1-255 characters and cannot be empty" }
  ),
  S.transform(
    S.String,
    {
      decode: (input) => input.trim(),
      encode: (value) => value
    }
  ),
  S.brand("DocumentTitle")
)

export type DocumentTitle = S.Schema.Type<typeof DocumentTitle>
