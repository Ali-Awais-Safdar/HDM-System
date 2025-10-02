import bcrypt from "bcrypt";
import { PasswordHasherPort } from "../../domain/ports/password-hasher.port";
import { env } from "../../env/env";

/**
 * Bcrypt implementation of the password hasher port.
 */
export class BcryptPasswordHasher extends PasswordHasherPort {
  private readonly saltRounds: number;

  constructor(saltRounds: number = env.BCRYPT_SALT_ROUNDS) {
    super();
    this.saltRounds = saltRounds;
  }

  async hash(password: string): Promise<string> {
    try {
      return await bcrypt.hash(password, this.saltRounds);
    } catch {
      throw new Error("Failed to hash password");
    }
  }

  async verify(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch {
      throw new Error("Failed to verify password");
    }
  }
}
