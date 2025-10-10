import { Effect, Option, ParseResult, Schema as S } from "effect"
import { DocumentVersion as DocumentVersionSchema } from "@domain/documentVersion/document-version.schema"
import { BaseEntity, type IEntity } from "@domain/utils/base.entity"
import { Sha256 } from "@domain/refined/checksum"
import { FileKey, FileSize, MimeType } from "@domain/refined/file-reference"
import { DocumentId, DocumentVersionId, UserId } from "@domain/refined/ids"
import { DocumentVersionValidationError } from "@domain/documentVersion/document-version.error"
import { formatParseError } from "@domain/utils/option.utils"

export interface IDocumentVersion extends IEntity<DocumentVersionId> {
  readonly id: DocumentVersionId
  readonly documentId: DocumentId
  readonly version: number
  readonly checksum: Sha256
  readonly fileKey: FileKey
  readonly mimeType: MimeType
  readonly size: FileSize
  readonly createdBy: Option.Option<UserId>
}

export type DocumentVersionType = S.Schema.Type<typeof DocumentVersionSchema>
export type SerializedDocumentVersion =
  S.Schema.Encoded<typeof DocumentVersionSchema>

export class DocumentVersionEntity extends BaseEntity implements IDocumentVersion {
  readonly documentId!: DocumentId
  readonly version!: number
  readonly checksum!: Sha256
  readonly fileKey!: FileKey
  readonly mimeType!: MimeType
  readonly size!: FileSize
  readonly createdBy!: Option.Option<UserId>

  private constructor(data: DocumentVersionType) {
    super()
    this._fromSerialized({
      id: data.id,
      createdAt: data.createdAt,
      updatedAt: Option.getOrNull(data.updatedAt)
    })
    this.documentId = data.documentId
    this.version = data.version
    this.checksum = data.checksum
    this.fileKey = data.fileKey
    this.mimeType = data.mimeType
    this.size = data.size
    this.createdBy = data.createdBy
  }

  static create(
    input: SerializedDocumentVersion
  ): Effect.Effect<DocumentVersionEntity, DocumentVersionValidationError, never> {
    return S.decodeUnknown(DocumentVersionSchema)(input).pipe(
      Effect.map((data) => new DocumentVersionEntity(data)),
      Effect.mapError((error) => DocumentVersionEntity.toValidationError(error, input))
    ) as Effect.Effect<DocumentVersionEntity, DocumentVersionValidationError, never>
  }

  private static toValidationError(
    error: unknown,
    input: SerializedDocumentVersion
  ): DocumentVersionValidationError {
    if (error instanceof DocumentVersionValidationError) {
      return error
    }
    return new DocumentVersionValidationError(
      `DocumentVersion validation failed: ${formatParseError(error as ParseResult.ParseError)}`,
      "documentVersion",
      input
    )
  }

  // Use BaseEntity.serialized with DocumentVersionSchema when needed

  // id, createdAt, updatedAt from BaseEntity; rest from direct fields

  get hasCreatorInfo(): boolean {
    return Option.isSome(this.createdBy)
  }

  get sizeInKB(): number {
    return Math.round(this.size / 1024)
  }

  get sizeInMB(): number {
    return Math.round((this.size / (1024 * 1024)) * 100) / 100
  }

  get isFirstVersion(): boolean {
    return this.version === 1
  }

  hasCreator(): boolean {
    return this.hasCreatorInfo
  }

  getCreatorId(): UserId | null {
    return Option.getOrNull(this.createdBy)
  }

  isForDocument(documentId: DocumentId): boolean {
    return this.documentId === documentId
  }

  isVersion(version: number): boolean {
    return this.version === version
  }

  isNewerThan(other: DocumentVersionEntity): boolean {
    return this.version > other.version
  }

  isOlderThan(other: DocumentVersionEntity): boolean {
    return this.version < other.version
  }
}
