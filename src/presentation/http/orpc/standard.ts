import { Schema as S } from "effect"
import type { StandardSchemaV1 } from "@standard-schema/spec"

/**
 * Convert Effect Schema to Standard Schema v1
 */
export const toStandard = <A, I, R = never>(
  schema: S.Schema<A, I, R>
): StandardSchemaV1<I, I> => {
  return S.standardSchemaV1(S.encodedSchema(schema))
}

