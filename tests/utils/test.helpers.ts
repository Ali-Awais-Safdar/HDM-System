import { Effect, Exit, Option } from "effect"

// Effect helpers
export const expectSuccess = <A, E, R>(eff: Effect.Effect<A, E, R>): A => {
  const exit = Effect.runSyncExit(eff as any) as Exit.Exit<A, E>
  if (Exit.isSuccess(exit)) return exit.value
  throw new Error(`Expected success, got failure: ${String((exit as any).cause ?? "unknown")}`)
}

export const expectFailure = <A, E extends { new (...args: any[]): any }, R>(
  eff: Effect.Effect<A, InstanceType<E>, R>,
  errorCtor: E
) => {
  // Flip the effect to get the error value directly
  const error = Effect.runSync(Effect.flip(eff as any)) as unknown
  if (error instanceof (errorCtor as unknown as new (...args: any[]) => any)) return error as InstanceType<E>
  throw new Error(`Expected ${errorCtor.name} but got ${String(error)}`)
}

export const expectAsyncSuccess = async <A, E, R>(eff: Effect.Effect<A, E, R>): Promise<A> => {
  return await (Effect.runPromise(eff as any) as Promise<A>)
}

// Option helpers
export const expectSome = <A>(opt: Option.Option<A>): A => {
  if (Option.isSome(opt)) return opt.value
  throw new Error("Expected Option.some, received Option.none")
}

export const expectNone = <A>(opt: Option.Option<A>): void => {
  if (Option.isNone(opt)) return
  throw new Error("Expected Option.none, received Option.some")
}

export const expectSomeWith = <A>(
  opt: Option.Option<A>,
  predicate: (a: A) => boolean,
  message?: string
): A => {
  const value = expectSome(opt)
  if (!predicate(value)) {
    throw new Error(message ?? "Predicate failed for Option.some value")
  }
  return value
}

export const equals = <A>(a: Option.Option<A>, b: Option.Option<A>): boolean => {
  if (Option.isNone(a) && Option.isNone(b)) return true
  if (Option.isSome(a) && Option.isSome(b)) return a.value === b.value
  return false
}

// Factory scenario helper
export const withFactoryOverrides = <T>(
  base: T,
  overrides?: Partial<T>
): T => ({ ...base, ...(overrides ?? {}) })


