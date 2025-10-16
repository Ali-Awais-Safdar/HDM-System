import { Schema as S, Effect, Clock } from "effect"
import { DateTimeFromString } from "@domain/refined/date-time"
import { Optional } from "@domain/utils/schema.utils"

/**
 * AuditTrail value object to standardize createdAt/updatedAt handling.
 * - createdAt: Date (required)
 * - updatedAt: Option<Date> (none means never updated)
 */
export const AuditTrail = S.Struct({
  createdAt: DateTimeFromString,
  updatedAt: Optional(DateTimeFromString)
})
export type AuditTrail = S.Schema.Type<typeof AuditTrail>

export const getCurrentTime = (): Effect.Effect<Date, never, Clock.Clock> =>
  Clock.currentTimeMillis.pipe(
    Effect.map((timestamp) => new Date(timestamp))
  )