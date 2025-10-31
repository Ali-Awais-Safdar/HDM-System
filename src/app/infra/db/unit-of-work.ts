import { Effect as E } from "effect"
import type { DatabaseInterface } from "@infra/db/interfaces"
import { DatabaseError } from "@domain/utils/base.errors"

export const withTransaction = <A>(
  db: DatabaseInterface,
  run: (tx: unknown) => Promise<A>
): E.Effect<A, DatabaseError, never> => {
  return E.tryPromise({
    try: async () => db.transaction(async (tx) => run(tx)),
    catch: (error) => new DatabaseError(
      "Database transaction failed",
      { originalError: error }
    )
  })
}


