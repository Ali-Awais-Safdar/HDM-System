import { Effect, Schema as S, Option } from "effect"
import { DocumentVersion } from "../schema/document-version.schema"
import { ValidationError } from "../errors/domain.errors"
import { DocumentVersionId, DocumentId, UserId } from "../value-objects/id.vo"
import { Sha256 } from "../value-objects/checksum.vo"
import { FileKey, MimeType, FileSize } from "../value-objects/file-ref.vo"
import { fromNullable, toNullable, isSome } from "../utils/option.utils"
import { createEntityFactory, type Entity, type IEntity } from "../utils/entity.utils"


 // DocumentVersion entity interface extending base IEntity.

export interface IDocumentVersion extends IEntity {
  readonly id: DocumentVersionId
  readonly documentId: DocumentId
  readonly version: number
  readonly checksum: Sha256
  readonly fileKey: FileKey
  readonly mimeType: MimeType
  readonly size: FileSize
  readonly createdAt: Date
  readonly createdBy: Option.Option<UserId>
}

/**
 * Serialized DocumentVersion type for external APIs and persistence.
 */
export type SerializedDocumentVersion = {
  id: string
  documentId: string
  version: number
  checksum: string
  fileKey: string
  mimeType: string
  size: number
  createdAt: Date
  createdBy: string | null
}

export class DocumentVersionEntity implements Entity<S.Schema.Type<typeof DocumentVersion>>, IDocumentVersion {

  static create = createEntityFactory(
    DocumentVersion,
    (props) => new DocumentVersionEntity(props),
    "DocumentVersion"
  ).create

  static createNew = (props: {
    id: DocumentVersionId;
    documentId: DocumentId;
    version: number;
    checksum: Sha256;
    fileKey: FileKey;
    mimeType: MimeType;
    size: FileSize;
    createdBy?: UserId | null;
  }): Effect.Effect<DocumentVersionEntity, ValidationError> => {
    const versionData = {
      ...props,
      createdAt: new Date(),
      createdBy: fromNullable(props.createdBy)
    }
    return S.decodeUnknown(DocumentVersion)(versionData).pipe(
      Effect.map((validated) => new DocumentVersionEntity(validated)),
      Effect.mapError((error) => new ValidationError(
        `Invalid document version data: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        versionData
      ))
    )
  }

  static fromPersistence = createEntityFactory(
    DocumentVersion,
    (props) => new DocumentVersionEntity(props),
    "DocumentVersion"
  ).fromPersistence

  static unsafe = createEntityFactory(
    DocumentVersion,
    (props) => new DocumentVersionEntity(props),
    "DocumentVersion"
  ).unsafe

  private constructor(readonly props: S.Schema.Type<typeof DocumentVersion>) {}

  get id() { return this.props.id }
  get documentId() { return this.props.documentId }
  get version() { return this.props.version }
  get checksum() { return this.props.checksum }
  get fileKey() { return this.props.fileKey }
  get mimeType() { return this.props.mimeType }
  get size() { return this.props.size }
  get createdAt() { return this.props.createdAt }
  get createdBy() { return this.props.createdBy }


  get hasCreatorInfo(): boolean {
    return isSome(this.createdBy)
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

  // Public Domain Methods
  
  hasCreator(): boolean {
    return this.hasCreatorInfo
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

  // Serialization Methods
  
  toWireFormat = (): S.Schema.Type<typeof DocumentVersion> => {
    return this.props
  }

  serialized = (): S.Schema.Type<typeof DocumentVersion> => {
    return this.props
  }

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
      createdBy: toNullable(this.createdBy),
      hasCreator: this.hasCreatorInfo,
      sizeInKB: this.sizeInKB,
      sizeInMB: this.sizeInMB,
      isFirstVersion: this.isFirstVersion
    }
  }
}
