import bcrypt from "bcrypt"
import { Effect } from "effect"
import { PasswordHashError, PasswordHasherPort } from "@application/services/ports/password-hasher.port"
import { env } from "@infra/config/env"

/**
 * Bcrypt implementation of the password hasher port with Effect-based error handling.
 */
export class BcryptPasswordHasher extends PasswordHasherPort {
  private readonly saltRounds: number

  constructor(saltRounds: number = env.BCRYPT_SALT_ROUNDS) {
    super()
    this.saltRounds = saltRounds
  }

  hash(password: string): Effect.Effect<string, PasswordHashError> {
    return Effect.tryPromise({
      try: () => bcrypt.hash(password, this.saltRounds),
      catch: (error) => new PasswordHashError(
        `Failed to hash password: ${error instanceof Error ? error.message : String(error)}`,
        "HASH"
      )
    })
  }

  verify(password: string, hash: string): Effect.Effect<boolean, PasswordHashError> {
    return Effect.tryPromise({
      try: () => bcrypt.compare(password, hash),
      catch: (error) => new PasswordHashError(
        `Failed to verify password: ${error instanceof Error ? error.message : String(error)}`,
        "VERIFY"
      )
    })
  }
}
