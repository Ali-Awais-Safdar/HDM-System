import { Effect, Schema as S } from "effect"
import { ValidationError } from "../errors/domain.errors"

/**
 * Creates an Effect-based entity from unknown input using a schema.
 * This is the standard pattern for all entity creation from external data.
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
 * This is the standard pattern for creating entities from already validated data.
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
 * This ensures consistent API across all domain entities.
 */
export interface EntityFactory<TEntity, TProps, TCreateProps = unknown> {
  /**
   * Creates entity from unknown input (external data)
   */
  create: (input: unknown) => Effect.Effect<TEntity, ValidationError>
  
  /**
   * Creates entity from validated props (internal use)
   */
  createFromProps: (props: TCreateProps) => Effect.Effect<TEntity, ValidationError>
  
  /**
   * Creates entity from persistence data (database)
   */
  fromPersistence: (input: unknown) => Effect.Effect<TEntity, ValidationError>
  
  /**
   * Unsafe constructor for internal use when data is already validated
   */
  unsafe: (props: TProps) => TEntity
}

/**
 * Base entity interface that all entity interfaces should extend.
 * Provides foundational entity properties and behavior.
 */
export interface IEntity {
  readonly id: string
  readonly createdAt: Date
}

/**
 * Standard entity interface that all entities should implement.
 * This ensures consistent behavior across all domain entities.
 */
export interface Entity<TProps> {
  /**
   * Returns the wire format representation (for external systems)
   */
  toWireFormat: () => TProps
  
  /**
   * Returns a plain object representation (for APIs)
   */
  toPlainObject: () => Record<string, any>
  
  /**
   * Returns the serialized representation (Effect-based)
   */
  serialized?: () => TProps
}

/**
 * Helper function to create standard entity factory methods.
 * This reduces boilerplate and ensures consistency.
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
