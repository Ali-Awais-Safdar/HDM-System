import { Clock, Effect } from "effect"

// Lightweight test clock helper to keep timestamps deterministic in tests.
// Note: Depending on Effect version, a richer TestClock API may be available.

export const withTestClock = <A, E, R>(effect: Effect.Effect<A, E, R>, nowMs: number) => {
  // Provide a minimal Clock service implementation that always returns the provided timestamp.
  const fixedClock: Clock.Clock = {
    currentTimeMillis: Effect.succeed(nowMs)
  } as unknown as Clock.Clock

  // Also override Date.now for libraries that read system time directly in decoding filters
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const originalNow = Date.now
      ;(Date as any).__originalNow = originalNow
      ;(Date as any).now = () => nowMs
    }),
    () => Effect.provideService(effect, Clock.Clock, fixedClock),
    () => Effect.sync(() => {
      if ((Date as any).__originalNow) {
        ;(Date as any).now = (Date as any).__originalNow
        delete (Date as any).__originalNow
      }
    })
  )
}


