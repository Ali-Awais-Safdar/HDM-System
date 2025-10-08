import { Schema as S } from "effect"

export const FileKey = S.String.pipe(
  S.filter((s) => s.trim().length > 0, { message: () => "FileKey must be non-empty" }),
  S.brand("FileKey")
)
export type FileKey = S.Schema.Type<typeof FileKey>

export const MimeType = S.String.pipe(
  S.filter((s) => s.includes("/") && !s.endsWith("/"), { message: () => "Invalid MIME type" }),
  S.brand("MimeType")
)
export type MimeType = S.Schema.Type<typeof MimeType>

export const FileSize = S.Number.pipe(
  S.int(),
  S.filter((n) => n >= 0, { message: () => "FileSize must be >= 0" }),
  S.brand("FileSize")
)
export type FileSize = S.Schema.Type<typeof FileSize>

// Sync factory functions for internal use
export const makeFileKeySync = (input: unknown) => S.decodeUnknownSync(FileKey)(input)
export const makeMimeTypeSync = (input: unknown) => S.decodeUnknownSync(MimeType)(input)
export const makeFileSizeSync = (input: unknown) => S.decodeUnknownSync(FileSize)(input)

// Effect-based factory functions for pipeline use
export const makeFileKey = (input: unknown) => S.decodeUnknown(FileKey)(input)
export const makeMimeType = (input: unknown) => S.decodeUnknown(MimeType)(input)
export const makeFileSize = (input: unknown) => S.decodeUnknown(FileSize)(input)
