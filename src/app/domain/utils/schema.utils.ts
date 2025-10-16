import { Schema as S, Option } from "effect"

/**
 * Helper for optional schema fields that accepts null/undefined 
 * and transforms to Option<T>.
 * 
 * Encoding convention: Option.none() → undefined (consistent external representation)
 * Decoding convention: null/undefined → Option.none()
 */
export const Optional = <A, I, R>(schema: S.Schema<A, I, R>) => {
  const decodeInner = S.decodeUnknownSync(schema as unknown as S.Schema<A, I, never>)
  const encodeInner = S.encodeSync(schema as unknown as S.Schema<A, I, never>)
  const Encoded = S.encodedSchema(schema as unknown as S.Schema<A, I, never>)
  const Typed = S.typeSchema(schema as unknown as S.Schema<A, I, never>)

  return S.Union(S.Null, S.Undefined, Encoded).pipe(
    S.transform(S.OptionFromSelf(Typed), {
      strict: false,
      decode: (input) => (input == null ? Option.none() : Option.some(decodeInner(input as unknown as I) as unknown as A)),
      encode: (option) => (Option.isNone(option) ? (undefined) : (encodeInner(option.value as unknown as A)))
    })
  )
}

