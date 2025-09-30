import { Effect, Schema as S, Option } from "effect"
import { DocumentVersion } from "../schema/document-version.schema"
import { ValidationError } from "../errors/domain.errors"
import { DocumentVersionId, DocumentId, UserId } from "../value-objects/id.vo"
import { Sha256 } from "../value-objects/checksum.vo"
import { FileKey, MimeType, FileSize } from "../value-objects/file-ref.vo"
import { fromNullable, toNullable, isSome } from "../utils/option.utils"

export class DocumentVersionEntity {
  private constructor(readonly props: S.Schema.Type<typeof DocumentVersion>) {}

  // Effect-based factory for creating from unknown input
  static create = (input: unknown): Effect.Effect<DocumentVersionEntity, ValidationError> => {
    return Effect.gen(function* () {
      const props = yield* Effect.try({
        try: () => S.decodeUnknownSync(DocumentVersion)(input),
        catch: (error) => new ValidationError(
          `Invalid document version data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          undefined,
          input
        )
      })
      return new DocumentVersionEntity(props)
    })
  }

  // Effect-based factory for creating new document versions
  static createNew = (props: {
    id: DocumentVersionId;
    documentId: DocumentId;
    version: number;
    checksum: Sha256;
    fileKey: FileKey;
    mimeType: MimeType;
    size: FileSize;
    createdBy?: UserId;
  }): Effect.Effect<DocumentVersionEntity, ValidationError> => {
    return Effect.gen(function* () {
      const versionData = {
        ...props,
        createdAt: new Date(),
        createdBy: props.createdBy ? Option.some(props.createdBy) : Option.none()
      }
      
      const validatedProps = yield* Effect.try({
        try: () => S.decodeUnknownSync(DocumentVersion)(versionData),
        catch: (error) => new ValidationError(
          `Invalid document version data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          undefined,
          versionData
        )
      })
      
      return new DocumentVersionEntity(validatedProps)
    })
  }

  // Effect-based factory for reconstructing from persistence
  static fromPersistence = (input: unknown): Effect.Effect<DocumentVersionEntity, ValidationError> => {
    return DocumentVersionEntity.create(input)
  }

  // Unsafe factory for internal use when data is already validated
  static unsafe = (props: S.Schema.Type<typeof DocumentVersion>): DocumentVersionEntity => {
    return new DocumentVersionEntity(props)
  }

  // convenience read accessors
  get id() { return this.props.id }
  get documentId() { return this.props.documentId }
  get version() { return this.props.version }
  get checksum() { return this.props.checksum }
  get fileKey() { return this.props.fileKey }
  get mimeType() { return this.props.mimeType }
  get size() { return this.props.size }
  get createdAt() { return this.props.createdAt }
  get createdBy() { return this.props.createdBy }

  // Business logic methods
  hasCreator(): boolean {
    return isSome(this.createdBy)
  }

  getCreatorId(): UserId | null {
    return toNullable(this.createdBy)
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

  // Serialization method using schema encode
  toWireFormat = (): S.Schema.Type<typeof DocumentVersion> => {
    return S.encodeSync(DocumentVersion)(this.props)
  }

  // Plain object for external APIs
  toPlainObject = () => {
    return {
      id: this.id,
      documentId: this.documentId,
      version: this.version,
      checksum: this.checksum,
      fileKey: this.fileKey,
      mimeType: this.mimeType,
      size: this.size,
      createdAt: this.createdAt,
      createdBy: toNullable(this.createdBy)
    }
  }
}
