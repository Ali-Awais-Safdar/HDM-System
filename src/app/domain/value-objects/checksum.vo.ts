import { Schema as S } from "effect"

// 64 hex chars for SHA-256
const SHA256_RE = /^[a-f0-9]{64}$/i

export const Sha256 = S.String.pipe(
  S.filter((s) => SHA256_RE.test(s), { message: () => "Invalid SHA-256 hex" }),
  S.brand("Sha256")
)
export type Sha256 = S.Schema.Type<typeof Sha256>

// Factory function for creating SHA-256 checksums from unknown input using Effect pipeline
export const makeSha256 = (input: unknown) => S.decodeUnknown(Sha256)(input)
