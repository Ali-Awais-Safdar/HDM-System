import { Effect, Clock } from "effect"
import { mapToORPCError } from "./error-map"

/**
 * Effect Adapter for oRPC Handlers
 * 
 * Centralizes Effect execution and error handling:
 * 1. Provides Clock service automatically
 * 2. Maps errors in the Effect channel using Effect.mapError
 * 3. Maps Effect errors to ORPCError
 * 4. Executes the Effect and returns a Promise
 */
export const executeEffect = async <A>(
  effect: Effect.Effect<A, unknown, Clock.Clock>
): Promise<A> => {
  const runnable = effect.pipe(
    Effect.provideService(Clock.Clock, Clock.make()),
    Effect.mapError(mapToORPCError)
  )

  return Effect.runPromise(runnable)
}