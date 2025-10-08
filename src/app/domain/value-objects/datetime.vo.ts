import { Schema as S } from "effect"

export const DateTime = S.Date // domain type stays Date
export type DateTime = S.Schema.Type<typeof DateTime>

// For JSON/string transports you can add:
export const DateTimeIso = S.transform(S.String, S.Date, {
  decode: (s) => new Date(s),
  encode: (_toI: string, toA: Date) => toA.toISOString(),
  strict: false
})

// Factory functions for creating DateTime values from unknown input using Effect pipeline
export const makeDateTime = (input: unknown) => S.decodeUnknown(DateTime)(input)
export const makeDateTimeFromIso = (input: unknown) => S.decodeUnknown(DateTimeIso)(input)
