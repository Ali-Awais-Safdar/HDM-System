import { Effect } from "effect"

export const require = <E>(predicate: boolean, error: () => E): Effect.Effect<void, E, never> =>
  predicate ? Effect.void : Effect.fail(error())