import { Effect, ParseResult, Schema as S, Clock } from "effect"
import { getCurrentTime } from "@domain/utils/audit-trail"

/**
 * Generic helper to encode an entity using a schema, merge a delta, and recreate via a constructor.
 */
export function encodeModifyRecreate<
  A, I, R,
  Entity,
  DomainErr,
  Req = never
>(
  schema: S.Schema<A, I, R>,
  current: unknown,
  delta: Partial<I>,
  onEncodeError: (error: ParseResult.ParseError) => DomainErr,
  create: (input: I) => Effect.Effect<Entity, DomainErr, Req>
): Effect.Effect<Entity, DomainErr, Req> {
  return (
    S.encode(schema)(current as A) as Effect.Effect<I, ParseResult.ParseError, never>
  ).pipe(
    Effect.mapError(onEncodeError),
    Effect.flatMap((encoded) => create({ ...(encoded as any), ...(delta as any) }))
  )
}


/**
 * Helper to apply a mutation that should also stamp updatedAt with current time.
 */
export function applyMutationWithTimestamp<
  A, I, R,
  Entity,
  DomainErr
>(
  schema: S.Schema<A, I, R>,
  current: unknown,
  makeDelta: (now: Date) => Partial<I>,
  onEncodeError: (error: ParseResult.ParseError) => DomainErr,
  create: (input: I) => Effect.Effect<Entity, DomainErr, Clock.Clock>
): Effect.Effect<Entity, DomainErr, Clock.Clock> {
  return getCurrentTime().pipe(
    Effect.flatMap((now) =>
      encodeModifyRecreate(
        schema,
        current,
        { ...(makeDelta(now) as any), updatedAt: now } as Partial<I>,
        onEncodeError,
        create
      ) as Effect.Effect<Entity, DomainErr, Clock.Clock>
    )
  )
}

/**
 * Variant of applyMutationWithTimestamp that uses a provided `now` timestamp.
 * Useful when the caller already acquired the time and wants to avoid a second read.
 */
export function applyMutationWithProvidedTimestamp<
  A, I, R,
  Entity,
  DomainErr
>(
  schema: S.Schema<A, I, R>,
  current: unknown,
  now: Date,
  makeDelta: (now: Date) => Partial<I>,
  onEncodeError: (error: ParseResult.ParseError) => DomainErr,
  create: (input: I) => Effect.Effect<Entity, DomainErr, Clock.Clock>
): Effect.Effect<Entity, DomainErr, Clock.Clock> {
  return encodeModifyRecreate(
    schema,
    current,
    { ...(makeDelta(now) as any), updatedAt: now } as Partial<I>,
    onEncodeError,
    create
  ) as Effect.Effect<Entity, DomainErr, Clock.Clock>
}

export function serializeWith<A, I, R>(
  schema: S.Schema<A, I, R>,
  value: A
) {
  return S.encode(schema)(value) as Effect.Effect<I, ParseResult.ParseError, never>
}

