import { Effect, Schema as S, Option, ParseResult } from "effect"
import { Role } from "@domain/accessPolicy/access-policy.schema"
import { UserSchema } from "@domain/user/user.schema"
import { EmailAddress } from "@domain/value-objects/email.vo"
import { HashedPassword } from "@domain/value-objects/hashed-password.vo"
import { UserId, WorkspaceId } from "@domain/value-objects/id.vo"
import { createEntityFactory, type Entity, type IEntity } from "@domain/utils/entity.utils"
import { ValidationError } from "@domain/utils/domain.errors"
import { isSome, toNullable } from "@domain/utils/option.utils"

export type { Role }

export interface IUser extends IEntity {
  readonly id: UserId
  readonly email: EmailAddress
  readonly passwordHash: HashedPassword
  readonly roles: readonly Role[]
  readonly workspaceId: Option.Option<WorkspaceId>
  readonly createdAt: Date
}

/**
 * Serialized User type derived from schema encoding.
 */
export type SerializedUser = S.Schema.Encoded<typeof UserSchema>
export class UserEntity implements Entity<S.Schema.Type<typeof UserSchema>, SerializedUser>, IUser {
  // Factory methods
  static create = createEntityFactory(
    UserSchema,
    (props) => new UserEntity(props),
    "User"
  ).create

  static createNew = (props: {
    id: UserId;
    email: EmailAddress;
    passwordHash: HashedPassword;
    roles: Role[];
    workspaceId?: WorkspaceId | null;
  }): Effect.Effect<UserEntity, ValidationError> => {
    const userData = {
      id: props.id,
      email: props.email,
      passwordHash: props.passwordHash,
      roles: props.roles,
      workspaceId: props.workspaceId 
        ? { _tag: "Some" as const, value: props.workspaceId }
        : { _tag: "None" as const },
      createdAt: new Date().toISOString()
    }
    return S.decodeUnknown(UserSchema)(userData).pipe(
      Effect.map((validated) => new UserEntity(validated)),
      Effect.mapError((error) => new ValidationError(
        `Invalid user data: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        userData
      ))
    )
  }

  static fromPersistence = createEntityFactory(
    UserSchema,
    (props) => new UserEntity(props),
    "User"
  ).fromPersistence

  static unsafe = createEntityFactory(
    UserSchema,
    (props) => new UserEntity(props),
    "User"
  ).unsafe

  // ========== Constructor ==========
  
  private constructor(readonly props: Readonly<S.Schema.Type<typeof UserSchema>>) {}

  // ========== Getters & Computed Properties ==========
  
  get id() { return this.props.id }
  get email() { return this.props.email }
  get passwordHash() { return this.props.passwordHash }
  get roles() { return this.props.roles }
  get workspaceId() { return this.props.workspaceId }
  get createdAt() { return this.props.createdAt }

  get isAdminUser(): boolean {
    return this.roles.includes("ADMIN" as Role)
  }

  get roleCount(): number {
    return this.roles.length
  }

  get hasWorkspaceAssignment(): boolean {
    return isSome(this.workspaceId)
  }

  get emailDomain(): string {
    const parts = this.email.split('@')
    return parts[1] || ''
  }

  // ========== Public Domain Methods ==========
  
  isAdmin(): boolean {
    return this.isAdminUser
  }

  canManageUsers(): boolean {
    return this.isAdmin()
  }

  hasRole(role: Role): boolean {
    return this.roles.includes(role)
  }

  hasWorkspace(): boolean {
    return this.hasWorkspaceAssignment
  }

  belongsToWorkspace(workspaceId: WorkspaceId): boolean {
    return Option.match(this.workspaceId, {
      onNone: () => false,
      onSome: (id) => id === workspaceId
    })
  }

  getWorkspaceId(): WorkspaceId | null {
    return toNullable(this.workspaceId)
  }

  assignToWorkspace = (workspaceId: WorkspaceId): Effect.Effect<UserEntity, ValidationError> => {
    // WorkspaceId is a branded type (UUID), so it's already validated
    // Construct new entity directly
    const updated = new UserEntity({
      ...this.props,
      workspaceId: Option.some(workspaceId)
    })
    
    return Effect.succeed(updated)
  }

  removeFromWorkspace = (): Effect.Effect<UserEntity, ValidationError> => {
    // No validation needed for removing workspace
    // Construct new entity directly
    const updated = new UserEntity({
      ...this.props,
      workspaceId: Option.none()
    })
    
    return Effect.succeed(updated)
  }

  // ========== Serialization Methods ==========
  
  toWireFormat = (): S.Schema.Type<typeof UserSchema> => {
    return this.props
  }

  /**
   * Serializes the entity using Effect Schema encoding.
   * Properly transforms Option<T> fields to nullable values for external systems.
   */
  serialized = (): Effect.Effect<SerializedUser, ParseResult.ParseError, never> => {
    return S.encode(UserSchema)(this.props)
  }

  toPlainObject = () => {
    return {
      id: this.id,
      email: this.email,
      roles: this.roles,
      workspaceId: toNullable(this.workspaceId),
      createdAt: this.createdAt,
      isAdmin: this.isAdminUser,
      hasWorkspace: this.hasWorkspaceAssignment
    }
  }
}
