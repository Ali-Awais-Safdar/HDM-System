import { Schema as S } from "effect"
import { DateTimeFromString } from "@domain/refined/date-time"
import { Optional } from "@domain/utils/schema.utils"
import { DocumentId, DownloadTokenId, UserId } from "@domain/refined/ids"
import { BaseEntitySchema } from "@domain/utils/schema.base"
import { DownloadTokenString } from "@domain/downloadToken/download-token.string.vo"
import { ExpiryWindow } from "@domain/downloadToken/expiry-window.vo"

export const DownloadTokenStruct = S.Struct({
  token: DownloadTokenString,
  documentId: DocumentId,
  issuedTo: UserId,
  expiresAt: ExpiryWindow()(DateTimeFromString),
  usedAt: Optional(DateTimeFromString),
})

export const DownloadTokenFields = DownloadTokenStruct.fields

export const DownloadToken = S.extend(
  BaseEntitySchema(DownloadTokenId),
  DownloadTokenStruct
)
export type DownloadToken = S.Schema.Type<typeof DownloadToken>
