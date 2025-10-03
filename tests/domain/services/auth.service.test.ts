import { describe, expect, it, beforeEach } from "vitest";
import { Effect, Option } from "effect";
import { AuthService, AuthError } from "../../../src/domain/services/auth.service";
import { UserEntity } from "../../../src/domain/entities/user.entity";
import { UserRepository } from "../../../src/domain/ports/user.repository";
import { PasswordHasherPort, PasswordHashError } from "../../../src/domain/ports/password-hasher.port";
import { Role } from "../../../src/domain/schema/access-policy.schema";
import { faker } from "@faker-js/faker";
import { TestPatterns } from "../../utils/test.helpers";

/**
 * Auth service-specific test data generators
 */
const authServiceGenerators = {
  email: () => faker.internet.email().toLowerCase(),
  
  password: () => faker.internet.password({ length: 12 }),
  
  passwordHash: (password: string) => {
    const mockSalt = "N9qo8uLOickgx2ZMRZoMyE"
    const passwordCode = Buffer.from(password)
      .toString('base64')
      .replace(/[^A-Za-z0-9]/g, '0')
      .padEnd(31, '0')
      .substring(0, 31); // exactly 31 chars
    return `$2b$10$${mockSalt}${passwordCode}`;
  },
  
  userId: () => crypto.randomUUID(),
};

class MockUserRepository implements UserRepository {
  private users: Map<string, UserEntity> = new Map();

  save(user: UserEntity): Effect.Effect<UserEntity, never> {
    this.users.set(user.email, user);
    return Effect.succeed(user);
  }

  findByEmail(email: string): Effect.Effect<Option.Option<UserEntity>, never> {
    const user = this.users.get(email);
    return Effect.succeed(user ? Option.some(user) : Option.none());
  }

  findById(id: string): Effect.Effect<Option.Option<UserEntity>, never> {
    const user = Array.from(this.users.values()).find(u => u.id === id);
    return Effect.succeed(user ? Option.some(user) : Option.none());
  }

  exists(id: string): Effect.Effect<boolean, never> {
    const user = Array.from(this.users.values()).find(u => u.id === id);
    return Effect.succeed(!!user);
  }

  delete(id: string): Effect.Effect<boolean, never> {
    const user = Array.from(this.users.values()).find(u => u.id === id);
    if (user) {
      this.users.delete(user.email);
      return Effect.succeed(true);
    }
    return Effect.succeed(false);
  }

  // Test helpers
  seedUser(user: UserEntity): void {
    this.users.set(user.email, user);
  }

  clear(): void {
    this.users.clear();
  }

  getUserCount(): number {
    return this.users.size;
  }
}

class MockPasswordHasher extends PasswordHasherPort {
  hash(password: string) {
    return Effect.succeed(authServiceGenerators.passwordHash(password));
  }

  verify(password: string, hash: string) {
    const expectedHash = authServiceGenerators.passwordHash(password);
    return Effect.succeed(hash === expectedHash);
  }
}

describe("AuthService - Domain Service Tests", () => {
  let authService: AuthService;
  let userRepository: MockUserRepository;
  let passwordHasher: MockPasswordHasher;

  beforeEach(() => {
    userRepository = new MockUserRepository();
    passwordHasher = new MockPasswordHasher();
    authService = new AuthService(passwordHasher, userRepository);
  });

  describe("Service Initialization & Dependencies", () => {
    it("should create service with required dependencies", () => {
      expect(authService).toBeInstanceOf(AuthService);
    });

    it("should accept custom password hasher implementation", () => {
      class CustomHasher extends PasswordHasherPort {
        hash(password: string) {
          return Effect.succeed(`custom_${password}`.padEnd(60, '0'));
        }
        verify(_password: string, hash: string) {
          return Effect.succeed(hash.startsWith('custom_'));
        }
      }

      const customService = new AuthService(new CustomHasher(), userRepository);
      expect(customService).toBeInstanceOf(AuthService);
    });
  });

  describe("Service Data Generator Validation", () => {
    it("should generate valid email addresses", () => {
      const emails = Array.from({ length: 10 }, () => authServiceGenerators.email());
      
      emails.forEach(email => {
        expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
        expect(email.toLowerCase()).toBe(email); // Should be lowercase
      });
    });

    it("should generate valid password hashes", () => {
      const passwords = Array.from({ length: 10 }, () => faker.internet.password());
      const hashes = passwords.map(pwd => authServiceGenerators.passwordHash(pwd));
      
      hashes.forEach(hash => {
        expect(hash).toMatch(/^\$2b\$10\$/); // Bcrypt format
        expect(hash.length).toBe(60); // Bcrypt hash length
      });
    });

    it("should generate unique user IDs", () => {
      const ids = Array.from({ length: 20 }, () => authServiceGenerators.userId());
      const uniqueIds = new Set(ids);
      
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("Signup - User Registration", () => {
    it("should successfully register new user", async () => {
      const email = authServiceGenerators.email();
      const password = authServiceGenerators.password();

      const user = await TestPatterns.Effect.expectAsyncSuccess(
        authService.signup(email as any, password as any)
      );

      expect(user).toBeInstanceOf(UserEntity);
      expect(user.email).toBe(email);
      expect(user.passwordHash).toMatch(/^\$2b\$10\$/);
      expect(user.roles).toContain("USER");
      expect(userRepository.getUserCount()).toBe(1);
    });

    it("should register user with default USER role", async () => {
      const email = authServiceGenerators.email();
      const password = authServiceGenerators.password();

      const user = await TestPatterns.Effect.expectAsyncSuccess(
        authService.signup(email as any, password as any)
      );

      expect(user.roles).toEqual(["USER"]);
      expect(user.isAdminUser).toBe(false);
    });

    it("should register user with custom roles", async () => {
      const email = authServiceGenerators.email();
      const password = authServiceGenerators.password();
      const roles: readonly Role[] = ["ADMIN" as Role];

      const user = await TestPatterns.Effect.expectAsyncSuccess(
        authService.signup(email as any, password as any, roles)
      );

      expect(user.roles).toContain("ADMIN");
      expect(user.isAdminUser).toBe(true);
    });

    it("should hash password before saving", async () => {
      const email = authServiceGenerators.email();
      const password = authServiceGenerators.password();

      const user = await TestPatterns.Effect.expectAsyncSuccess(
        authService.signup(email as any, password as any)
      );

      expect(user.passwordHash).not.toBe(password);
      expect(user.passwordHash).toMatch(/^\$2b\$10\$/);
      expect(user.passwordHash.length).toBe(60);
    });

    it("should fail if user already exists", async () => {
      const email = authServiceGenerators.email();
      const password = authServiceGenerators.password();

      await TestPatterns.Effect.expectAsyncSuccess(
        authService.signup(email as any, password as any)
      );

      const error = await TestPatterns.Effect.expectAsyncFailure(
        authService.signup(email as any, password as any),
        AuthError
      );

      expect(error).toBeInstanceOf(AuthError);
      expect(error.message).toContain("already exists");
      expect(userRepository.getUserCount()).toBe(1);
    });

    it("should handle multiple unique user signups", async () => {
      const users = Array.from({ length: 3 }, () => ({
        email: authServiceGenerators.email(),
        password: authServiceGenerators.password()
      }));

      for (const { email, password } of users) {
        const user = await TestPatterns.Effect.expectAsyncSuccess(
          authService.signup(email as any, password as any)
        );
        expect(user.email).toBe(email);
      }

      expect(userRepository.getUserCount()).toBe(3);
    });

    it("should generate unique IDs for each user", async () => {
      const user1 = await TestPatterns.Effect.expectAsyncSuccess(
        authService.signup(authServiceGenerators.email() as any, authServiceGenerators.password() as any)
      );

      const user2 = await TestPatterns.Effect.expectAsyncSuccess(
        authService.signup(authServiceGenerators.email() as any, authServiceGenerators.password() as any)
      );

      expect(user1.id).not.toBe(user2.id);
    });

    it("should set createdAt timestamp on signup", async () => {
      const beforeSignup = new Date();
      
      const user = await TestPatterns.Effect.expectAsyncSuccess(
        authService.signup(authServiceGenerators.email() as any, authServiceGenerators.password() as any)
      );

      const afterSignup = new Date();

      expect(user.createdAt.getTime()).toBeGreaterThanOrEqual(beforeSignup.getTime());
      expect(user.createdAt.getTime()).toBeLessThanOrEqual(afterSignup.getTime());
    });
  });

  describe("Login - User Authentication", () => {
    const testEmail = authServiceGenerators.email();
    const testPassword = authServiceGenerators.password();

    beforeEach(async () => {
      await TestPatterns.Effect.expectAsyncSuccess(
        authService.signup(testEmail as any, testPassword as any)
      );
    });

    it("should successfully authenticate with correct credentials", async () => {
      const user = await TestPatterns.Effect.expectAsyncSuccess(
        authService.login(testEmail as any, testPassword as any)
      );

      expect(user).toBeInstanceOf(UserEntity);
      expect(user.email).toBe(testEmail);
    });

    it("should fail with incorrect password", async () => {
      const wrongPassword = authServiceGenerators.password();

      const error = await TestPatterns.Effect.expectAsyncFailure(
        authService.login(testEmail as any, wrongPassword as any),
        AuthError
      );

      expect(error).toBeInstanceOf(AuthError);
      expect(error.message).toContain("Invalid credentials");
    });

    it("should fail with non-existent email", async () => {
      const nonExistentEmail = authServiceGenerators.email();

      const error = await TestPatterns.Effect.expectAsyncFailure(
        authService.login(nonExistentEmail as any, testPassword as any),
        AuthError
      );

      expect(error).toBeInstanceOf(AuthError);
      expect(error.message).toContain("Invalid credentials");
    });

    it("should return same user instance on repeated logins", async () => {
      const login1 = await TestPatterns.Effect.expectAsyncSuccess(
        authService.login(testEmail as any, testPassword as any)
      );

      const login2 = await TestPatterns.Effect.expectAsyncSuccess(
        authService.login(testEmail as any, testPassword as any)
      );

      expect(login1.id).toBe(login2.id);
      expect(login1.email).toBe(login2.email);
    });

    it("should verify password using password hasher", async () => {
      const correctPassword = await TestPatterns.Effect.expectAsyncSuccess(
        authService.login(testEmail as any, testPassword as any)
      );
      expect(correctPassword).toBeInstanceOf(UserEntity);

      await TestPatterns.Effect.expectAsyncFailure(
        authService.login(testEmail as any, "wrongpassword" as any),
        AuthError
      );
    });

    it("should handle concurrent login attempts", async () => {
      const loginPromises = Array.from({ length: 5 }, () =>
        Effect.runPromise(authService.login(testEmail as any, testPassword as any))
      );

      const results = await Promise.all(loginPromises);
      
      results.forEach(user => {
        expect(user.email).toBe(testEmail);
        expect(user).toBeInstanceOf(UserEntity);
      });
    });
  });

  describe("createAdminUser - Admin Registration", () => {
    it("should create user with ADMIN role", async () => {
      const email = authServiceGenerators.email();
      const password = authServiceGenerators.password();

      const admin = await TestPatterns.Effect.expectAsyncSuccess(
        authService.createAdminUser(email as any, password as any)
      );

      expect(admin.roles).toContain("ADMIN");
      expect(admin.isAdminUser).toBe(true);
      expect(admin.isAdmin()).toBe(true);
      expect(admin.canManageUsers()).toBe(true);
    });

    it("should use signup internally", async () => {
      const email = authServiceGenerators.email();
      const password = authServiceGenerators.password();

      const admin = await TestPatterns.Effect.expectAsyncSuccess(
        authService.createAdminUser(email as any, password as any)
      );

      expect(userRepository.getUserCount()).toBe(1);
      expect(admin.email).toBe(email);
    });

    it("should fail if admin user already exists", async () => {
      const email = authServiceGenerators.email();
      const password = authServiceGenerators.password();

      await TestPatterns.Effect.expectAsyncSuccess(
        authService.createAdminUser(email as any, password as any)
      );

      const error = await TestPatterns.Effect.expectAsyncFailure(
        authService.createAdminUser(email as any, password as any),
        AuthError
      );

      expect(error).toBeInstanceOf(AuthError);
      expect(error.message).toContain("already exists");
    });

    it("should create multiple admin users with different emails", async () => {
      const admin1 = await TestPatterns.Effect.expectAsyncSuccess(
        authService.createAdminUser(authServiceGenerators.email() as any, authServiceGenerators.password() as any)
      );

      const admin2 = await TestPatterns.Effect.expectAsyncSuccess(
        authService.createAdminUser(authServiceGenerators.email() as any, authServiceGenerators.password() as any)
      );

      expect(admin1.isAdminUser).toBe(true);
      expect(admin2.isAdminUser).toBe(true);
      expect(userRepository.getUserCount()).toBe(2);
    });
  });

  describe("Integration Scenarios", () => {
    it("should support complete signup and login flow", async () => {
      const email = authServiceGenerators.email();
      const password = authServiceGenerators.password();

      const signedUpUser = await TestPatterns.Effect.expectAsyncSuccess(
        authService.signup(email as any, password as any)
      );

      expect(signedUpUser.email).toBe(email);

      const loggedInUser = await TestPatterns.Effect.expectAsyncSuccess(
        authService.login(email as any, password as any)
      );

      expect(loggedInUser.id).toBe(signedUpUser.id);
      expect(loggedInUser.email).toBe(signedUpUser.email);
    });

    it("should maintain user state across operations", async () => {
      const email = authServiceGenerators.email();
      const password = authServiceGenerators.password();

      const created = await TestPatterns.Effect.expectAsyncSuccess(
        authService.signup(email as any, password as any)
      );

      const login1 = await TestPatterns.Effect.expectAsyncSuccess(
        authService.login(email as any, password as any)
      );

      const login2 = await TestPatterns.Effect.expectAsyncSuccess(
        authService.login(email as any, password as any)
      );

      expect(login1.id).toBe(created.id);
      expect(login2.id).toBe(created.id);
      expect(userRepository.getUserCount()).toBe(1);
    });

    it("should handle mixed user and admin creation", async () => {
      const regularUser = await TestPatterns.Effect.expectAsyncSuccess(
        authService.signup(authServiceGenerators.email() as any, authServiceGenerators.password() as any)
      );

      const adminUser = await TestPatterns.Effect.expectAsyncSuccess(
        authService.createAdminUser(authServiceGenerators.email() as any, authServiceGenerators.password() as any)
      );

      expect(regularUser.isAdminUser).toBe(false);
      expect(adminUser.isAdminUser).toBe(true);
      expect(userRepository.getUserCount()).toBe(2);
    });

    it("should support role-based access checks after creation", async () => {
      const admin = await TestPatterns.Effect.expectAsyncSuccess(
        authService.createAdminUser(authServiceGenerators.email() as any, authServiceGenerators.password() as any)
      );

      const user = await TestPatterns.Effect.expectAsyncSuccess(
        authService.signup(authServiceGenerators.email() as any, authServiceGenerators.password() as any)
      );

      expect(admin.hasRole("ADMIN" as Role)).toBe(true);
      expect(admin.canManageUsers()).toBe(true);

      expect(user.hasRole("ADMIN" as Role)).toBe(false);
      expect(user.canManageUsers()).toBe(false);
      expect(user.hasRole("USER" as Role)).toBe(true);
    });
  });

  describe("Error Handling & Edge Cases", () => {
    it("should handle repository failures gracefully", async () => {
      class FailingRepository extends MockUserRepository {
        save(): Effect.Effect<UserEntity, never> {
          return Effect.die(new Error("Repository failure"));
        }
      }

      const failingService = new AuthService(passwordHasher, new FailingRepository());

      await expect(
        Effect.runPromise(failingService.signup(authServiceGenerators.email() as any, authServiceGenerators.password() as any))
      ).rejects.toThrow();
    });

    it("should handle password hasher failures", async () => {
      class FailingHasher extends PasswordHasherPort {
        hash() {
          return Effect.fail(new PasswordHashError("Hashing failed", "HASH"));
        }
        verify() {
          return Effect.succeed(false);
        }
      }

      const failingService = new AuthService(new FailingHasher(), userRepository);

      const error = await TestPatterns.Effect.expectAsyncFailure(
        failingService.signup(authServiceGenerators.email() as any, authServiceGenerators.password() as any),
        AuthError
      );

      expect(error).toBeInstanceOf(AuthError);
      expect(error.message).toContain("password");
    });

    it("should maintain consistency on partial failures", async () => {
      const email = authServiceGenerators.email();
      const password = authServiceGenerators.password();
      
      await TestPatterns.Effect.expectAsyncSuccess(
        authService.signup(email as any, password as any)
      );

      await TestPatterns.Effect.expectAsyncFailure(
        authService.signup(email as any, "different" as any),
        AuthError
      );

      const user = await TestPatterns.Effect.expectAsyncSuccess(
        authService.login(email as any, password as any)
      );

      expect(user.email).toBe(email);
    });

    it("should handle empty or invalid inputs gracefully", async () => {
      const validEmail = authServiceGenerators.email();
      
      await TestPatterns.Effect.expectAsyncSuccess(
        authService.signup(validEmail as any, "password" as any)
      );

      await TestPatterns.Effect.expectAsyncFailure(
        authService.login(validEmail as any, "" as any),
        AuthError
      );
    });
  });

  describe("Service Boundaries & Isolation", () => {
    it("should not expose internal repository state", async () => {
      const user = await TestPatterns.Effect.expectAsyncSuccess(
        authService.signup(authServiceGenerators.email() as any, authServiceGenerators.password() as any)
      );

      expect(user).toBeInstanceOf(UserEntity);
      expect(user.toPlainObject).toBeDefined();
      expect(user.serialized).toBeDefined();
    });

    it("should enforce domain rules through entities", async () => {
      const user = await TestPatterns.Effect.expectAsyncSuccess(
        authService.signup(authServiceGenerators.email() as any, authServiceGenerators.password() as any, ["USER" as Role])
      );

      expect(user.roles).toContain("USER");
      expect(user.email).toBeDefined();
      expect(user.passwordHash).toBeDefined();
      expect(user.createdAt).toBeInstanceOf(Date);
    });

    it("should maintain transactional consistency", async () => {
      const initialCount = userRepository.getUserCount();

      await TestPatterns.Effect.expectAsyncSuccess(
        authService.signup(authServiceGenerators.email() as any, authServiceGenerators.password() as any)
      );

      await TestPatterns.Effect.expectAsyncSuccess(
        authService.signup(authServiceGenerators.email() as any, authServiceGenerators.password() as any)
      );

      expect(userRepository.getUserCount()).toBe(initialCount + 2);
    });

    it("should not leak password in error messages", async () => {
      const email = authServiceGenerators.email();
      const password = authServiceGenerators.password();
      
      await TestPatterns.Effect.expectAsyncSuccess(
        authService.signup(email as any, password as any)
      );

      const error = await TestPatterns.Effect.expectAsyncFailure(
        authService.signup(email as any, "other" as any),
        AuthError
      );

      expect(error.message).not.toContain(password);
      expect(error.message).not.toContain("other");
    });
  });
});
