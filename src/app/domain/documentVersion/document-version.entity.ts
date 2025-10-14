import { Effect, Option, ParseResult, Schema as S, Clock } from "effect"
import { DocumentVersion as DocumentVersionSchema } from "@domain/documentVersion/document-version.schema"
import { Sha256 } from "@domain/refined/checksum"
import { FileKey, FileSize, MimeType } from "@domain/refined/file-reference"
import { DocumentId, DocumentVersionId, UserId } from "@domain/refined/ids"
import { DocumentVersionValidationError } from "@domain/documentVersion/document-version.error"
import { mapParseError } from "@domain/utils/option.utils"
import { getCurrentTime } from "@domain/utils/audit-trail"
import { isFirstVersion as isFirstVersionNum, isNewerThan as isNewerVersionNum, isOlderThan as isOlderVersionNum } from "@domain/documentVersion/version-number.vo"
import { FileMetadata } from "@domain/documentVersion/file-metadata.vo"
import { serializeWith } from "@domain/utils/schema-transform"

export type DocumentVersionType = S.Schema.Type<typeof DocumentVersionSchema>
export type SerializedDocumentVersion =
  S.Schema.Encoded<typeof DocumentVersionSchema>

export class DocumentVersionEntity {
  readonly id!: DocumentVersionId
  readonly documentId!: DocumentId
  readonly version!: number
  readonly file!: FileMetadata
  readonly createdBy!: Option.Option<UserId>
  readonly createdAt!: Date
  readonly updatedAt!: Option.Option<Date>

  static create(
    input: SerializedDocumentVersion
  ): Effect.Effect<DocumentVersionEntity, DocumentVersionValidationError, Clock.Clock> {
    return getCurrentTime().pipe(
      Effect.flatMap((now) => {
        const dataWithAudit = {
          ...input,
          createdAt: input.createdAt || now,
          updatedAt: input.updatedAt
        }
        return S.decodeUnknown(DocumentVersionSchema)(dataWithAudit).pipe(
          Effect.map((data) => new DocumentVersionEntity(data)),
          Effect.mapError((error) => new DocumentVersionValidationError(
            mapParseError(error as ParseResult.ParseError, (m) => `DocumentVersion validation failed: ${m}`),
            "documentVersion",
            input
          ))
        )
      })
    ) as Effect.Effect<DocumentVersionEntity, DocumentVersionValidationError, Clock.Clock>
  }

  private constructor(data: DocumentVersionType) {
    this.id = data.id
    this.createdAt = data.createdAt
    this.updatedAt = data.updatedAt
    this.documentId = data.documentId
    this.version = data.version
    this.file = data.file
    this.createdBy = data.createdBy
  }

  serialized(): Effect.Effect<SerializedDocumentVersion, ParseResult.ParseError, never> {
    return serializeWith(DocumentVersionSchema, this as unknown as DocumentVersionType)
  }

  get hasCreatorInfo(): boolean {
    return Option.isSome(this.createdBy)
  }

  get sizeInKB(): number {
    return Math.round((this.file.size as unknown as number) / 1024)
  }

  get sizeInMB(): number {
    const sizeNum = this.file.size as unknown as number
    return Math.round((sizeNum / (1024 * 1024)) * 100) / 100
  }

  get isFirstVersion(): boolean {
    return isFirstVersionNum(this.version)
  }

  getCreatorIdOption(): Option.Option<UserId> {
    return this.createdBy
  }

  isForDocument(documentId: DocumentId): boolean {
    return this.documentId === documentId
  }

  isVersion(version: number): boolean {
    return this.version === version
  }

  isNewerThan(other: DocumentVersionEntity): boolean {
    return isNewerVersionNum(this.version, other.version)
  }

  isOlderThan(other: DocumentVersionEntity): boolean {
    return isOlderVersionNum(this.version, other.version)
  }

  get checksum(): Sha256 {
    return this.file.checksum
  }
  get fileKey(): FileKey {
    return this.file.fileKey
  }
  get mimeType(): MimeType {
    return this.file.mimeType
  }
  get size(): FileSize {
    return this.file.size
  }
}
