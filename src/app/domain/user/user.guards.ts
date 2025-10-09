import { Schema as S } from "effect"
import type { User } from "@domain/user/user.schema"
import { Role } from "@domain/accessPolicy/access-policy.schema"

/**
 * User domain guards for validation.
 * Guards can be used both in schemas and in domain logic.
 */
export class UserGuards {
  /**
   * Validates that a user has at least one role and all roles are valid.
   * Used in UserSchema to ensure data integrity at the schema level.
   */
  static readonly ValidRoles = S.filter(
    (roles: readonly Role[]) => roles.length > 0 && roles.every(role => role === "ADMIN" || role === "USER"),
    { message: () => "User must have at least one valid role" }
  )

  /**
   * Validates a single role value.
   */
  static isValidRole(role: string): boolean {
    return role === "ADMIN" || role === "USER"
  }

  /**
   * Checks if a user has admin privileges.
   */
  static isAdmin(user: User): boolean {
    return user.roles.includes("ADMIN" as Role)
  }

  /**
   * Checks if a user has a specific role.
   */
  static hasRole(user: User, role: Role): boolean {
    return user.roles.includes(role)
  }

  /**
   * Checks if a user can manage other users.
   */
  static canManageUsers(user: User): boolean {
    return UserGuards.isAdmin(user)
  }
}

// Export convenience functions for backward compatibility
export const isAdmin = (u: User): boolean => UserGuards.isAdmin(u)
export const hasRole = (u: User, role: Role): boolean => UserGuards.hasRole(u, role)
export const canManageUsers = (u: User): boolean => UserGuards.canManageUsers(u)
