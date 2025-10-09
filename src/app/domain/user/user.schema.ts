import { Schema as S, Option } from "effect"
import { RoleSchema } from "@domain/accessPolicy/access-policy.schema"
import { UserGuards } from "@domain/user/user.guards"
import { Optional } from "@domain/utils/schema.utils"
import { DateTimeFromAny } from "@domain/refined/date-time"
import { EmailAddress } from "@domain/refined/email"
import { HashedPassword } from "@domain/refined/hashed-password"
import { UserId, WorkspaceId } from "@domain/refined/ids"

export const UserSchema = S.Struct({
  id: UserId,
  email: EmailAddress,
  passwordHash: HashedPassword,
  roles: S.Array(RoleSchema).pipe(UserGuards.ValidRoles),
  workspaceId: Optional(WorkspaceId), // Accepts null/undefined and transforms to Option<WorkspaceId>
  createdAt: DateTimeFromAny,
  updatedAt: Optional(DateTimeFromAny) // Accepts null/undefined and transforms to Option<Date>
})
export type User = S.Schema.Type<typeof UserSchema>

export const UserRowSchema = S.Struct({
  id: S.String,
  email: S.String,
  password_hash: S.String,
  roles: S.Array(S.String),
  workspace_id: S.Union(S.String, S.Null),
  created_at: S.Date,
  updated_at: S.Union(S.Date, S.Null)
})
export type UserRow = S.Schema.Type<typeof UserRowSchema>

export const UserCodec = S.transform(UserRowSchema, UserSchema, {
  decode: (r) => ({
    id: S.decodeUnknownSync(UserId)(r.id),
    email: S.decodeUnknownSync(EmailAddress)(r.email),
    passwordHash: S.decodeUnknownSync(HashedPassword)(r.password_hash),
    roles: S.decodeUnknownSync(S.Array(RoleSchema))(r.roles),
    workspaceId: r.workspace_id != null ? Option.some(S.decodeUnknownSync(WorkspaceId)(r.workspace_id)) : Option.none(),
    createdAt: r.created_at,
    updatedAt: r.updated_at != null ? Option.some(r.updated_at) : Option.none()
  }),
  encode: (d) => ({
    id: d.id,
    email: d.email,
    password_hash: d.passwordHash,
    roles: d.roles,
    workspace_id: Option.getOrNull(d.workspaceId as any),
    created_at: d.createdAt,
    updated_at: Option.getOrNull(d.updatedAt as any)
  }),
  strict: false
})

export const makeUser = (input: unknown) => S.decodeUnknown(UserSchema)(input)
export const makeUserRow = (input: unknown) => S.decodeUnknown(UserRowSchema)(input)
