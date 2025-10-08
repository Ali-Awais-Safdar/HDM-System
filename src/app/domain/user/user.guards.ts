import type { User } from "@domain/user/user.schema"
import { Role } from "@domain/accessPolicy/access-policy.schema"

export const isAdmin = (u: User): boolean => u.roles.includes("ADMIN" as Role)

export const hasRole = (u: User, role: Role): boolean => u.roles.includes(role)

export const canManageUsers = (u: User): boolean => isAdmin(u)
