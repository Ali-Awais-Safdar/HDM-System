import { Effect as E, pipe } from "effect"
import type { DatabaseInterface } from "@infra/db/interfaces"
import { DomainError } from "@domain/utils/base.errors"
import { translateDbError } from "@infra/db/errors"
import type { InfrastructureErrorType } from "@infra/errors/infrastructure.errors"

export const withTransaction = <A, E = never>(
  db: DatabaseInterface,
  run: (tx: unknown) => Promise<A>
): E.Effect<A, E | InfrastructureErrorType, never> => {
  return pipe(
    E.tryPromise({
    try: async () => db.transaction(async (tx) => run(tx)),
      catch: (error) => error
    }),
    E.catchAll((error): E.Effect<A, E | InfrastructureErrorType, never> => {
      // Pass through domain errors
      if (error instanceof DomainError) {
        return E.fail(error as unknown as E)
      }
      // Translate database errors to infrastructure errors (unexpected errors will fail fast)
      return translateDbError(error, {
        operation: "transaction",
        entityType: "Transaction"
      })
    })
  )
}


