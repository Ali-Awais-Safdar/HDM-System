import { Schema as S } from "effect"

export const DateTime = S.Date.pipe(S.brand("DateTime"))
export type DateTime = S.Schema.Type<typeof DateTime>

export const DateTimeIso = S.transform(S.String, DateTime, {
  decode: (value) => new Date(value),
  encode: (_toI: string, value: Date) => value.toISOString(),
  strict: false
})
export type DateTimeIso = S.Schema.Type<typeof DateTimeIso>

export const DateTimeEpoch = S.transform(S.Number, DateTime, {
  decode: (epoch) => new Date(epoch),
  encode: (_toI: unknown, value: S.Schema.Type<typeof DateTime>) => value.getTime(),
  strict: false
})
export type DateTimeEpoch = S.Schema.Type<typeof DateTimeEpoch>

export const DateTimeFromAny = S.transform(S.Unknown, DateTime, {
  decode: (input) => {
    if (input instanceof Date) return input
    if (typeof input === 'string') return new Date(input)
    if (typeof input === 'number') return new Date(input)
    throw new Error(`Cannot convert ${typeof input} to Date`)
  },
  encode: (date) => date,
  strict: false
})
export type DateTimeFromAny = S.Schema.Type<typeof DateTimeFromAny>

export const makeDateTime = (input: unknown) => S.decodeUnknown(DateTime)(input)
export const makeDateTimeFromIso = (input: unknown) =>
  S.decodeUnknown(DateTimeIso)(input)
export const makeDateTimeFromEpoch = (input: unknown) =>
  S.decodeUnknown(DateTimeEpoch)(input)
export const makeDateTimeFromAny = (input: unknown) =>
  S.decodeUnknown(DateTimeFromAny)(input)
