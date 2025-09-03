import { PermissionId, UserId, DocumentId, newPermissionId } from "../../shared/types/brand";

/**
 * Permission level enum representing different access levels.
 * Based on the database enum defined in schema.ts
 */
export type PermissionLevel = "read" | "write" | "admin";

/**
 * Permission domain entity representing document-level access control.
 * 
 * Business Rules:
 * - Each user can have at most one permission per document (enforced by DB unique constraint)
 * - Permission levels are hierarchical: admin > write > read
 * - Document owners have implicit full access regardless of explicit permissions
 * - Admins bypass all permission checks
 */
export class Permission {
  private constructor(
    public readonly id: PermissionId,
    public readonly documentId: DocumentId,
    public readonly userId: UserId,
    public readonly level: PermissionLevel,
    public readonly createdAt: Date
  ) {}

  /**
   * Creates a new Permission entity with generated ID.
   */
  static create(props: {
    documentId: DocumentId;
    userId: UserId;
    level: PermissionLevel;
  }): Permission {
    return new Permission(
      newPermissionId(),
      props.documentId,
      props.userId,
      props.level,
      new Date()
    );
  }

  /**
   * Reconstructs a Permission entity from persistence layer.
   */
  static fromPersistence(props: {
    id: PermissionId;
    documentId: DocumentId;
    userId: UserId;
    level: PermissionLevel;
    createdAt: Date;
  }): Permission {
    return new Permission(
      props.id,
      props.documentId,
      props.userId,
      props.level,
      props.createdAt
    );
  }

  /**
   * Checks if this permission grants the requested level of access.
   * Uses hierarchical permission model: admin > write > read
   */
  grantsAccess(requiredLevel: PermissionLevel): boolean {
    const hierarchy: Record<PermissionLevel, number> = {
      read: 1,
      write: 2,
      admin: 3
    };

    return hierarchy[this.level] >= hierarchy[requiredLevel];
  }

  /**
   * Checks if this permission can be upgraded to a higher level.
   */
  canBeUpgradedTo(newLevel: PermissionLevel): boolean {
    const hierarchy: Record<PermissionLevel, number> = {
      read: 1,
      write: 2,
      admin: 3
    };

    return hierarchy[newLevel] > hierarchy[this.level];
  }

  /**
   * Returns a plain object representation for serialization.
   */
  toPlainObject() {
    return {
      id: this.id,
      documentId: this.documentId,
      userId: this.userId,
      level: this.level,
      createdAt: this.createdAt,
    };
  }
}
