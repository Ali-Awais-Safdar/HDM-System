import { eq } from "drizzle-orm";
import { Result, ok, err } from "../../../shared/result/result";
import { User, UserRole } from "../../../domain/entities/user.entity";
import { UserRepository } from "../../../domain/services/auth.service";
import { UserId, EmailAddress, asUserId, asEmailAddress } from "../../../shared/types/brand";
import { users } from "../../../lib/db/schema";

/**
 * Drizzle ORM implementation of the User Repository.
 * Handles database operations for users.
 */
export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: any) {} // TODO: Type this properly with Drizzle DB type

  async findById(id: UserId): Promise<Result<User | null, Error>> {
    try {
      const result = await this.db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (result.length === 0) {
        return ok(null);
      }

      const userRow = result[0];
      const user = this.mapToUser(userRow);
      return ok(user);
    } catch {
      return err(new Error("Failed to find user by ID"));
    }
  }

  async findByEmail(email: EmailAddress): Promise<Result<User | null, Error>> {
    try {
      const result = await this.db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (result.length === 0) {
        return ok(null);
      }

      const userRow = result[0];
      const user = this.mapToUser(userRow);
      return ok(user);
    } catch {
      return err(new Error("Failed to find user by email"));
    }
  }

  async save(user: User): Promise<Result<User, Error>> {
    try {
      // Check if user exists
      const existingResult = await this.findById(user.id);
      if (!existingResult.ok) {
        return err(existingResult.error);
      }

      const userRow = {
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        role: user.role,
        createdAt: user.createdAt
      };

      if (existingResult.value === null) {
        // Insert new user
        await this.db.insert(users).values(userRow);
      } else {
        // Update existing user
        await this.db
          .update(users)
          .set({
            email: userRow.email,
            passwordHash: userRow.passwordHash,
            role: userRow.role
          })
          .where(eq(users.id, user.id));
      }

      return ok(user);
    } catch {
      return err(new Error("Failed to save user"));
    }
  }

  async delete(id: UserId): Promise<Result<void, Error>> {
    try {
      await this.db.delete(users).where(eq(users.id, id));
      return ok(undefined);
    } catch {
      return err(new Error("Failed to delete user"));
    }
  }

  private mapToUser(row: any): User {
    return new User(
      asUserId(row.id),
      asEmailAddress(row.email),
      row.passwordHash,
      row.role as UserRole,
      row.createdAt
    );
  }
}
