import type { User } from "../schema/user.schema"
import { Role } from "../schema/access-policy.schema"

export const isAdmin = (u: User): boolean => u.roles.includes("admin" as Role)

export const hasRole = (u: User, role: Role): boolean => u.roles.includes(role)

export const canManageUsers = (u: User): boolean => isAdmin(u)

export const hasWorkspace = (u: User, workspaceId: string): boolean => 
  u.workspaceIds.includes(workspaceId)
