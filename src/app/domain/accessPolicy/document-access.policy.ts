import { Effect, Option } from "effect"
import { PermissionLevel, Role, PermissionAction } from "@domain/accessPolicy/access-policy.schema"
import { isAtLeast, PermissionLevelOrder, computePermissionLevelSync } from "@domain/accessPolicy/permission-set.vo"
import { DocumentId, UserId } from "@domain/refined/ids"

/**
 * Precedence:
 * 1) Admin (role) and Owner bypass → admin level
 * 2) Highest explicit user policy
 * 3) Highest role policy
 * 4) Default deny
 */

export interface DocumentAccessContext {
  userId: UserId;
  roles: readonly Role[];
  documentId: DocumentId;
  documentOwnerId: UserId;
  userPolicies: ReadonlyArray<{
    subjectType: "user" | "role";
    subjectId?: any;
    role?: Role;
    actions: ReadonlyArray<PermissionAction>;
  }>;
}

export interface DocumentAccessResult {
  granted: boolean;
  reason: string;
  effectiveLevel?: PermissionLevel;
}

export class DocumentAccessPolicy {

  static canAccessE(
    context: DocumentAccessContext,
    requiredLevel: PermissionLevel
  ): Effect.Effect<DocumentAccessResult> {
    // Check if user is admin or owner
    const isAdmin = context.roles.includes("ADMIN" as Role)
    const isOwner = context.userId === context.documentOwnerId

    if (isAdmin || isOwner) {
      return Effect.succeed({
        granted: true,
        reason: isAdmin ? "Admin role bypasses all checks" : "Document owner has full access",
        effectiveLevel: "admin" as const
      })
    }

    // Precedence: explicit user policy > role policy > default deny
    const userPolicies = context.userPolicies.filter((p) => p.subjectType === "user")
    const rolePolicies = context.userPolicies.filter((p) => p.subjectType === "role")

    const highestUserPolicy = userPolicies.length === 0
      ? Option.none<typeof userPolicies[number]>()
      : Option.some(
          userPolicies.reduce((h, c) => {
            const hl = computePermissionLevelSync({ actions: h.actions })
            const cl = computePermissionLevelSync({ actions: c.actions })
            return PermissionLevelOrder[cl] > PermissionLevelOrder[hl] ? c : h
          })
        )

    const result: DocumentAccessResult = Option.match(highestUserPolicy, {
      onSome: (policy) => {
        const level = computePermissionLevelSync({ actions: policy.actions })
        const granted = isAtLeast(level, requiredLevel)
        return {
          granted,
          reason: granted
            ? `User policy grants ${level} access`
            : `User policy insufficient: has ${level}, requires ${requiredLevel}`,
          ...(granted && { effectiveLevel: level })
        }
      },
      onNone: () => {
        const highestRolePolicy = rolePolicies.length === 0
          ? Option.none<typeof rolePolicies[number]>()
          : Option.some(
              rolePolicies.reduce((h, c) => {
                const hl = computePermissionLevelSync({ actions: h.actions })
                const cl = computePermissionLevelSync({ actions: c.actions })
                return PermissionLevelOrder[cl] > PermissionLevelOrder[hl] ? c : h
              })
            )

        return Option.match(highestRolePolicy, {
          onSome: (policy) => {
            const level = computePermissionLevelSync({ actions: policy.actions })
            const granted = isAtLeast(level, requiredLevel)
            return {
              granted,
              reason: granted
                ? `Role policy grants ${level} access`
                : `Role policy insufficient: has ${level}, requires ${requiredLevel}`,
              ...(granted && { effectiveLevel: level })
            }
          },
          onNone: () => ({
            granted: false,
            reason: "No matching user/role policies and not owner/admin"
          })
        })
      }
    })

    return Effect.succeed(result)
  }

  static canAccess(
    context: DocumentAccessContext,
    requiredLevel: PermissionLevel
  ): Effect.Effect<DocumentAccessResult> {
    return DocumentAccessPolicy.canAccessE(context, requiredLevel)
  }

  static canRead(context: DocumentAccessContext): Effect.Effect<DocumentAccessResult> {
    return this.canAccess(context, "read")
  }


  static canWrite(context: DocumentAccessContext): Effect.Effect<DocumentAccessResult> {
    return this.canAccess(context, "write")
  }


  static canAdmin(context: DocumentAccessContext): Effect.Effect<DocumentAccessResult> {
    return this.canAccess(context, "admin")
  }


  static canShare(context: DocumentAccessContext): Effect.Effect<DocumentAccessResult> {
    return this.canAdmin(context)
  }


  static getEffectivePermissionLevel(context: DocumentAccessContext): Effect.Effect<PermissionLevel | null> {
    // Admin or Owner implies admin level
    const isAdmin = context.roles.includes("ADMIN" as Role)
    const isOwner = context.userId === context.documentOwnerId
    if (isAdmin || isOwner) {
      return Effect.succeed("admin" as PermissionLevel)
    }

    const userPolicies = context.userPolicies.filter((p) => p.subjectType === "user")
    if (userPolicies.length > 0) {
      const highestUser = userPolicies.reduce((h, c) => {
        const hl = computePermissionLevelSync({ actions: h.actions })
        const cl = computePermissionLevelSync({ actions: c.actions })
        return PermissionLevelOrder[cl] > PermissionLevelOrder[hl] ? c : h
      })
      return Effect.succeed(computePermissionLevelSync({ actions: highestUser.actions }))
    }

    const rolePolicies = context.userPolicies.filter((p) => p.subjectType === "role")
    if (rolePolicies.length > 0) {
      const highestRole = rolePolicies.reduce((h, c) => {
        const hl = computePermissionLevelSync({ actions: h.actions })
        const cl = computePermissionLevelSync({ actions: c.actions })
        return PermissionLevelOrder[cl] > PermissionLevelOrder[hl] ? c : h
      })
      return Effect.succeed(computePermissionLevelSync({ actions: highestRole.actions }))
    }

    return Effect.succeed(null)
  }
}
