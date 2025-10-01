import { Effect, Schema as S } from "effect"
import { UserSchema } from "../schema/user.schema"
import { Role } from "../schema/access-policy.schema"
import { ValidationError } from "../errors/domain.errors"
import { UserId } from "../value-objects/id.vo"
import { EmailAddress } from "../value-objects/email.vo"
import { createEntityFactory, type Entity } from "../utils/entity.utils"


export class UserEntity implements Entity<S.Schema.Type<typeof UserSchema>> {
  private constructor(readonly props: S.Schema.Type<typeof UserSchema>) {}

  // Standardized factory methods using the entity utilities
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
  }): Effect.Effect<UserEntity, ValidationError> => {
    const userData = {
      ...props,
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

  // convenience read accessors
  get id() { return this.props.id }
  get email() { return this.props.email }
  get passwordHash() { return this.props.passwordHash }
  get roles() { return this.props.roles }
  get createdAt() { return this.props.createdAt }

  // business logic methods
  isAdmin(): boolean {
    return this.roles.includes("ADMIN" as Role);
  }

  canManageUsers(): boolean {
    return this.isAdmin();
  }

  hasRole(role: Role): boolean {
    return this.roles.includes(role);
  }

  // Standardized serialization methods
  toWireFormat = (): S.Schema.Type<typeof UserSchema> => {
    return this.props
  }

  toPlainObject = () => {
    return {
      id: this.id,
      email: this.email,
      roles: this.roles,
      createdAt: this.createdAt
    }
  }
}
