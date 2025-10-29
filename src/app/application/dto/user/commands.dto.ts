import { Schema as S } from "effect"
import { UserId } from "@domain/refined/ids"
import { Password } from "@domain/refined/password"
import { UserFields } from "@domain/user/user.schema"

// ===== INPUT SCHEMAS (Client-supplied, no auth/workspace fields) =====

export const SignUpInputSchema = S.Struct({
  email: UserFields.email,
  password: Password, // Raw password before hashing
  roles: S.optional(UserFields.roles)
})
export type SignUpInput = S.Schema.Type<typeof SignUpInputSchema>
export type SignUpInputEncoded = S.Schema.Encoded<typeof SignUpInputSchema>

export const LoginInputSchema = S.Struct({
  email: UserFields.email,
  password: Password // Raw password for verification
})
export type LoginInput = S.Schema.Type<typeof LoginInputSchema>
export type LoginInputEncoded = S.Schema.Encoded<typeof LoginInputSchema>

// ===== COMMAND SCHEMAS (Internal, with injected auth/workspace fields) =====

export const ChangePasswordInputSchema = S.Struct({
  oldPassword: Password,
  newPassword: Password
})
export type ChangePasswordInput = S.Schema.Type<typeof ChangePasswordInputSchema>

export const ChangePasswordCommandSchema = ChangePasswordInputSchema.pipe(
  S.extend(S.Struct({
    userId: UserId,
    actorId: UserId
  }))
)
export type ChangePasswordCommand = S.Schema.Type<typeof ChangePasswordCommandSchema>
export type ChangePasswordCommandEncoded = S.Schema.Encoded<typeof ChangePasswordCommandSchema>

