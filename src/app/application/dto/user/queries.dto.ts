import { Schema as S } from "effect"
import { UserId } from "@domain/refined/ids"

// ===== QUERY SCHEMAS (Internal, with injected auth/workspace fields) =====

export const GetProfileQuerySchema = S.Struct({
  actorId: UserId
})
export type GetProfileQuery = S.Schema.Type<typeof GetProfileQuerySchema>
export type GetProfileQueryEncoded = S.Schema.Encoded<typeof GetProfileQuerySchema>

