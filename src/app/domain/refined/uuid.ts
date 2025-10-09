import { Schema as S } from "effect"

// Conservative UUID check; adjust if stricter formats are required (v4/v7, etc.)
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const Uuid = S.String.pipe(
  S.filter((value) => UUID_RE.test(value), { message: () => "Invalid UUID" }),
  S.brand("Uuid")
)
export type Uuid = S.Schema.Type<typeof Uuid>

export const makeUuid = (input: unknown) => S.decodeUnknown(Uuid)(input)
export const makeUuidSync = (input: unknown) => S.decodeUnknownSync(Uuid)(input)
