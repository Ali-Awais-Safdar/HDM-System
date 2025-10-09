import { Effect, ParseResult, Schema as S } from "effect"

export interface IEntity<TId = string> {
  readonly id: TId
  readonly createdAt: Date
  readonly updatedAt: Date | null
}

export type SerializedEntity<TSchema extends S.Schema<any, any, any>> =
  S.Schema.Encoded<TSchema>

export abstract class BaseEntity<
  TSchema extends S.Schema<any, any, any>,
  TRuntime
> {
  protected constructor(
    protected readonly schema: TSchema,
    protected readonly runtime: TRuntime
  ) {}

  protected get data(): TRuntime {
    return this.runtime
  }

  toWireFormat(): TRuntime {
    return this.runtime
  }

  toPlainObject(): Record<string, unknown> {
    return { ...(this.runtime as Record<string, unknown>) }
  }

  serialized(): Effect.Effect<
    SerializedEntity<TSchema>,
    ParseResult.ParseError,
    never
  > {
    return S.encode(this.schema)(this.runtime) as Effect.Effect<
      SerializedEntity<TSchema>,
      ParseResult.ParseError,
      never
    >
  }
}
