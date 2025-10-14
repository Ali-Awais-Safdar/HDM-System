import { Schema as S } from "effect"

export const DownloadTokenString = S.String.pipe(
  S.filter((value) => {
    if (typeof value !== "string") return false
    const trimmed = value.trim()
    const re = /^[A-Za-z0-9_-]+$/
    return trimmed.length >= 32 && trimmed.length <= 64 && re.test(trimmed)
  }, { message: () => "Token must be URL-safe base64 (32-64 chars)" }),
  S.transform(S.String, {
    decode: (input) => input.trim(),
    encode: (value) => value
  }),
  S.brand("DownloadTokenString")
)
export type DownloadTokenString = S.Schema.Type<typeof DownloadTokenString>


