import { Schema as S } from "effect"
import { UserId } from "@domain/refined/ids"
import { DateTimeFromString } from "@domain/refined/date-time"
import { UserFields } from "@domain/user/user.schema"

export const UserSummarySchema = S.Struct({
  id: UserId,
  email: UserFields.email,
  roles: UserFields.roles,
  workspaceId: UserFields.workspaceId,
  createdAt: DateTimeFromString, // ISO date string
  updatedAt: S.optional(DateTimeFromString) // ISO date string, optional
})
export type UserSummaryEncoded = S.Schema.Encoded<typeof UserSummarySchema>

export const AuthSessionSchema = S.Struct({
  token: S.String, // JWT token string
  expiresAt: DateTimeFromString // ISO date string
})
export type AuthSessionEncoded = S.Schema.Encoded<typeof AuthSessionSchema>

export const SignUpResponseSchema = S.Struct({
  user: UserSummarySchema,
  session: S.optional(AuthSessionSchema)
})
export type SignUpResponseEncoded = S.Schema.Encoded<typeof SignUpResponseSchema>

export const LoginResponseSchema = S.Struct({
  user: UserSummarySchema,
  session: AuthSessionSchema
})
export type LoginResponseEncoded = S.Schema.Encoded<typeof LoginResponseSchema>

export const ChangePasswordResponseSchema = S.Struct({
  success: S.Boolean,
  message: S.optional(S.String)
})
export type ChangePasswordResponseEncoded = S.Schema.Encoded<typeof ChangePasswordResponseSchema>

