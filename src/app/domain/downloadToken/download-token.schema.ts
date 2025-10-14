import { Schema as S } from "effect"
import { DateTimeFromAny } from "@domain/refined/date-time"
import { Optional } from "@domain/utils/schema.utils"
import { DocumentId, DownloadTokenId, UserId } from "@domain/refined/ids"
import { BaseEntitySchema } from "@domain/utils/schema.base"
import { DownloadTokenString } from "@domain/downloadToken/download-token.string.vo"
import { ExpiryWindow } from "@domain/downloadToken/expiry-window.vo"

export const DownloadToken = S.extend(
  BaseEntitySchema(DownloadTokenId),
  S.Struct({
  token: DownloadTokenString,
  documentId: DocumentId,
  issuedTo: UserId,
  expiresAt: ExpiryWindow()(DateTimeFromAny),
  usedAt: Optional(DateTimeFromAny),
})
)
export type DownloadToken = S.Schema.Type<typeof DownloadToken>
