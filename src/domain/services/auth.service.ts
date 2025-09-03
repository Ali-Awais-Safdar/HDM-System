import { User, UserRole } from "../entities/user.entity";
import { Email } from "../value-objects/email.vo";
import { Password } from "../value-objects/password.vo";
import { UserId, newUserId } from "../../shared/types/brand";
import { Result, ok, err } from "../../shared/result/result";

/**
 * Domain service for authentication business logic.
 * Handles user creation and authentication rules.
 */
export class AuthService {
  constructor(
    private readonly passwordHasher: PasswordHasher,
    private readonly userRepository: UserRepository
  ) {}

  async signup(
    email: Email, 
    password: Password, 
    role: UserRole = "user"
  ): Promise<Result<User, AuthError>> {
    // Check if user already exists
    const existingUserResult = await this.userRepository.findByEmail(email.value);
    if (!existingUserResult.ok) {
      return err(new AuthError("Failed to check existing user"));
    }

    if (existingUserResult.value !== null) {
      return err(new AuthError("User already exists with this email"));
    }

    // Hash password
    const hashedPasswordResult = await this.passwordHasher.hash(password.value);
    if (!hashedPasswordResult.ok) {
      return err(new AuthError("Failed to process password"));
    }

    // Create new user
    const userId = newUserId();
    const user = User.create({
      id: userId,
      email: email.value,
      passwordHash: hashedPasswordResult.value,
      role
    });

    // Save user
    const saveResult = await this.userRepository.save(user);
    if (!saveResult.ok) {
      return err(new AuthError("Failed to create user"));
    }

    return ok(saveResult.value);
  }

  async login(
    email: Email, 
    password: Password
  ): Promise<Result<User, AuthError>> {
    // Find user by email
    const userResult = await this.userRepository.findByEmail(email.value);
    if (!userResult.ok) {
      return err(new AuthError("Authentication failed"));
    }

    if (userResult.value === null) {
      return err(new AuthError("Invalid credentials"));
    }

    const user = userResult.value;

    // Verify password
    const isValidResult = await this.passwordHasher.verify(password.value, user.passwordHash);
    if (!isValidResult.ok || !isValidResult.value) {
      return err(new AuthError("Invalid credentials"));
    }

    return ok(user);
  }

  async createAdminUser(
    email: Email,
    password: Password
  ): Promise<Result<User, AuthError>> {
    return this.signup(email, password, "admin");
  }
}

// Domain interfaces (ports)
export interface PasswordHasher {
  hash(password: string): Promise<Result<string, Error>>;
  verify(password: string, hash: string): Promise<Result<boolean, Error>>;
}

export interface UserRepository {
  findById(id: UserId): Promise<Result<User | null, Error>>;
  findByEmail(email: import("../../shared/types/brand").EmailAddress): Promise<Result<User | null, Error>>;
  save(user: User): Promise<Result<User, Error>>;
  delete(id: UserId): Promise<Result<void, Error>>;
}

// Domain errors
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
