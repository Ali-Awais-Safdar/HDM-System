import { Schema as S } from "effect"
import { DownloadTokenId, DocumentId, UserId } from "@domain/refined/ids"
import { DateTimeFromString } from "@domain/refined/date-time"
import { DownloadTokenString } from "@domain/downloadToken/download-token.string.vo"
import { ExpiryWindow } from "@domain/downloadToken/expiry-window.vo"
import { Optional } from "@domain/utils/schema.utils"
import { PageNumber, VersionPageSize } from "@domain/utils/pagination"

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
export type DownloadTokenResponseEncoded = S.Schema.Encoded<typeof DownloadTokenResponseSchema>

export const PaginatedDownloadTokensResponseSchema = S.Struct({
  data: S.Array(DownloadTokenResponseSchema),
  total: S.Number,
  pageNum: PageNumber,
  pageSize: VersionPageSize,
  totalPages: S.Number
})
export type PaginatedDownloadTokensResponseEncoded = S.Schema.Encoded<typeof PaginatedDownloadTokensResponseSchema>

export const ValidateDownloadTokenResponseSchema = S.Struct({
  valid: S.Boolean,
  token: S.optional(DownloadTokenResponseSchema), // Include token if valid for additional context
  reason: S.optional(S.Literal("NOT_FOUND", "EXPIRED", "ALREADY_USED", "INVALID")) // Why validation failed (only present when valid=false)
})
export type ValidateDownloadTokenResponseEncoded = S.Schema.Encoded<typeof ValidateDownloadTokenResponseSchema>

export const RevokeDownloadTokenResponseSchema = S.Struct({
  success: S.Boolean,
  tokenId: DownloadTokenId
})
export type RevokeDownloadTokenResponseEncoded = S.Schema.Encoded<typeof RevokeDownloadTokenResponseSchema>

