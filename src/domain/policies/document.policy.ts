import { UserId, DocumentId } from "../../shared/types/brand";
import { UserRole } from "../entities/user.entity";

export type Permission = "read" | "write" | "admin";

export interface DocumentPermissionCheck {
  userId: UserId;
  userRole: UserRole;
  documentId: DocumentId;
  ownerId: UserId;
  directPermission?: Permission;
}

export class DocumentPolicy {
  static canRead(check: DocumentPermissionCheck): boolean {
    // Admin can read everything
    if (check.userRole === "admin") {
      return true;
    }

    // Owner can read their own documents
    if (check.ownerId === check.userId) {
      return true;
    }

    // Check direct permissions
    return this.hasPermission(check.directPermission, ["read", "write", "admin"]);
  }

  static canWrite(check: DocumentPermissionCheck): boolean {
    // Admin can write everything
    if (check.userRole === "admin") {
      return true;
    }

    // Owner can write their own documents
    if (check.ownerId === check.userId) {
      return true;
    }

    // Check direct permissions
    return this.hasPermission(check.directPermission, ["write", "admin"]);
  }

  static canDelete(check: DocumentPermissionCheck): boolean {
    // Admin can delete everything
    if (check.userRole === "admin") {
      return true;
    }

    // Owner can delete their own documents
    if (check.ownerId === check.userId) {
      return true;
    }

    // Check admin permission
    return this.hasPermission(check.directPermission, ["admin"]);
  }

  static canShare(check: DocumentPermissionCheck): boolean {
    // Admin can share everything
    if (check.userRole === "admin") {
      return true;
    }

    // Owner can share their own documents
    if (check.ownerId === check.userId) {
      return true;
    }

    // Check admin permission
    return this.hasPermission(check.directPermission, ["admin"]);
  }

  private static hasPermission(userPermission: Permission | undefined, requiredPermissions: Permission[]): boolean {
    return userPermission !== undefined && requiredPermissions.includes(userPermission);
  }
}

export interface DocumentSearchPolicyInput {
  userId: UserId;
  userRole: UserRole;
}

export class DocumentSearchPolicy {
  static canSearchAll(policy: DocumentSearchPolicyInput): boolean {
    return policy.userRole === "admin";
  }

  static shouldFilterByOwnership(policy: DocumentSearchPolicyInput): boolean {
    return policy.userRole !== "admin";
  }
}
