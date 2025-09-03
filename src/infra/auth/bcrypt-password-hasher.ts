import bcrypt from "bcrypt";
import { Result, ok, err } from "../../shared/result/result";
import { PasswordHasher } from "../../domain/services/auth.service";

/**
 * Bcrypt implementation of the password hasher.
 * Uses strong salt rounds for security.
 */
export class BcryptPasswordHasher implements PasswordHasher {
  private readonly saltRounds: number;

  constructor(saltRounds: number = 12) {
    this.saltRounds = saltRounds;
  }

  async hash(password: string): Promise<Result<string, Error>> {
    try {
      const hash = await bcrypt.hash(password, this.saltRounds);
      return ok(hash);
    } catch {
      return err(new Error("Failed to hash password"));
    }
  }

  async verify(password: string, hash: string): Promise<Result<boolean, Error>> {
    try {
      const isValid = await bcrypt.compare(password, hash);
      return ok(isValid);
    } catch {
      return err(new Error("Failed to verify password"));
    }
  }
}
