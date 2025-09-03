import { UserId, EmailAddress } from "../../shared/types/brand";

export type UserRole = "admin" | "user";

export interface UserEntity {
  readonly id: UserId;
  readonly email: EmailAddress;
  readonly passwordHash: string;
  readonly role: UserRole;
  readonly createdAt: Date;
}

export class User implements UserEntity {
  constructor(
    public readonly id: UserId,
    public readonly email: EmailAddress,
    public readonly passwordHash: string,
    public readonly role: UserRole,
    public readonly createdAt: Date = new Date()
  ) {}

  isAdmin(): boolean {
    return this.role === "admin";
  }

  canManageUsers(): boolean {
    return this.isAdmin();
  }

  static create(props: {
    id: UserId;
    email: EmailAddress;
    passwordHash: string;
    role: UserRole;
  }): User {
    return new User(
      props.id,
      props.email,
      props.passwordHash,
      props.role
    );
  }
}
