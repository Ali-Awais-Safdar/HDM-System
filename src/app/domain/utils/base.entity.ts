import { Effect, ParseResult, Schema as S } from "effect"

export interface IEntity<TId = string> {
  readonly id: TId
  readonly createdAt: Date
  readonly updatedAt: Date | null
}

export type SerializedEntity<TSchema extends S.Schema<any, any, any>> =
  S.Schema.Encoded<TSchema>

export abstract class BaseEntity implements IEntity {
  private _id!: any
  private _createdAt!: Date
  private _updatedAt!: Date | null

  protected constructor() {}

  get id() { return this._id }
  get createdAt() { return this._createdAt }
  get updatedAt() { return this._updatedAt }

  protected _fromSerialized(
    meta: Pick<IEntity, "id" | "createdAt" | "updatedAt">
  ): void {
    this._id = meta.id
    this._createdAt = meta.createdAt
    this._updatedAt = meta.updatedAt
  }

  serialized<TSchema extends S.Schema<any, any, any>>(
    schema: TSchema
  ): Effect.Effect<SerializedEntity<TSchema>, ParseResult.ParseError, never> {
    return S.encode(schema)(this as unknown as object) as Effect.Effect<
      SerializedEntity<TSchema>,
      ParseResult.ParseError,
      never
    >
  }
}
