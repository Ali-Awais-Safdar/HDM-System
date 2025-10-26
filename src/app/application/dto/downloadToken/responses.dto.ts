import { Schema as S } from "effect"
import { DownloadTokenId, DocumentId, UserId } from "@domain/refined/ids"
import { DateTimeFromString } from "@domain/refined/date-time"
import { DownloadTokenString } from "@domain/downloadToken/download-token.string.vo"
import { ExpiryWindow } from "@domain/downloadToken/expiry-window.vo"
import { Optional } from "@domain/utils/schema.utils"

export const DownloadTokenResponseSchema = S.Struct({
  id: DownloadTokenId,
  token: DownloadTokenString,
  documentId: DocumentId,
  issuedTo: UserId,
  expiresAt: ExpiryWindow()(DateTimeFromString), // Uses ExpiryWindow wrapper like domain schema
  usedAt: Optional(DateTimeFromString), // ISO date string or Option.none
  createdAt: DateTimeFromString, // ISO date string
  updatedAt: Optional(DateTimeFromString) // ISO date string or Option.none
})
export type DownloadTokenResponse = S.Schema.Type<typeof DownloadTokenResponseSchema>
export type DownloadTokenResponseEncoded = S.Schema.Encoded<typeof DownloadTokenResponseSchema>

export const decodeDownloadTokenResponse = S.decodeUnknown(DownloadTokenResponseSchema)

export const PaginatedDownloadTokensResponseSchema = S.Struct({
  data: S.Array(DownloadTokenResponseSchema),
  total: S.Number,
  pageNum: S.Number,
  pageSize: S.Number,
  totalPages: S.Number
})
export type PaginatedDownloadTokensResponse = S.Schema.Type<typeof PaginatedDownloadTokensResponseSchema>
export type PaginatedDownloadTokensResponseEncoded = S.Schema.Encoded<typeof PaginatedDownloadTokensResponseSchema>

export const decodePaginatedDownloadTokensResponse = S.decodeUnknown(PaginatedDownloadTokensResponseSchema)

export const ValidateDownloadTokenResponseSchema = S.Struct({
  valid: S.Boolean,
  token: S.optional(DownloadTokenResponseSchema), // Include token if valid for additional context
  reason: S.optional(S.Literal("NOT_FOUND", "EXPIRED", "ALREADY_USED", "INVALID")) // Why validation failed (only present when valid=false)
})
export type ValidateDownloadTokenResponse = S.Schema.Type<typeof ValidateDownloadTokenResponseSchema>
export type ValidateDownloadTokenResponseEncoded = S.Schema.Encoded<typeof ValidateDownloadTokenResponseSchema>

export const decodeValidateDownloadTokenResponse = S.decodeUnknown(ValidateDownloadTokenResponseSchema)

export const RevokeDownloadTokenResponseSchema = S.Struct({
  success: S.Boolean,
  tokenId: DownloadTokenId
})
export type RevokeDownloadTokenResponse = S.Schema.Type<typeof RevokeDownloadTokenResponseSchema>
export type RevokeDownloadTokenResponseEncoded = S.Schema.Encoded<typeof RevokeDownloadTokenResponseSchema>

export const decodeRevokeDownloadTokenResponse = S.decodeUnknown(RevokeDownloadTokenResponseSchema)

export const DownloadTokenResponseDTO = {
  // Response Schemas
  DownloadTokenResponseSchema,
  PaginatedDownloadTokensResponseSchema,
  ValidateDownloadTokenResponseSchema,
  RevokeDownloadTokenResponseSchema,
  
  // Response Decoders
  decodeDownloadTokenResponse,
  decodePaginatedDownloadTokensResponse,
  decodeValidateDownloadTokenResponse,
  decodeRevokeDownloadTokenResponse
} as const
