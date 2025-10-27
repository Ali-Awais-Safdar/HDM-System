import { Schema as S } from "effect"
import type { StandardSchemaV1 } from "@standard-schema/spec"

export const toStandard = <A, I, R = never>(
  schema: S.Schema<A, I, R>
): StandardSchemaV1<A, I> => {

  return S.standardSchemaV1(schema as S.Schema<A, I, never>) as unknown as StandardSchemaV1<A, I>
}

export const toStandardEncoded = <A, I, R = never>(
  schema: S.Schema<A, I, R>
): StandardSchemaV1<I, I> => {

  const encodedSchema = S.encodedSchema(schema)
  return S.standardSchemaV1(encodedSchema as S.Schema<I, I, never>) as unknown as StandardSchemaV1<I, I>
}

