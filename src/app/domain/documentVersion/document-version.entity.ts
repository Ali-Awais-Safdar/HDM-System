import { Effect, Schema as S, Option, ParseResult } from "effect"
import { DocumentVersion } from "@domain/documentVersion/document-version.schema"
import { createEntityFactory, type Entity, type IEntity } from "@domain/utils/entity.utils"
import { ValidationError } from "@domain/utils/domain.errors"
import { fromNullable, isSome, toNullable } from "@domain/utils/option.utils"
import { Sha256 } from "@domain/value-objects/checksum.vo"
import { FileKey, FileSize, MimeType } from "@domain/value-objects/file-ref.vo"
import { DocumentId, DocumentVersionId, UserId } from "@domain/value-objects/id.vo"

/**
 * DocumentVersion entity interface extending base IEntity.
 */
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
 * Serialized DocumentVersion type derived from schema encoding.
 * Represents the external format for APIs and persistence.
 */
export type SerializedDocumentVersion = S.Schema.Encoded<typeof DocumentVersion>

export class DocumentVersionEntity implements Entity<S.Schema.Type<typeof DocumentVersion>, SerializedDocumentVersion>, IDocumentVersion {
  // ========== Static Factory Methods ==========

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

  // ========== Constructor ==========

  private constructor(readonly props: Readonly<S.Schema.Type<typeof DocumentVersion>>) {}

  // ========== Getters & Computed Properties ==========

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

  // ========== Public Domain Methods ==========
  
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

  // ========== Serialization Methods ==========
  
  toWireFormat = (): S.Schema.Type<typeof DocumentVersion> => {
    return this.props
  }

  /**
   * Serializes the entity using Effect Schema encoding.
   */
  serialized = (): Effect.Effect<SerializedDocumentVersion, ParseResult.ParseError, never> => {
    return S.encode(DocumentVersion)(this.props)
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
