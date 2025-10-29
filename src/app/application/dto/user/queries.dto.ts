import { Schema as S } from "effect"
import { UserId } from "@domain/refined/ids"

// ===== INPUT SCHEMAS (Client-supplied, no auth/workspace fields) =====

export const GetProfileInputSchema = S.Struct({})
export type GetProfileInput = S.Schema.Type<typeof GetProfileInputSchema>

// ===== QUERY SCHEMAS (Internal, with injected auth/workspace fields) =====

export const GetProfileQuerySchema = S.Struct({
  actorId: UserId
})
export type GetProfileQuery = S.Schema.Type<typeof GetProfileQuerySchema>
export type GetProfileQueryEncoded = S.Schema.Encoded<typeof GetProfileQuerySchema>

