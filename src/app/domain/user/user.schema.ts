import { Schema as S, Option } from "effect"
import { RoleSchema } from "@domain/accessPolicy/access-policy.schema"
import { isValidUserRole } from "@domain/utils/domain.guards"
import { DateTime } from "@domain/value-objects/datetime.vo"
import { EmailAddress } from "@domain/value-objects/email.vo"
import { HashedPassword } from "@domain/value-objects/hashed-password.vo"
import { UserId, WorkspaceId } from "@domain/value-objects/id.vo"

export const UserSchema = S.Struct({
  id: UserId,
  email: EmailAddress,
  passwordHash: HashedPassword,
  roles: S.Array(RoleSchema).pipe(
    S.filter(roles => roles.length > 0, { message: () => "User must have at least one role" }),
    S.filter(roles => roles.every(isValidUserRole), { message: () => "Invalid user role" })
  ),
  workspaceId: S.Option(WorkspaceId),
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
    workspace_id: d.workspaceId._tag === "Some" ? d.workspaceId.value : null,
    created_at: d.createdAt
  }),
  strict: false
})

export const makeUser = (input: unknown) => S.decodeUnknown(UserSchema)(input)
export const makeUserRow = (input: unknown) => S.decodeUnknown(UserRowSchema)(input)
