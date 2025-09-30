import { UserId, DocumentId } from "../../shared/types/brand";
import { UserRole } from "../entities/user.entity";
import { Permission } from "../entities/permission.entity"
import { PermissionLevel } from "../schema/permission.schema";

/**
 * Document access context for authorization decisions.
 */
export interface DocumentAccessContext {
  /** The user requesting access */
  userId: UserId;
  /** The user's role */
  userRole: UserRole;
  /** The document being accessed */
  documentId: DocumentId;
  /** The owner of the document */
  documentOwnerId: UserId;
  /** Explicit permissions granted to the user for this document */
  userPermissions: Permission[];
}

/**
 * Result of document access authorization.
 */
export interface DocumentAccessResult {
  /** Whether access is granted */
  granted: boolean;
  /** Reason for the decision (for logging/debugging) */
  reason: string;
  /** The effective permission level granted */
  effectiveLevel?: PermissionLevel;
}

/**
 * Pure function policy for document access authorization.
 * 
 * Authorization Rules (in order of precedence):
 * 1. Admins have full access to all documents
 * 2. Document owners have full access to their own documents
 * 3. Users with explicit permissions have access according to their permission level
 * 4. All other access is denied
 * 
 * This is a pure function with no side effects, making it easily testable
 * and framework-independent as per domain best practices.
 */
export class DocumentAccessPolicy {
  /**
   * Determines if a user can access a document with the required permission level.
   */
  static canAccess(
    context: DocumentAccessContext,
    requiredLevel: PermissionLevel
  ): DocumentAccessResult {
    // Rule 1: Admins bypass all permission checks
    if (context.userRole === "admin") {
      return {
        granted: true,
        reason: "Admin role bypasses all permission checks",
        effectiveLevel: "admin"
      };
    }

    // Rule 2: Document owners have full access
    if (context.userId === context.documentOwnerId) {
      return {
        granted: true,
        reason: "Document owner has full access",
        effectiveLevel: "admin"
      };
    }

    // Rule 3: Check explicit permissions
    if (context.userPermissions.length > 0) {
      // Find the highest permission level granted to the user
      const highestPermission = context.userPermissions.reduce((highest, current) => {
        const levels: Record<PermissionLevel, number> = { read: 1, write: 2, admin: 3 };
        return levels[current.level] > levels[highest.level] ? current : highest;
      });

      if (highestPermission.grantsAccess(requiredLevel)) {
        return {
          granted: true,
          reason: `Explicit permission grants ${highestPermission.level} access`,
          effectiveLevel: highestPermission.level
        };
      }

      return {
        granted: false,
        reason: `Insufficient permission: has ${highestPermission.level}, requires ${requiredLevel}`,
      };
    }

    // Rule 4: Default deny
    return {
      granted: false,
      reason: "No explicit permissions found and user is not owner or admin",
    };
  }

  /**
   * Checks if a user can read a document.
   */
  static canRead(context: DocumentAccessContext): DocumentAccessResult {
    return this.canAccess(context, "read");
  }

  /**
   * Checks if a user can write/modify a document.
   */
  static canWrite(context: DocumentAccessContext): DocumentAccessResult {
    return this.canAccess(context, "write");
  }

  /**
   * Checks if a user can administer a document (share, delete, etc.).
   */
  static canAdmin(context: DocumentAccessContext): DocumentAccessResult {
    return this.canAccess(context, "admin");
  }

  /**
   * Checks if a user can share/grant permissions for a document.
   * Only document owners and admins can share documents.
   */
  static canShare(context: DocumentAccessContext): DocumentAccessResult {
    // Sharing requires admin-level access to the document
    return this.canAdmin(context);
  }

  /**
   * Gets the effective permission level for a user on a document.
   * Returns null if the user has no access.
   */
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
