import { Schema as S, Effect, Clock } from "effect"

export const ExpiryWindow = (maxWindowMs: number = 24 * 60 * 60 * 1000) =>
  <A, I, R>(schema: S.Schema<A, I, R>) =>
    S.filter((date: Date) => {
      const now = Date.now()
      return date.getTime() > now && date.getTime() <= now + maxWindowMs
    }, { message: () => "Expiry must be in the future and within allowed window" })(schema as any)

export type ExpiryWindow = S.Schema.Type<ReturnType<typeof ExpiryWindow>>

export const isExpiredAt = (expiresAt: Date, clockSkewMs: number = 0): Effect.Effect<boolean, never, Clock.Clock> =>
  Clock.currentTimeMillis.pipe(
    Effect.map((nowMs) => nowMs > expiresAt.getTime() + clockSkewMs)
  )

export const msUntilExpiry = (expiresAt: Date, clockSkewMs: number = 0): Effect.Effect<number, never, Clock.Clock> =>
  Clock.currentTimeMillis.pipe(
    Effect.map((nowMs) => Math.max(0, (expiresAt.getTime() + clockSkewMs) - nowMs))
  )


