import { Schema as S, Option } from "effect"

/**
 * Helper for optional schema fields that accepts null/undefined 
 * and transforms to Option<T>.
 * 
 * Encoding convention: Option.none() → undefined (consistent external representation)
 * Decoding convention: null/undefined → Option.none()
 */
export const Optional = <A, I = A, R = never>(schema: S.Schema<A, I, R>) =>
  S.Union(schema, S.Undefined, S.Null).pipe(
    S.transform(
      S.OptionFromSelf(schema),
      {
        strict: false,
        decode: (input) => {
          if (input === null || input === undefined) {
            return Option.none()
          }
          return Option.some(input)
        },
        encode: (option) => {
          if (Option.isNone(option)) {
            return undefined as any
          }
          return option.value
        }
      }
    )
  )

