import { Schema as S, Option, Effect, Clock } from "effect"
import { DateTimeFromAny } from "@domain/refined/date-time"

/**
 * AuditTrail value object to standardize createdAt/updatedAt handling.
 * - createdAt: Date (required)
 * - updatedAt: Option<Date> (none means never updated)
 */
export const AuditTrail = S.Struct({
  createdAt: DateTimeFromAny,
  updatedAt: S.Union(S.Null, S.Undefined, DateTimeFromAny).pipe(
    S.transform(S.OptionFromSelf(DateTimeFromAny), {
      decode: (v) => (v == null ? Option.none() : Option.some(v)),
      encode: (opt) => (Option.isNone(opt) ? undefined as any : opt.value),
      strict: false
    })
  )
})
export type AuditTrail = S.Schema.Type<typeof AuditTrail>

export const getCurrentTime = (): Effect.Effect<Date, never, Clock.Clock> =>
  Clock.currentTimeMillis.pipe(
    Effect.map((timestamp) => new Date(timestamp))
  )