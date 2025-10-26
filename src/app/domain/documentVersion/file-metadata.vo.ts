import { Schema as S } from "effect"
import { Sha256 } from "@domain/refined/checksum"
import { FileKey, FileSize, MimeType } from "@domain/refined/file-reference"
import { DocumentVersionGuards } from "@domain/documentVersion/document-version.guards"

export const FileMetadataStruct = S.Struct({
  checksum: Sha256,
  fileKey: FileKey,
  mimeType: MimeType.pipe(DocumentVersionGuards.ValidMimeType),
  size: FileSize.pipe(DocumentVersionGuards.ValidFileSize)
})

export const FileMetadataFields = FileMetadataStruct.fields

export const FileMetadata = FileMetadataStruct.pipe(S.brand("FileMetadata"))

export type FileMetadata = S.Schema.Type<typeof FileMetadata>


