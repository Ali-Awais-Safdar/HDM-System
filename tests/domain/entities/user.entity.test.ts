import { describe, it, expect } from "vitest";
import { User } from "../../../src/domain/entities/user.entity";
import { asUserId, asEmailAddress } from "../../../src/shared/types/brand";

describe("User Entity", () => {
  const validUserId = asUserId("01234567-89ab-cdef-0123-456789abcdef");
  const validEmail = asEmailAddress("test@example.com");
  const validPasswordHash = "hashed_password_123";

  describe("creation", () => {
    it("should create a user with valid properties", () => {
      const user = User.create({
        id: validUserId,
        email: validEmail,
        passwordHash: validPasswordHash,
        role: "user"
      });

      expect(user.id).toBe(validUserId);
      expect(user.email).toBe(validEmail);
      expect(user.passwordHash).toBe(validPasswordHash);
      expect(user.role).toBe("user");
      expect(user.createdAt).toBeInstanceOf(Date);
    });

    it("should create an admin user", () => {
      const user = User.create({
        id: validUserId,
        email: validEmail,
        passwordHash: validPasswordHash,
        role: "admin"
      });

      expect(user.role).toBe("admin");
    });
  });

  describe("role-based permissions", () => {
    it("should identify admin users correctly", () => {
      const adminUser = User.create({
        id: validUserId,
        email: validEmail,
        passwordHash: validPasswordHash,
        role: "admin"
      });

      const regularUser = User.create({
        id: validUserId,
        email: validEmail,
        passwordHash: validPasswordHash,
        role: "user"
      });

      expect(adminUser.isAdmin()).toBe(true);
      expect(regularUser.isAdmin()).toBe(false);
    });

    it("should determine user management permissions", () => {
      const adminUser = User.create({
        id: validUserId,
        email: validEmail,
        passwordHash: validPasswordHash,
        role: "admin"
      });

      const regularUser = User.create({
        id: validUserId,
        email: validEmail,
        passwordHash: validPasswordHash,
        role: "user"
      });

      expect(adminUser.canManageUsers()).toBe(true);
      expect(regularUser.canManageUsers()).toBe(false);
    });
  });
});
