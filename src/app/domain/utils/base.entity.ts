import { Effect, ParseResult, Schema as S } from "effect"
import { ValidationError } from "@domain/utils/base.errors"

export interface IEntity<TId = string> {
  readonly id: TId
  readonly createdAt: Date
  readonly updatedAt: Date | null
}

export type SerializedEntity<TSchema extends S.Schema<any, any, any>> =
  S.Schema.Encoded<TSchema>

export abstract class BaseEntity<
  TRuntime extends IEntity,
  TSchema extends S.Schema<any, any, any>
> implements IEntity<TRuntime["id"]> {
  protected constructor(
    protected readonly schema: TSchema,
    protected readonly props: TRuntime
  ) {
    this.id = props.id
    this.createdAt = props.createdAt
    this.updatedAt = props.updatedAt
  }

  readonly id: TRuntime["id"]
  readonly createdAt: Date
  readonly updatedAt: Date | null

  toWireFormat(): TRuntime {
    return this.props
  }

  toPlainObject(): Record<string, unknown> {
    return { ...this.props } as Record<string, unknown>
  }

  serialized(): Effect.Effect<
    SerializedEntity<TSchema>,
    ParseResult.ParseError,
    never
  > {
    return S.encode(this.schema)(this.props) as Effect.Effect<
      SerializedEntity<TSchema>,
      ParseResult.ParseError,
      never
    >
  }
}

export const _fromSerialized = <
  TRuntime extends IEntity,
  TSchema extends S.Schema<any, any, any>,
  TEntity
>({
  schema,
  ctor,
  entityName
}: {
  schema: TSchema
  ctor: (props: TRuntime) => TEntity
  entityName: string
}) => (input: unknown): Effect.Effect<TEntity, ValidationError, never> =>
  S.decodeUnknown(schema)(input).pipe(
    Effect.map(ctor),
    Effect.mapError(
      (error) =>
        new ValidationError(
          `Invalid ${entityName.toLowerCase()} data: ${
            error instanceof Error ? error.message : String(error)
          }`,
          undefined,
          input
        )
    )
  ) as Effect.Effect<TEntity, ValidationError, never>

export const _serialize = <
  TRuntime extends IEntity,
  TSchema extends S.Schema<any, any, any>
>({
  schema,
  runtime
}: {
  schema: TSchema
  runtime: TRuntime
}): Effect.Effect<
  SerializedEntity<TSchema>,
  ParseResult.ParseError,
  never
> =>
  S.encode(schema)(runtime) as Effect.Effect<
    SerializedEntity<TSchema>,
    ParseResult.ParseError,
    never
  >
