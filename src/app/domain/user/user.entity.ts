import { Effect, Schema as S, Option, ParseResult } from "effect"
import { pipe } from "effect"
import { Role } from "@domain/accessPolicy/access-policy.schema"
import { UserSchema } from "@domain/user/user.schema"
import { EmailAddress } from "@domain/refined/email"
import { HashedPassword } from "@domain/refined/hashed-password"
import { UserId, WorkspaceId } from "@domain/refined/ids"
import { BaseEntity, type IEntity } from "@domain/utils/base.entity"
import { ValidationError } from "@domain/utils/base.errors"
import {
  formatParseError,
  isSome,
  optionToMaybe,
  toNullable
} from "@domain/utils/option.utils"

export type { Role }

/**
 * User entity interface extending base IEntity.
 * Defines the contract for User domain objects.
 */
export interface IUser extends IEntity<UserId> {
  readonly id: UserId
  readonly email: EmailAddress
  readonly passwordHash: HashedPassword
  readonly roles: readonly Role[]
  readonly workspaceId: Option.Option<WorkspaceId>
  readonly createdAt: Date
  readonly updatedAt: Date | null
}

/**
 * Runtime type derived from schema.
 * Represents the validated User type with Option<T> for optional fields.
 */
export type UserType = S.Schema.Type<typeof UserSchema>

/**
 * Serialized User type derived from schema encoding.
 * Represents the external format for APIs and persistence.
 */
export type SerializedUser = S.Schema.Encoded<typeof UserSchema>

/**
 * User Entity
 * 
 * Represents a user in the system with authentication credentials and role assignments.
 * Follows immutable entity pattern - all updates return new instances.
 */
export class UserEntity
  extends BaseEntity<IUser, typeof UserSchema>
  implements IUser
{
  // ========== Direct Readonly Properties ==========
  // Properties cannot be reassigned after construction
  // Optional values are explicitly handled with Option
  
  readonly email: EmailAddress
  readonly passwordHash: HashedPassword
  readonly roles: readonly Role[]
  readonly workspaceId: Option.Option<WorkspaceId> // Explicit optionality with Option type

  // ========== Static Factory Methods ==========

  private static toRuntime(data: UserType): IUser {
    return {
      id: data.id,
      email: data.email,
      passwordHash: data.passwordHash,
      roles: data.roles,
      workspaceId: data.workspaceId,
      createdAt: data.createdAt,
      updatedAt: null
    }
  }
  
  /**
   * Creates a User entity from external/unknown data.
   * Validates input using schema and returns Effect with proper error handling.
   * This is the primary factory method for creating users from external sources.
   */
  static create(input: unknown): Effect.Effect<UserEntity, ValidationError, never> {
    return pipe(
      S.decodeUnknown(UserSchema)(input), // Validate input with schema
      Effect.map((validated) =>
        new UserEntity(UserEntity.toRuntime(validated))
      ),
      Effect.mapError((error) => 
        new ValidationError(
          `Invalid user data: ${formatParseError(error)}`,
          undefined,
          input
        )
      )
    ) as Effect.Effect<UserEntity, ValidationError, never>
  }

  /**
   * Creates a new User entity with business logic validation.
   * Use this for creating new users in the domain (not from persistence).
   */
  static createNew(props: {
    id: UserId;
    email: EmailAddress;
    passwordHash: HashedPassword;
    roles: Role[];
    workspaceId?: WorkspaceId | null;
  }): Effect.Effect<UserEntity, ValidationError, never> {
    const userData = {
      id: props.id,
      email: props.email,
      passwordHash: props.passwordHash,
      roles: props.roles,
      workspaceId: props.workspaceId ?? null,
      createdAt: new Date()
    }
    
    return pipe(
      S.decodeUnknown(UserSchema)(userData),
      Effect.map((validated) =>
        new UserEntity(UserEntity.toRuntime(validated))
      ),
      Effect.mapError((error) => 
        new ValidationError(
          `Invalid user data: ${formatParseError(error)}`,
          undefined,
          userData
        )
      )
    ) as Effect.Effect<UserEntity, ValidationError, never>
  }

  /**
   * Creates entity from persistence layer data.
   * Alias for create() for semantic clarity.
   */
  static fromPersistence(input: unknown): Effect.Effect<UserEntity, ValidationError, never> {
    return UserEntity.create(input)
  }

  /**
   * Unsafe constructor for when data is already validated.
   * Use only in controlled contexts (e.g., tests, after validation).
   */
  static unsafe(data: UserType): UserEntity {
    return new UserEntity(UserEntity.toRuntime(data))
  }

  // ========== Constructor (Private) ==========
  // Constructor receives pre-validated data
  // All validation happens in factory methods before construction
  
  private constructor(runtime: Readonly<IUser>) {
    super(UserSchema, runtime)
    // Direct assignment - no manual conversion needed
    this.email = runtime.email
    this.passwordHash = runtime.passwordHash
    this.roles = runtime.roles
    this.workspaceId = runtime.workspaceId // Already Option<WorkspaceId> from schema
  }

  // ========== Getters & Computed Properties ==========
  
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
  
  /**
   * Checks if user has admin privileges.
   */
  isAdmin(): boolean {
    return this.isAdminUser
  }

  /**
   * Checks if user can manage other users.
   */
  canManageUsers(): boolean {
    return this.isAdmin()
  }

  /**
   * Checks if user has a specific role.
   */
  hasRole(role: Role): boolean {
    return this.roles.includes(role)
  }

  /**
   * Checks if user has a workspace assignment.
   */
  hasWorkspace(): boolean {
    return this.hasWorkspaceAssignment
  }

  /**
   * Checks if user belongs to a specific workspace.
   */
  belongsToWorkspace(workspaceId: WorkspaceId): boolean {
    return Option.match(this.workspaceId, {
      onNone: () => false,
      onSome: (id) => id === workspaceId
    })
  }

  /**
   * Gets workspace ID or null.
   * Converts Option to nullable for external APIs.
   */
  getWorkspaceId(): WorkspaceId | null {
    return toNullable(this.workspaceId)
  }

  /**
   * Assigns user to a workspace.
   * Returns new entity instance with updated workspace (immutable update pattern).
   */
  assignToWorkspace(workspaceId: WorkspaceId): Effect.Effect<UserEntity, ValidationError, never> {
    return this.serialized().pipe(
      Effect.mapError((error) =>
        new ValidationError(
          `Failed to prepare user for workspace assignment: ${formatParseError(error)}`,
          "workspaceId",
          workspaceId
        )
      ),
      Effect.flatMap((currentSerialized) =>
        UserEntity.create({
          ...currentSerialized,
          workspaceId: workspaceId // Pass the ID directly, schema will handle conversion
        })
      )
    )
  }

  /**
   * Removes user from workspace.
   * Returns new entity instance with no workspace (immutable update pattern).
   */
  removeFromWorkspace(): Effect.Effect<UserEntity, ValidationError, never> {
    return this.serialized().pipe(
      Effect.mapError((error) =>
        new ValidationError(
          `Failed to prepare user for workspace removal: ${formatParseError(error)}`,
          "workspaceId",
          undefined
        )
      ),
      Effect.flatMap((currentSerialized) =>
        UserEntity.create({
          ...currentSerialized,
          workspaceId: null // Pass null, schema will handle conversion to Option.none()
        })
      )
    )
  }

  // ========== Serialization Methods ==========
  
  /**
   * Returns wire format (validated runtime type).
   * Used for internal domain operations.
   */
  toWireFormat(): IUser {
    return {
      id: this.id,
      email: this.email,
      passwordHash: this.passwordHash,
      roles: this.roles,
      workspaceId: this.workspaceId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    }
  }

  /**
   * Serializes the entity using Effect Schema encoding.
   * Properly transforms Option<T> fields to nullable values for external systems.
   * This is automatic serialization with type safety.
   */
  serialized(): Effect.Effect<SerializedUser, ParseResult.ParseError, never> {
    return S.encode(UserSchema)(this.props as any) as Effect.Effect<SerializedUser, ParseResult.ParseError, never> // Automatic serialization with type safety
  }

  /**
   * Converts to plain object for APIs.
   * Includes computed properties for convenience.
   */
  toPlainObject() {
    return {
      id: this.id,
      email: this.email,
      roles: this.roles,
      workspaceId: optionToMaybe(this.workspaceId),
      createdAt: this.createdAt,
      isAdmin: this.isAdminUser,
      hasWorkspace: this.hasWorkspaceAssignment
    }
  }
}
