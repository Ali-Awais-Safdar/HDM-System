import { Effect } from "effect"
import { DomainError } from "../errors/domain.errors"

/**
 * Password hasher error for hashing and verification failures.
 */
export class PasswordHashError extends DomainError {
  readonly _tag = "PasswordHashError" as const
  readonly code = "PASSWORD_HASH_ERROR"
  
  constructor(
    message: string,
    public readonly operation: "HASH" | "VERIFY",
    details?: Record<string, unknown>
  ) {
    super(message, { operation, ...details })
  }
}

/**
 * Password hasher port (interface) for authentication operations.
 */
export abstract class PasswordHasherPort {

  abstract hash(password: string): Effect.Effect<string, PasswordHashError>

  abstract verify(password: string, hash: string): Effect.Effect<boolean, PasswordHashError>
}

