import { Schema as S, Option } from "effect"
import { RoleSchema } from "@domain/accessPolicy/access-policy.schema"
import { UserGuards } from "@domain/user/user.guards"
import { Optional } from "@domain/utils/schema.utils"
import { toNullable } from "@domain/utils/option.utils"
import { DateTime } from "@domain/refined/date-time"
import { EmailAddress } from "@domain/refined/email"
import { HashedPassword } from "@domain/refined/hashed-password"
import { UserId, WorkspaceId } from "@domain/refined/ids"

export const UserSchema = S.Struct({
  id: UserId,
  email: EmailAddress,
  passwordHash: HashedPassword,
  roles: S.Array(RoleSchema).pipe(UserGuards.ValidRoles),
  workspaceId: Optional(WorkspaceId), // Accepts null/undefined and transforms to Option<WorkspaceId>
  createdAt: DateTime
})
export type User = S.Schema.Type<typeof UserSchema>

export const UserRowSchema = S.Struct({
  id: S.String,
  email: S.String,
  password_hash: S.String,
  roles: S.Array(S.String),
  workspace_id: S.Union(S.String, S.Null),
  created_at: S.Date
})
export type UserRow = S.Schema.Type<typeof UserRowSchema>

export const UserCodec = S.transform(UserRowSchema, UserSchema, {
  decode: (r) => ({
    id: r.id as any,
    email: r.email as any,
    passwordHash: r.password_hash,
    roles: r.roles as any,
    workspaceId: r.workspace_id != null ? Option.some(r.workspace_id as any) : Option.none(),
    createdAt: r.created_at
  }),
  encode: (d) => ({
    id: d.id,
    email: d.email,
    password_hash: d.passwordHash,
    roles: d.roles,
    workspace_id: toNullable(d.workspaceId as any),
    created_at: d.createdAt
  }),
  strict: false
})

export const makeUser = (input: unknown) => S.decodeUnknown(UserSchema)(input)
export const makeUserRow = (input: unknown) => S.decodeUnknown(UserRowSchema)(input)
