import { Schema as S } from "effect"
import { Permission as PermissionSchema, PermissionLevel } from "../schema/permission.schema"
import { makePermissionId } from "../value-objects/id.vo"

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
  private constructor(readonly props: S.Schema.Type<typeof PermissionSchema>) {}

  static fromProps = (u: unknown) => {
    const props = S.decodeUnknownSync(PermissionSchema)(u)
    return new Permission(props)
  }

  static unsafe = (p: S.Schema.Type<typeof PermissionSchema>) => new Permission(p)

  // convenience read accessors
  get id() { return this.props.id }
  get documentId() { return this.props.documentId }
  get userId() { return this.props.userId }
  get level() { return this.props.level }
  get createdAt() { return this.props.createdAt }

  /**
   * Creates a new Permission entity with generated ID.
   */
  static create(props: {
    documentId: S.Schema.Type<typeof PermissionSchema>['documentId'];
    userId: S.Schema.Type<typeof PermissionSchema>['userId'];
    level: S.Schema.Type<typeof PermissionSchema>['level'];
  }): Permission {
    return Permission.fromProps({
      id: makePermissionId(crypto.randomUUID()),
      ...props,
      createdAt: new Date()
    });
  }

  /**
   * Reconstructs a Permission entity from persistence layer.
   */
  static fromPersistence(props: {
    id: S.Schema.Type<typeof PermissionSchema>['id'];
    documentId: S.Schema.Type<typeof PermissionSchema>['documentId'];
    userId: S.Schema.Type<typeof PermissionSchema>['userId'];
    level: S.Schema.Type<typeof PermissionSchema>['level'];
    createdAt: Date;
  }): Permission {
    return Permission.fromProps(props);
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
