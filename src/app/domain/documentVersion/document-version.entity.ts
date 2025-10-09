import { Effect, Schema as S, Option, ParseResult } from "effect"
import { DocumentVersion } from "@domain/documentVersion/document-version.schema"
import { BaseEntity, type IEntity } from "@domain/utils/base.entity"
import { ValidationError } from "@domain/utils/base.errors"
import { optionToMaybe, formatParseError } from "@domain/utils/option.utils"
import { Sha256 } from "@domain/refined/checksum"
import { FileKey, FileSize, MimeType } from "@domain/refined/file-reference"
import { DocumentId, DocumentVersionId, UserId } from "@domain/refined/ids"

/**
 * DocumentVersion entity interface extending base IEntity.
 */
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

/**
 * Runtime type derived from schema.
 * Represents the validated DocumentVersion type with Option<T> for optional fields.
 */
export type DocumentVersionType = S.Schema.Type<typeof DocumentVersion>

/**
 * Serialized DocumentVersion type derived from schema encoding.
 * Represents the external format for APIs and persistence.
 */
export type SerializedDocumentVersion = S.Schema.Encoded<typeof DocumentVersion>

/**
 * Document Version Entity
 * 
 * Represents a version of a document with file metadata.
 * Follows immutable entity pattern - all updates return new instances.
 */
export class DocumentVersionEntity
  extends BaseEntity<IDocumentVersion, typeof DocumentVersion>
  implements IDocumentVersion
{
  // ========== Direct Readonly Properties ==========
  // Properties cannot be reassigned after construction
  // Optional values are explicitly handled with Option
  
  readonly documentId: DocumentId
  readonly version: number
  readonly checksum: Sha256
  readonly fileKey: FileKey
  readonly mimeType: MimeType
  readonly size: FileSize
  readonly createdBy: Option.Option<UserId> // Explicit optionality with Option type
  // ========== Static Factory Methods ========== 

  private static toRuntime(data: DocumentVersionType): IDocumentVersion {
    return {
      id: data.id,
      documentId: data.documentId,
      version: data.version,
      checksum: data.checksum,
      fileKey: data.fileKey,
      mimeType: data.mimeType,
      size: data.size,
      createdAt: data.createdAt,
      createdBy: data.createdBy,
      updatedAt: null
    }
  }

  /**
   * Creates a DocumentVersion entity from external/unknown data.
   * Validates input using schema and returns Effect with proper error handling.
   * This is the primary factory method for creating versions from external sources.
   */
  static create(input: unknown): Effect.Effect<DocumentVersionEntity, ValidationError, never> {
    return S.decodeUnknown(DocumentVersion)(input).pipe(
      Effect.map((validated) =>
        new DocumentVersionEntity(DocumentVersionEntity.toRuntime(validated))
      ),
      Effect.mapError((error) => 
        new ValidationError(
          `Invalid document version data: ${formatParseError(error)}`,
          undefined,
          input
        )
      )
    ) as Effect.Effect<DocumentVersionEntity, ValidationError, never>
  }

  /**
   * Creates a new DocumentVersion entity with business logic validation.
   * Use this for creating new versions in the domain (not from persistence).
   */
  static createNew(props: {
    id: DocumentVersionId;
    documentId: DocumentId;
    version: number;
    checksum: Sha256;
    fileKey: FileKey;
    mimeType: MimeType;
    size: FileSize;
    createdBy?: UserId | null;
  }): Effect.Effect<DocumentVersionEntity, ValidationError, never> {
    const versionData = {
      ...props,
      createdAt: new Date(),
      createdBy: props.createdBy ?? null // Pass null directly, schema will handle conversion
    }
    
    return S.decodeUnknown(DocumentVersion)(versionData).pipe(
      Effect.map((validated) =>
        new DocumentVersionEntity(DocumentVersionEntity.toRuntime(validated))
      ),
      Effect.mapError((error) => 
        new ValidationError(
          `Invalid document version data: ${formatParseError(error)}`,
          undefined,
          versionData
        )
      )
    ) as Effect.Effect<DocumentVersionEntity, ValidationError, never>
  }

  /**
   * Creates entity from persistence layer data.
   * Alias for create() for semantic clarity.
   */
  static fromPersistence(input: unknown): Effect.Effect<DocumentVersionEntity, ValidationError, never> {
    return DocumentVersionEntity.create(input)
  }

  /**
   * Unsafe constructor for when data is already validated.
   * Use only in controlled contexts (e.g., tests, after validation).
   */
  static unsafe(data: DocumentVersionType): DocumentVersionEntity {
    return new DocumentVersionEntity(DocumentVersionEntity.toRuntime(data))
  }

  // ========== Constructor (Private) ==========
  // Constructor receives pre-validated data
  // All validation happens in factory methods before construction
  
  private constructor(runtime: Readonly<IDocumentVersion>) {
    super(DocumentVersion, runtime)
    this.documentId = runtime.documentId
    this.version = runtime.version
    this.checksum = runtime.checksum
    this.fileKey = runtime.fileKey
    this.mimeType = runtime.mimeType
    this.size = runtime.size
    this.createdBy = runtime.createdBy // Already Option<UserId> from schema
  }

  // ========== Getters & Computed Properties ==========
  
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

  // ========== Public Domain Methods ==========
  
  /**
   * Checks if this version has creator information.
   */
  hasCreator(): boolean {
    return this.hasCreatorInfo
  }

  /**
   * Gets the creator ID if available.
   */
  getCreatorId(): UserId | null {
    return Option.getOrNull(this.createdBy)
  }

  /**
   * Checks if this version belongs to the specified document.
   */
  isForDocument(documentId: DocumentId): boolean {
    return this.documentId === documentId
  }

  /**
   * Checks if this is the specified version number.
   */
  isVersion(version: number): boolean {
    return this.version === version
  }

  /**
   * Checks if this version is newer than the other version.
   */
  isNewerThan(other: DocumentVersionEntity): boolean {
    return this.version > other.version
  }

  /**
   * Checks if this version is older than the other version.
   */
  isOlderThan(other: DocumentVersionEntity): boolean {
    return this.version < other.version
  }

  // ========== Serialization Methods ==========
  
  /**
   * Returns wire format (validated runtime type).
   * Used for internal domain operations.
   */
  toWireFormat(): IDocumentVersion {
    return {
      id: this.id,
      documentId: this.documentId,
      version: this.version,
      checksum: this.checksum,
      fileKey: this.fileKey,
      mimeType: this.mimeType,
      size: this.size,
      createdAt: this.createdAt,
      createdBy: this.createdBy,
      updatedAt: this.updatedAt
    }
  }

  /**
   * Serializes the entity using Effect Schema encoding.
   * Properly transforms Option<T> fields to nullable values for external systems.
   * This is automatic serialization with type safety.
   */
  serialized(): Effect.Effect<SerializedDocumentVersion, ParseResult.ParseError, never> {
    return S.encode(DocumentVersion)(this.props as any) as Effect.Effect<SerializedDocumentVersion, ParseResult.ParseError, never>
  }

  /**
   * Converts to plain object for APIs.
   * Includes computed properties for convenience.
   */
  toPlainObject() {
    return {
      id: this.id,
      documentId: this.documentId,
      version: this.version,
      checksum: this.checksum,
      fileKey: this.fileKey,
      mimeType: this.mimeType,
      size: this.size,
      createdAt: this.createdAt,
      createdBy: optionToMaybe(this.createdBy),
      hasCreator: this.hasCreatorInfo,
      sizeInKB: this.sizeInKB,
      sizeInMB: this.sizeInMB,
      isFirstVersion: this.isFirstVersion
    }
  }
}
