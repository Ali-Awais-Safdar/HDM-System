import { Schema as S, Option } from "effect"
import { UserId, WorkspaceId } from "@domain/refined/ids"
import { Role, RoleSchema } from "@domain/accessPolicy/access-policy.schema"
import { Optional } from "@domain/utils/schema.utils"

/**
 * JWT Payload Structure
 * 
 * This defines the expected structure of JWT tokens used throughout the application.
 * Tokens are validated using Effect Schema for type-safe decoding at runtime.
 */
export const JWTPayloadSchema = S.Struct({
  // Standard JWT claims
  sub: UserId, // Subject - User ID
  iat: S.Number, // Issued At timestamp
  exp: S.Number, // Expiration timestamp
  jti: S.optional(S.String), // JWT ID - unique token identifier
  
  // Custom application claims
  workspaceId: Optional(WorkspaceId), // Optional workspace ID for multi-tenancy
  roles: S.Array(RoleSchema), // User roles for authorization
})

export type JWTPayload = S.Schema.Type<typeof JWTPayloadSchema>

export type JWTPayloadEncoded = S.Schema.Encoded<typeof JWTPayloadSchema>

export const decodeJWTPayload = S.decodeUnknown(JWTPayloadSchema)

export type JWTPayloadInput = Omit<JWTPayload, "iat" | "exp" | "jti"> & {
  jti?: string
}

export const getUserIdFromPayload = (payload: JWTPayload): UserId => payload.sub

export const isAdminUser = (payload: JWTPayload): boolean => 
  payload.roles.includes("ADMIN")

export const hasRole = (payload: JWTPayload, role: Role): boolean =>
  payload.roles.includes(role)

export const getWorkspaceId = (payload: JWTPayload): Option.Option<WorkspaceId> =>
  payload.workspaceId

export const hasWorkspace = (payload: JWTPayload): boolean =>
  Option.isSome(payload.workspaceId)

