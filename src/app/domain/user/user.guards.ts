import { Schema as S } from "effect"
import type { User } from "@domain/user/user.schema"
import { Role } from "@domain/accessPolicy/access-policy.schema"


export class UserGuards {

  static readonly ValidRoles = S.filter(
    (roles: readonly Role[]) => roles.length > 0 && roles.every(role => role === "ADMIN" || role === "USER"),
    { message: () => "User must have at least one valid role" }
  )

  static isAdmin(user: User): boolean {
    return user.roles.includes("ADMIN" as Role)
  }
}
