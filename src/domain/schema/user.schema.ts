import { Schema as S } from "effect"
import { UserId } from "../value-objects/id.vo"
import { EmailAddress } from "../value-objects/email.vo"
import { DateTime } from "../value-objects/datetime.vo"
import { RoleSchema } from "./access-policy.schema"
import { isValidPasswordHash, isValidUserRole } from "../guards/domain.guards"


// Domain schema with embedded guards
export const UserSchema = S.Struct({
  id: UserId,
  email: EmailAddress,
  passwordHash: S.String.pipe(
    S.filter(isValidPasswordHash, { message: () => "Password hash cannot be empty" })
  ),
  roles: S.Array(RoleSchema).pipe(
    S.filter(roles => roles.length > 0, { message: () => "User must have at least one role" }),
    S.filter(roles => roles.every(isValidUserRole), { message: () => "Invalid user role" })
  ),
  createdAt: DateTime
})
export type User = S.Schema.Type<typeof UserSchema>

// Persistence row (snake_case) - wire format
export const UserRowSchema = S.Struct({
  id: S.String,
  email: S.String,
  password_hash: S.String,
  roles: S.Array(S.String),
  created_at: S.Date
})
export type UserRow = S.Schema.Type<typeof UserRowSchema>

// Transform Row <-> Domain (normalize at boundaries)
export const UserCodec = S.transform(UserRowSchema, UserSchema, {
  decode: (r) => ({
    id: r.id as any,
    email: r.email as any,
    passwordHash: r.password_hash,
    roles: r.roles as any,
    createdAt: r.created_at
  }),
  encode: (d) => ({
    id: d.id,
    email: d.email,
    password_hash: d.passwordHash,
    roles: d.roles,
    created_at: d.createdAt
  }),
  strict: false
})

// Factory functions for creating from unknown input using Effect pipeline
export const makeUser = (input: unknown) => S.decodeUnknown(UserSchema)(input)
export const makeUserRow = (input: unknown) => S.decodeUnknown(UserRowSchema)(input)
