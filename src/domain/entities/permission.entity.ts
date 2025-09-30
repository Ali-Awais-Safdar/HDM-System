import { Effect, Schema as S } from "effect"
import { Permission as PermissionSchema, PermissionLevel } from "../schema/permission.schema"
import { makePermissionId } from "../value-objects/id.vo"
import { ValidationError, BusinessRuleViolationError } from "../errors/domain.errors"
import { UserId, DocumentId } from "../value-objects/id.vo"
import { createEntityFactory, type Entity } from "../utils/entity.utils"

/**
 * Permission domain entity representing document-level access control.
 * 
 * Business Rules:
 * - Each user can have at most one permission per document (enforced by DB unique constraint)
 * - Permission levels are hierarchical: admin > write > read
 * - Document owners have implicit full access regardless of explicit permissions
 * - Admins bypass all permission checks
 */
export class Permission implements Entity<S.Schema.Type<typeof PermissionSchema>> {
  private constructor(readonly props: S.Schema.Type<typeof PermissionSchema>) {}

  // Standardized factory methods using the entity utilities
  static create = createEntityFactory(
    PermissionSchema,
    (props) => new Permission(props),
    "Permission"
  ).create

  static createNew = (props: {
    documentId: DocumentId;
    userId: UserId;
    level: PermissionLevel;
  }): Effect.Effect<Permission, ValidationError> => {
    return Effect.gen(function* () {
      const permissionData = {
        id: makePermissionId(crypto.randomUUID()),
        ...props,
        createdAt: new Date()
      }
      
      const validatedProps = yield* Effect.try({
        try: () => S.decodeUnknownSync(PermissionSchema)(permissionData),
        catch: (error) => new ValidationError(
          `Invalid permission data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          undefined,
          permissionData
        )
      })
      
      return new Permission(validatedProps)
    })
  }

  static fromPersistence = createEntityFactory(
    PermissionSchema,
    (props) => new Permission(props),
    "Permission"
  ).fromPersistence

  static unsafe = createEntityFactory(
    PermissionSchema,
    (props) => new Permission(props),
    "Permission"
  ).unsafe

  // convenience read accessors
  get id() { return this.props.id }
  get documentId() { return this.props.documentId }
  get userId() { return this.props.userId }
  get level() { return this.props.level }
  get createdAt() { return this.props.createdAt }

  /**
   * Checks if this permission grants the requested level of access.
   * Uses hierarchical permission model: admin > write > read
   */
  grantsAccess(requiredLevel: PermissionLevel): boolean {
    const hierarchy: Record<PermissionLevel, number> = {
      read: 1,
      write: 2,
      admin: 3
    }

    return hierarchy[this.level] >= hierarchy[requiredLevel]
  }

  /**
   * Checks if this permission can be upgraded to a higher level.
   */
  canBeUpgradedTo(newLevel: PermissionLevel): boolean {
    const hierarchy: Record<PermissionLevel, number> = {
      read: 1,
      write: 2,
      admin: 3
    }

    return hierarchy[newLevel] > hierarchy[this.level]
  }

  /**
   * Effect-based method for upgrading permission level.
   */
  upgradeTo = (newLevel: PermissionLevel): Effect.Effect<Permission, ValidationError | BusinessRuleViolationError> => {
    return Effect.gen(function* (this: Permission) {
      if (!this.canBeUpgradedTo(newLevel)) {
        yield* Effect.fail(new BusinessRuleViolationError(
          "INVALID_UPGRADE",
          `Cannot upgrade from ${this.level} to ${newLevel}`,
          { currentLevel: this.level, newLevel }
        ))
      }

      const updatedData = {
        ...this.props,
        level: newLevel
      }

      const validatedProps = yield* Effect.try({
        try: () => S.decodeUnknownSync(PermissionSchema)(updatedData),
        catch: (error) => new ValidationError(
          `Invalid permission level: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'level',
          newLevel
        )
      })

      return new Permission(validatedProps)
    }.bind(this))
  }

  /**
   * Effect-based method for downgrading permission level.
   */
  downgradeTo = (newLevel: PermissionLevel): Effect.Effect<Permission, ValidationError | BusinessRuleViolationError> => {
    return Effect.gen(function* (this: Permission) {
      const hierarchy: Record<PermissionLevel, number> = {
        read: 1,
        write: 2,
        admin: 3
      }

      if (hierarchy[newLevel] >= hierarchy[this.level]) {
        yield* Effect.fail(new BusinessRuleViolationError(
          "INVALID_DOWNGRADE",
          `Cannot downgrade from ${this.level} to ${newLevel}`,
          { currentLevel: this.level, newLevel }
        ))
      }

      const updatedData = {
        ...this.props,
        level: newLevel
      }

      const validatedProps = yield* Effect.try({
        try: () => S.decodeUnknownSync(PermissionSchema)(updatedData),
        catch: (error) => new ValidationError(
          `Invalid permission level: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'level',
          newLevel
        )
      })

      return new Permission(validatedProps)
    }.bind(this))
  }

  /**
   * Checks if this permission is for the same user and document.
   */
  isForUserAndDocument(userId: UserId, documentId: DocumentId): boolean {
    return this.userId === userId && this.documentId === documentId
  }

  /**
   * Gets the permission hierarchy level as a number.
   */
  getHierarchyLevel(): number {
    const hierarchy: Record<PermissionLevel, number> = {
      read: 1,
      write: 2,
      admin: 3
    }
    return hierarchy[this.level]
  }

  /**
   * Standardized serialization methods
   */
  toWireFormat = (): S.Schema.Type<typeof PermissionSchema> => {
    return this.props
  }

  toPlainObject = () => {
    return {
      id: this.id,
      documentId: this.documentId,
      userId: this.userId,
      level: this.level,
      createdAt: this.createdAt,
    }
  }
}
