import { Schema as S } from "effect"
import { User } from "../schema/user.schema"

export class UserEntity {
  private constructor(readonly props: S.Schema.Type<typeof User>) {}

  static fromProps = (u: unknown) => {
    const props = S.decodeUnknownSync(User)(u)
    return new UserEntity(props)
  }

  static unsafe = (p: S.Schema.Type<typeof User>) => new UserEntity(p)

  // convenience read accessors
  get id() { return this.props.id }
  get email() { return this.props.email }
  get passwordHash() { return this.props.passwordHash }
  get role() { return this.props.role }
  get createdAt() { return this.props.createdAt }

  // business logic methods
  isAdmin(): boolean {
    return this.role === "admin";
  }

  canManageUsers(): boolean {
    return this.isAdmin();
  }

  // factory method for creating new users
  static create(props: {
    id: S.Schema.Type<typeof User>['id'];
    email: S.Schema.Type<typeof User>['email'];
    passwordHash: string;
    role: S.Schema.Type<typeof User>['role'];
  }): UserEntity {
    return UserEntity.fromProps({
      ...props,
      createdAt: new Date()
    });
  }
}
