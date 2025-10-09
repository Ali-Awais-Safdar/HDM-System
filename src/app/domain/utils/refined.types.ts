import { Schema as S } from "effect"
import {
  DateTime,
  DateTimeEpoch,
  DateTimeIso
} from "@domain/refined/date-time"
import { EmailAddress } from "@domain/refined/email"
import { Sha256 } from "@domain/refined/checksum"
import {
  FileKey,
  FileSize,
  MimeType
} from "@domain/refined/file-reference"
import { HashedPassword } from "@domain/refined/hashed-password"
import { Password } from "@domain/refined/password"
import {
  DocumentId,
  DocumentVersionId,
  DownloadTokenId,
  UserId,
  WorkspaceId
} from "@domain/refined/ids"
import { Uuid } from "@domain/refined/uuid"
import { Optional as OptionalOption } from "@domain/utils/schema.utils"

/**
 * Alias exports to keep the refined types discoverable under utils.
 */
export {
  DateTime,
  DateTimeEpoch,
  DateTimeIso,
  DocumentId,
  DocumentVersionId,
  DownloadTokenId,
  EmailAddress,
  FileKey,
  FileSize,
  HashedPassword,
  MimeType,
  Password,
  Sha256,
  UserId,
  WorkspaceId
}

export const UUID = Uuid
export type UUID = S.Schema.Type<typeof UUID>

/**
 * Transformer that accepts string input and validates/coerces it into a UUID.
 */
export const StringToUUID = S.transform(S.String, UUID, {
  decode: (value) => value,
  encode: (_toI: string, value: S.Schema.Type<typeof UUID>) => value,
  strict: false
})

/**
 * Transformer that accepts numbers (epoch), ISO strings, or Date instances.
 */
export const DateTimeFromAny = S.transform(
  S.Union(S.Date, S.String, S.Number),
  DateTime,
  {
    decode: (value) => {
      if (value instanceof Date) {
        return value
      }
      if (typeof value === "number") {
        return S.decodeUnknownSync(DateTimeEpoch)(value)
      }
      return S.decodeUnknownSync(DateTimeIso)(value)
    },
    encode: (_toI: Date | string | number, value: S.Schema.Type<typeof DateTime>) =>
      value,
    strict: false
  }
)

/**
 * Helper for optional schema fields with null handling.
 * Delegates to the core Optional helper to keep behaviour consistent.
 */
export const Optional = OptionalOption
