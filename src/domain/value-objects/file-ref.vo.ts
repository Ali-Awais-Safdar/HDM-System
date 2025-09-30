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

// Factory functions for creating file reference types from unknown input
export const makeFileKey = (input: unknown) => S.decodeUnknownSync(FileKey)(input)
export const makeMimeType = (input: unknown) => S.decodeUnknownSync(MimeType)(input)
export const makeFileSize = (input: unknown) => S.decodeUnknownSync(FileSize)(input)
