import { Effect } from "effect"

/**
 * Password hasher error for hashing and verification failures.
 */
export class PasswordHashError extends Error {
  readonly _tag = "PasswordHashError" as const
  readonly code = "PASSWORD_HASH_ERROR"
  
  constructor(
    message: string,
    public readonly operation: "HASH" | "VERIFY"
  ) {
    super(message)
    this.name = "PasswordHashError"
  }
}

/**
 * Password hasher port (interface) for authentication operations.
 * This is an application-level port for external password hashing technology.
 */
export abstract class PasswordHasherPort {
  abstract hash(password: string): Effect.Effect<string, PasswordHashError>
  abstract verify(password: string, hash: string): Effect.Effect<boolean, PasswordHashError>
}
