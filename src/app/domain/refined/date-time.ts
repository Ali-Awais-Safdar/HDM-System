import { Schema as S } from "effect"

// DateTime schema that works with Date objects directly
export const DateTime = S.instanceOf(Date).pipe(S.brand("DateTime"))
export type DateTime = S.Schema.Type<typeof DateTime>

export const DateTimeIso = S.transform(S.String, DateTime, {
  decode: (value) => new Date(value),
  encode: (value) => value.toISOString(),
  strict: false
})
export type DateTimeIso = S.Schema.Type<typeof DateTimeIso>

export const DateTimeEpoch = S.transform(S.Number, DateTime, {
  decode: (epoch) => new Date(epoch),
  encode: (_toI: unknown, value: S.Schema.Type<typeof DateTime>) => value.getTime(),
  strict: false
})
export type DateTimeEpoch = S.Schema.Type<typeof DateTimeEpoch>

export const DateTimeFromString = S.transform(S.String, DateTime, {
  decode: (input) => new Date(input),
  encode: (date) => date.toISOString(),
  strict: false
})
export type DateTimeFromString = S.Schema.Type<typeof DateTimeFromString>

export const makeDateTime = (input: unknown) => S.decodeUnknown(DateTime)(input)
export const makeDateTimeFromIso = (input: unknown) =>
  S.decodeUnknown(DateTimeIso)(input)
export const makeDateTimeFromEpoch = (input: unknown) =>
  S.decodeUnknown(DateTimeEpoch)(input)
export const makeDateTimeFromString = (input: unknown) =>
  S.decodeUnknown(DateTimeFromString)(input)
