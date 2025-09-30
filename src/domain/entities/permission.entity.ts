import { Effect, Schema as S } from "effect"
import { Permission as PermissionSchema, PermissionLevel } from "../schema/permission.schema"
import { makePermissionId } from "../value-objects/id.vo"
import { ValidationError, BusinessRuleViolationError } from "../errors/domain.errors"
import { UserId, DocumentId } from "../value-objects/id.vo"

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

  // Effect-based factory for creating from unknown input
  static create = (input: unknown): Effect.Effect<Permission, ValidationError> => {
    return Effect.gen(function* () {
      const props = yield* Effect.try({
        try: () => S.decodeUnknownSync(PermissionSchema)(input),
        catch: (error) => new ValidationError(
          `Invalid permission data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          undefined,
          input
        )
      })
      return new Permission(props)
    })
  }

  // Effect-based factory for creating new permissions
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

  // Effect-based factory for reconstructing from persistence
  static fromPersistence = (input: unknown): Effect.Effect<Permission, ValidationError> => {
    return Permission.create(input)
  }

  // Unsafe factory for internal use when data is already validated
  static unsafe = (props: S.Schema.Type<typeof PermissionSchema>): Permission => {
    return new Permission(props)
  }

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
  upgradeTo = (newLevel: PermissionLevel): Effect.Effect<Permission, BusinessRuleViolationError> => {
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

      return new Permission(updatedData)
    }.bind(this))
  }

  /**
   * Effect-based method for downgrading permission level.
   */
  downgradeTo = (newLevel: PermissionLevel): Effect.Effect<Permission, BusinessRuleViolationError> => {
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

      return new Permission(updatedData)
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
   * Serialization method using schema encode
   */
  toWireFormat = (): S.Schema.Type<typeof PermissionSchema> => {
    return this.props
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
    }
  }
}
