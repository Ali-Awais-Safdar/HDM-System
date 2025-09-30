import { Effect, Schema as S } from "effect"
import { User, UserRole } from "../schema/user.schema"
import { Role } from "../schema/access-policy.schema"
import { ValidationError, BusinessRuleViolationError } from "../errors/domain.errors"
import { UserId } from "../value-objects/id.vo"
import { EmailAddress } from "../value-objects/email.vo"
import { createEntityFactory, type Entity } from "../utils/entity.utils"

// Re-export UserRole and Role for backwards compatibility
export { UserRole, Role }

export class UserEntity implements Entity<S.Schema.Type<typeof User>> {
  private constructor(readonly props: S.Schema.Type<typeof User>) {}

  // Standardized factory methods using the entity utilities
  static create = createEntityFactory(
    User,
    (props) => new UserEntity(props),
    "User"
  ).create

  static createNew = (props: {
    id: UserId;
    email: EmailAddress;
    passwordHash: string;
    roles: Role[];
    workspaceIds: string[];
  }): Effect.Effect<UserEntity, ValidationError> => {
    return Effect.gen(function* () {
      const userData = {
        ...props,
        createdAt: new Date()
      }
      
      const validatedProps = yield* Effect.try({
        try: () => S.decodeUnknownSync(User)(userData),
        catch: (error) => new ValidationError(
          `Invalid user data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          undefined,
          userData
        )
      })
      
      return new UserEntity(validatedProps)
    })
  }

  static fromPersistence = createEntityFactory(
    User,
    (props) => new UserEntity(props),
    "User"
  ).fromPersistence

  static unsafe = createEntityFactory(
    User,
    (props) => new UserEntity(props),
    "User"
  ).unsafe

  // convenience read accessors
  get id() { return this.props.id }
  get email() { return this.props.email }
  get passwordHash() { return this.props.passwordHash }
  get roles() { return this.props.roles }
  get workspaceIds() { return this.props.workspaceIds }
  get createdAt() { return this.props.createdAt }

  // business logic methods
  isAdmin(): boolean {
    return this.roles.includes("admin" as Role);
  }

  canManageUsers(): boolean {
    return this.isAdmin();
  }

  hasRole(role: Role): boolean {
    return this.roles.includes(role);
  }

  hasWorkspace(workspaceId: string): boolean {
    return this.workspaceIds.includes(workspaceId);
  }

  // Effect-based method for adding workspace
  addWorkspace = (workspaceId: string): Effect.Effect<UserEntity, ValidationError | BusinessRuleViolationError> => {
    return Effect.gen(function* (this: UserEntity) {
      if (this.hasWorkspace(workspaceId)) {
        yield* Effect.fail(new BusinessRuleViolationError(
          "DUPLICATE_WORKSPACE",
          "User already has access to this workspace",
          { workspaceId }
        ))
      }

      const updatedData = {
        ...this.props,
        workspaceIds: [...this.props.workspaceIds, workspaceId]
      }

      const validatedProps = yield* Effect.try({
        try: () => S.decodeUnknownSync(User)(updatedData),
        catch: (error) => new ValidationError(
          `Invalid workspace data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'workspaceIds',
          workspaceId
        )
      })

      return new UserEntity(validatedProps)
    }.bind(this))
  }

  // Effect-based method for removing workspace
  removeWorkspace = (workspaceId: string): Effect.Effect<UserEntity, ValidationError | BusinessRuleViolationError> => {
    return Effect.gen(function* (this: UserEntity) {
      if (!this.hasWorkspace(workspaceId)) {
        yield* Effect.fail(new BusinessRuleViolationError(
          "WORKSPACE_NOT_FOUND",
          "User does not have access to this workspace",
          { workspaceId }
        ))
      }

      const updatedData = {
        ...this.props,
        workspaceIds: this.props.workspaceIds.filter((id: string) => id !== workspaceId)
      }

      const validatedProps = yield* Effect.try({
        try: () => S.decodeUnknownSync(User)(updatedData),
        catch: (error) => new ValidationError(
          `Invalid workspace data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'workspaceIds',
          workspaceId
        )
      })

      return new UserEntity(validatedProps)
    }.bind(this))
  }

  // Standardized serialization methods
  toWireFormat = (): S.Schema.Type<typeof User> => {
    return this.props
  }

  toPlainObject = () => {
    return {
      id: this.id,
      email: this.email,
      roles: this.roles,
      workspaceIds: this.workspaceIds,
      createdAt: this.createdAt
    }
  }
}
