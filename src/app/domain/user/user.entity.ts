import { Effect, Option, ParseResult, Schema as S, Clock } from "effect"
import { Role } from "@domain/accessPolicy/access-policy.schema"
import { UserSchema } from "@domain/user/user.schema"
import { EmailAddress, getEmailDomain } from "@domain/refined/email"
import { HashedPassword } from "@domain/refined/hashed-password"
import { UserId, WorkspaceId } from "@domain/refined/ids"
import { UserValidationError } from "@domain/user/user.error"
import { formatParseError, mapParseError } from "@domain/utils/option.utils"
import { getCurrentTime } from "@domain/utils/audit-trail"
import { applyMutationWithProvidedTimestamp, serializeWith } from "@domain/utils/schema-transform"
import { UserGuards } from "@domain/user/user.guards"

export type { Role }

export type UserType = S.Schema.Type<typeof UserSchema>
export type SerializedUser = S.Schema.Encoded<typeof UserSchema>

export class UserEntity {
  readonly id!: UserId
  readonly email!: EmailAddress
  readonly passwordHash!: HashedPassword
  readonly roles!: readonly Role[]
  readonly workspaceId!: Option.Option<WorkspaceId>
  readonly createdAt!: Date
  readonly updatedAt!: Option.Option<Date>

  static create(
    input: SerializedUser
  ): Effect.Effect<UserEntity, UserValidationError, Clock.Clock> {
    return getCurrentTime().pipe(
      Effect.flatMap((now) => {
        const dataWithAudit = {
          ...input,
          createdAt: input.createdAt || now.toISOString(),
          updatedAt: input.updatedAt
        }
        return S.decodeUnknown(UserSchema)(dataWithAudit).pipe(
          Effect.map((data) => new UserEntity(data)),
          Effect.mapError((error) => new UserValidationError(
            mapParseError(error as ParseResult.ParseError, (m) => `User validation failed: ${m}`),
            "user",
            input
          ))
        )
      })
    ) as Effect.Effect<UserEntity, UserValidationError, Clock.Clock>
  }

  private constructor(data: UserType) {
    this.id = data.id
    this.createdAt = data.createdAt
    this.updatedAt = data.updatedAt
    this.email = data.email
    this.passwordHash = data.passwordHash
    this.roles = data.roles
    this.workspaceId = data.workspaceId
  }

  serialized(): Effect.Effect<SerializedUser, ParseResult.ParseError, never> {
    return serializeWith(UserSchema, this as unknown as UserType)
  }

  get roleCount(): number {
    return this.roles.length
  }

  get hasWorkspaceAssignment(): boolean {
    return Option.isSome(this.workspaceId)
  }

  get emailDomain(): string {
    return getEmailDomain(this.email)
  }

  isAdmin(): boolean {
    return UserGuards.isAdmin(this as any)
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
  ): Effect.Effect<UserEntity, UserValidationError, Clock.Clock> {
    return getCurrentTime().pipe(
      Effect.flatMap((now) =>
        applyMutationWithProvidedTimestamp(
          UserSchema,
          this as unknown,
          now,
          () => ({ workspaceId: workspaceId as WorkspaceId }),
          (error) =>
            new UserValidationError(
              `Failed to prepare user for workspace assignment: ${formatParseError(error as ParseResult.ParseError)}`,
              "workspaceId",
              workspaceId
            ),
          (input) => UserEntity.create(input)
        )
      )
    )
  }

  removeFromWorkspace(): Effect.Effect<UserEntity, UserValidationError, Clock.Clock> {
    return getCurrentTime().pipe(
      Effect.flatMap((now) =>
        applyMutationWithProvidedTimestamp(
          UserSchema,
          this as unknown,
          now,
          () => ({ workspaceId: undefined }),
          (error) =>
            new UserValidationError(
              `Failed to prepare user for workspace removal: ${formatParseError(error as ParseResult.ParseError)}`,
              "workspaceId",
              null
            ),
          (input) => UserEntity.create(input)
        )
      )
    )
  }
}
