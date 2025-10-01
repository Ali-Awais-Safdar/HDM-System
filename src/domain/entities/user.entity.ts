import { Effect, Schema as S, Option, ParseResult } from "effect"
import { UserSchema } from "../schema/user.schema"
import { Role } from "../schema/access-policy.schema"
import { WorkspaceId } from "../value-objects/id.vo"
import { ValidationError } from "../errors/domain.errors"
import { UserId } from "../value-objects/id.vo"
import { EmailAddress } from "../value-objects/email.vo"
import { createEntityFactory, type Entity, type IEntity } from "../utils/entity.utils"
import { toNullable, fromNullable, isSome } from "../utils/option.utils"

export type { Role }

export interface IUser extends IEntity {
  readonly id: UserId
  readonly email: EmailAddress
  readonly passwordHash: string
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
    passwordHash: string;
    roles: Role[];
    workspaceId?: WorkspaceId | null;
  }): Effect.Effect<UserEntity, ValidationError> => {
    const userData = {
      ...props,
      workspaceId: fromNullable(props.workspaceId),
      createdAt: new Date()
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
    const updatedData = {
      ...this.props,
      workspaceId: Option.some(workspaceId)
    }
    return S.decodeUnknown(UserSchema)(updatedData).pipe(
      Effect.map((validated) => new UserEntity(validated)),
      Effect.mapError((error) => new ValidationError(
        `Invalid workspace ID: ${error instanceof Error ? error.message : String(error)}`,
        'workspaceId',
        workspaceId
      ))
    )
  }

  removeFromWorkspace = (): Effect.Effect<UserEntity, ValidationError> => {
    const updatedData = {
      ...this.props,
      workspaceId: Option.none()
    }
    return S.decodeUnknown(UserSchema)(updatedData).pipe(
      Effect.map((validated) => new UserEntity(validated)),
      Effect.mapError((error) => new ValidationError(
        `Failed to remove workspace: ${error instanceof Error ? error.message : String(error)}`,
        'workspaceId',
        null
      ))
    )
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
