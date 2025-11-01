import { Effect as E } from "effect"
import type { DatabaseInterface } from "@infra/db/interfaces"
import { DatabaseError, DomainError } from "@domain/utils/base.errors"

export const withTransaction = <A, E = never>(
  db: DatabaseInterface,
  run: (tx: unknown) => Promise<A>
): E.Effect<A, E | DatabaseError, never> => {
  return E.tryPromise({
    try: async () => db.transaction(async (tx) => run(tx)),
    catch: (error) => {
      if (error instanceof DomainError) {
        return error as unknown as E
      }
      // Only wrap unknown failures in DatabaseError
      return new DatabaseError(
        "Database transaction failed",
        { originalError: error }
      )
    }
  })
}


