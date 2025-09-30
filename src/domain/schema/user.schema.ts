import { Schema as S } from "effect"
import { UserId } from "../value-objects/id.vo"
import { EmailAddress } from "../value-objects/email.vo"
import { DateTime } from "../value-objects/datetime.vo"

export const UserRole = S.Literal("admin", "user")
export type UserRole = S.Schema.Type<typeof UserRole>

export const User = S.Struct({
  id: UserId,
  email: EmailAddress,
  passwordHash: S.String.pipe(
    S.filter(s => s.trim().length > 0, { message: () => "Password hash cannot be empty" })
  ),
  role: UserRole,
  createdAt: DateTime
})
export type User = S.Schema.Type<typeof User>

// Persistence row (snake_case)
export const UserRow = S.Struct({
  id: S.String,
  email: S.String,
  password_hash: S.String,
  role: S.String,
  created_at: S.Date
})
export type UserRow = S.Schema.Type<typeof UserRow>

// Transform Row <-> Domain
export const UserCodec = S.transform(UserRow, User, {
  decode: (r) => ({
    id: r.id as any,
    email: r.email as any,
    passwordHash: r.password_hash,
    role: r.role as any,
    createdAt: r.created_at
  }),
  encode: (d) => ({
    id: d.id,
    email: d.email,
    password_hash: d.passwordHash,
    role: d.role,
    created_at: d.createdAt
  }),
  strict: false
})

// Factory functions
export const makeUser = (input: unknown) => S.decodeUnknownSync(User)(input)
export const makeUserRow = (input: unknown) => S.decodeUnknownSync(UserRow)(input)
