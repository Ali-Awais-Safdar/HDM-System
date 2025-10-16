import { Schema as S } from "effect"

/**
 * Helper for optional schema fields that accepts null/undefined 
 * and transforms to Option<T>.
 * 
 * Encoding convention: Option.none() → undefined (consistent external representation)
 * Decoding convention: null/undefined → Option.none()
 */
export const Optional = <A, I, R>(schema: S.Schema<A, I, R>) =>
  S.OptionFromNullishOr(schema as unknown as S.Schema<A, I, never>, undefined)

