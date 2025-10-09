import { Schema as S } from "effect"

const SHA256_RE = /^[a-f0-9]{64}$/i

export const Sha256 = S.String.pipe(
  S.filter((value) => SHA256_RE.test(value), {
    message: () => "Invalid SHA-256 hex"
  }),
  S.brand("Sha256")
)
export type Sha256 = S.Schema.Type<typeof Sha256>

export const makeSha256 = (input: unknown) => S.decodeUnknown(Sha256)(input)
