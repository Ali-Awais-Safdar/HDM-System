import { Effect, Option, ParseResult, Schema as S } from "effect"
import { Role } from "@domain/accessPolicy/access-policy.schema"
import { UserSchema } from "@domain/user/user.schema"
import { EmailAddress } from "@domain/refined/email"
import { HashedPassword } from "@domain/refined/hashed-password"
import { UserId, WorkspaceId } from "@domain/refined/ids"
import { BaseEntity, type IEntity } from "@domain/utils/base.entity"
import { UserValidationError } from "@domain/user/user.error"
import { formatParseError } from "@domain/utils/option.utils"

export type { Role }

export interface IUser extends IEntity<UserId> {
  readonly id: UserId
  readonly email: EmailAddress
  readonly passwordHash: HashedPassword
  readonly roles: readonly Role[]
  readonly workspaceId: Option.Option<WorkspaceId>
  readonly createdAt: Date
  readonly updatedAt: Date | null
}

export type UserType = S.Schema.Type<typeof UserSchema>
export type SerializedUser = S.Schema.Encoded<typeof UserSchema>

export class UserEntity extends BaseEntity implements IUser {
  readonly email!: EmailAddress
  readonly passwordHash!: HashedPassword
  readonly roles!: readonly Role[]
  readonly workspaceId!: Option.Option<WorkspaceId>

  private constructor(data: UserType) {
    super()
    this._fromSerialized({
      id: data.id,
      createdAt: data.createdAt,
      updatedAt: Option.getOrNull(data.updatedAt)
    })
    this.email = data.email
    this.passwordHash = data.passwordHash
    this.roles = data.roles
    this.workspaceId = data.workspaceId
  }

  static create(
    input: SerializedUser
  ): Effect.Effect<UserEntity, UserValidationError, never> {
    return S.decodeUnknown(UserSchema)(input).pipe(
      Effect.map((data) => new UserEntity(data)),
      Effect.mapError((error) => UserEntity.toValidationError(error, input))
    ) as Effect.Effect<UserEntity, UserValidationError, never>
  }

  private static toValidationError(
    error: unknown,
    input: SerializedUser
  ): UserValidationError {
    if (error instanceof UserValidationError) {
      return error
    }
    return new UserValidationError(
      "user",
      input,
      formatParseError(error as ParseResult.ParseError)
    )
  }


  // id, createdAt, updatedAt are inherited from BaseEntity; other fields assigned in ctor

  get isAdminUser(): boolean {
    return this.roles.includes("ADMIN" as Role)
  }

  get roleCount(): number {
    return this.roles.length
  }

  get hasWorkspaceAssignment(): boolean {
    return Option.isSome(this.workspaceId)
  }

  get emailDomain(): string {
    const parts = this.email.split("@")
    return parts[1] || ""
  }

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

  assignToWorkspace(
    workspaceId: WorkspaceId
  ): Effect.Effect<UserEntity, UserValidationError, never> {
    return this.serialized(UserSchema).pipe(
      Effect.mapError((error) =>
        new UserValidationError(
          "workspaceId",
          workspaceId,
          `Failed to prepare user for workspace assignment: ${formatParseError(error)}`
        )
      ),
      Effect.flatMap((currentSerialized) =>
        UserEntity.create({
          ...currentSerialized,
          workspaceId,
          updatedAt: new Date()
        })
      )
    )
  }

  removeFromWorkspace(): Effect.Effect<UserEntity, UserValidationError, never> {
    return this.serialized(UserSchema).pipe(
      Effect.mapError((error) =>
        new UserValidationError(
          "workspaceId",
          null,
          `Failed to prepare user for workspace removal: ${formatParseError(error)}`
        )
      ),
      Effect.flatMap((currentSerialized) =>
        UserEntity.create({
          ...currentSerialized,
          workspaceId: null,
          updatedAt: new Date()
        })
      )
    )
  }
}
