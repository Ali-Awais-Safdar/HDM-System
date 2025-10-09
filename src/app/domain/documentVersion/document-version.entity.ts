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

export class DocumentVersionEntity
  extends BaseEntity<typeof DocumentVersionSchema, DocumentVersionType>
  implements IDocumentVersion
{
  private constructor(data: DocumentVersionType) {
    super(DocumentVersionSchema, data)
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

  serialized(): Effect.Effect<
    SerializedDocumentVersion,
    ParseResult.ParseError,
    never
  > {
    return super.serialized() as Effect.Effect<
      SerializedDocumentVersion,
      ParseResult.ParseError,
      never
    >
  }

  get id(): DocumentVersionId {
    return this.data.id
  }

  get documentId(): DocumentId {
    return this.data.documentId
  }

  get version(): number {
    return this.data.version
  }

  get checksum(): Sha256 {
    return this.data.checksum
  }

  get fileKey(): FileKey {
    return this.data.fileKey
  }

  get mimeType(): MimeType {
    return this.data.mimeType
  }

  get size(): FileSize {
    return this.data.size
  }

  get createdBy(): Option.Option<UserId> {
    return this.data.createdBy
  }

  get createdAt(): Date {
    return this.data.createdAt
  }

  get updatedAt(): Date | null {
    return Option.getOrNull(this.data.updatedAt)
  }

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
