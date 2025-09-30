import { Schema as S } from "effect"
import { UserId } from "../value-objects/id.vo"
import { EmailAddress } from "../value-objects/email.vo"
import { DateTime } from "../value-objects/datetime.vo"
import { Role } from "./access-policy.schema"
import { isValidPasswordHash, isValidUserRole, isValidUuid } from "../guards/domain.guards"

export const UserRole = S.Literal("admin", "user")
export type UserRole = S.Schema.Type<typeof UserRole>

// Domain schema with embedded guards
export const User = S.Struct({
  id: UserId,
  email: EmailAddress,
  passwordHash: S.String.pipe(
    S.filter(isValidPasswordHash, { message: () => "Password hash cannot be empty" })
  ),
  roles: S.Array(Role).pipe(
    S.filter(roles => roles.length > 0, { message: () => "User must have at least one role" }),
    S.filter(roles => roles.every(isValidUserRole), { message: () => "Invalid user role" })
  ),
  workspaceIds: S.Array(S.String.pipe(
    S.filter(s => s.trim().length > 0, { message: () => "Workspace ID cannot be empty" }),
    S.filter(isValidUuid, { message: () => "Workspace ID must be a valid UUID" })
  )),
  createdAt: DateTime
})
export type User = S.Schema.Type<typeof User>

// Persistence row (snake_case) - wire format
export const UserRow = S.Struct({
  id: S.String,
  email: S.String,
  password_hash: S.String,
  roles: S.Array(S.String),
  workspace_ids: S.Array(S.String),
  created_at: S.Date
})
export type UserRow = S.Schema.Type<typeof UserRow>

// Transform Row <-> Domain (normalize at boundaries)
export const UserCodec = S.transform(UserRow, User, {
  decode: (r) => ({
    id: r.id as any,
    email: r.email as any,
    passwordHash: r.password_hash,
    roles: r.roles as any,
    workspaceIds: r.workspace_ids,
    createdAt: r.created_at
  }),
  encode: (d) => ({
    id: d.id,
    email: d.email,
    password_hash: d.passwordHash,
    roles: d.roles,
    workspace_ids: d.workspaceIds,
    created_at: d.createdAt
  }),
  strict: false
})

// Factory functions for creating from unknown input
export const makeUser = (input: unknown) => S.decodeUnknownSync(User)(input)
export const makeUserRow = (input: unknown) => S.decodeUnknownSync(UserRow)(input)
