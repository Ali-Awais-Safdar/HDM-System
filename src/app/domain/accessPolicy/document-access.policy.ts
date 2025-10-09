import { AccessPolicyEntity } from "@domain/accessPolicy/access-policy.entity"
import { PermissionLevel, Role } from "@domain/accessPolicy/access-policy.schema"
import { DocumentId, UserId } from "@domain/refined/ids"

export interface DocumentAccessContext {
  userId: UserId;
  roles: readonly Role[];
  documentId: DocumentId;
  documentOwnerId: UserId;
  userPolicies: ReadonlyArray<AccessPolicyEntity>;
}

export interface DocumentAccessResult {
  granted: boolean;
  reason: string;
  effectiveLevel?: PermissionLevel;
}
export class DocumentAccessPolicy {
  static canAccess(
    context: DocumentAccessContext,
    requiredLevel: PermissionLevel
  ): DocumentAccessResult {
    if (context.roles.includes("ADMIN" as Role)) {
      return {
        granted: true,
        reason: "Admin role bypasses all checks",
        effectiveLevel: "admin"
      };
    }

    if (context.userId === context.documentOwnerId) {
      return {
        granted: true,
        reason: "Document owner has full access",
        effectiveLevel: "admin"
      };
    }

    if (context.userPolicies.length > 0) {
      const highestPolicy = context.userPolicies.reduce((highest, current) => {
        const levels: Record<PermissionLevel, number> = { read: 1, write: 2, admin: 3 };
        return levels[current.permissionLevel] > levels[highest.permissionLevel] ? current : highest;
      });

      const levels: Record<PermissionLevel, number> = { read: 1, write: 2, admin: 3 };
      const granted = levels[highestPolicy.permissionLevel] >= levels[requiredLevel];

      if (granted) {
        return {
          granted: true,
          reason: `Policy grants ${highestPolicy.permissionLevel} access`,
          effectiveLevel: highestPolicy.permissionLevel
        };
      }

      return {
        granted: false,
        reason: `Insufficient access: has ${highestPolicy.permissionLevel}, requires ${requiredLevel}`,
      };
    }

    return {
      granted: false,
      reason: "No permissions found and user is not owner or admin",
    };
  }

  static canRead(context: DocumentAccessContext): DocumentAccessResult {
    return this.canAccess(context, "read");
  }

  static canWrite(context: DocumentAccessContext): DocumentAccessResult {
    return this.canAccess(context, "write");
  }

  static canAdmin(context: DocumentAccessContext): DocumentAccessResult {
    return this.canAccess(context, "admin");
  }

  static canShare(context: DocumentAccessContext): DocumentAccessResult {
    return this.canAdmin(context);
  }

  static getEffectivePermissionLevel(context: DocumentAccessContext): PermissionLevel | null {
    const adminResult = this.canAdmin(context);
    if (adminResult.granted) return "admin";

    const writeResult = this.canWrite(context);
    if (writeResult.granted) return "write";

    const readResult = this.canRead(context);
    if (readResult.granted) return "read";

    return null;
  }
}
