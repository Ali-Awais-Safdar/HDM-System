import { Effect, Schema as S } from "effect"
import { ValidationError } from "../errors/domain.errors"

/**
 * Creates an Effect-based entity from unknown input using a schema.
 */
export const createEntityFromUnknown = <TEntity>(
  schema: S.Schema<any>,
  entityConstructor: (props: any) => TEntity,
  entityName: string
) => (input: unknown): Effect.Effect<TEntity, ValidationError> => {
  return S.decodeUnknown(schema)(input).pipe(
    Effect.map(entityConstructor),
    Effect.mapError((error) =>
      new ValidationError(
        `Invalid ${entityName.toLowerCase()} data: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        input
      )
    )
  )
}

/**
 * Creates an Effect-based entity from validated props using a schema.
 */
export const createEntityFromProps = <TEntity>(
  schema: S.Schema<any>,
  entityConstructor: (props: any) => TEntity,
  entityName: string
) => (props: unknown): Effect.Effect<TEntity, ValidationError> => {
  return S.decodeUnknown(schema)(props).pipe(
    Effect.map(entityConstructor),
    Effect.mapError((error) =>
      new ValidationError(
        `Invalid ${entityName.toLowerCase()} props: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        props
      )
    )
  )
}

/**
 * Standard entity factory interface that all entities should implement.
 */
export interface EntityFactory<TEntity, TProps, TCreateProps = unknown> {

  create: (input: unknown) => Effect.Effect<TEntity, ValidationError>

  createFromProps: (props: TCreateProps) => Effect.Effect<TEntity, ValidationError>
  
  fromPersistence: (input: unknown) => Effect.Effect<TEntity, ValidationError>
  
  unsafe: (props: TProps) => TEntity
}

/**
 * Base entity interface that all entity interfaces should extend.
 */
export interface IEntity {
  readonly id: string
  readonly createdAt: Date
}

/**
 * Standard entity interface that all entities should implement.
 */
export interface Entity<TProps, TEncoded = unknown> {
  /**
   */
  toWireFormat: () => TProps
  
  /**
   * Returns a plain object representation (for APIs)
   */
  toPlainObject: () => Record<string, any>
  
  /**
   * Returns the serialized representation (Effect-based)
   */
  serialized?: () => import("effect").Effect.Effect<TEncoded, import("effect").ParseResult.ParseError, never>
}

/**
 * Helper function to create standard entity factory methods.
 */
export const createEntityFactory = <TEntity, TProps, TCreateProps = unknown>(
  schema: S.Schema<any>,
  entityConstructor: (props: any) => TEntity,
  entityName: string
): EntityFactory<TEntity, TProps, TCreateProps> => {
  const createFromUnknown = createEntityFromUnknown(schema, entityConstructor, entityName)
  const createFromProps = createEntityFromProps(schema, entityConstructor, entityName)
  
  return {
    create: createFromUnknown,
    createFromProps: createFromProps as (props: TCreateProps) => Effect.Effect<TEntity, ValidationError>,
    fromPersistence: createFromUnknown,
    unsafe: entityConstructor
  }
}
