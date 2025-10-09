import { Effect, Schema as S, Option, ParseResult } from "effect"
import { pipe } from "effect"
import { Document } from "@domain/document/document.schema"
import { DocumentGuards } from "@domain/document/document.guards"
import { BaseEntity, type IEntity } from "@domain/utils/base.entity"
import { BusinessRuleViolationError, ValidationError } from "@domain/utils/base.errors"
import {
  formatParseError,
  isSome,
  optionToMaybe
} from "@domain/utils/option.utils"
import { DocumentId, DocumentVersionId, UserId } from "@domain/refined/ids"

/**
 * Document entity interface extending base IEntity.
 * Defines the contract for Document domain objects.
 */
export interface IDocument extends IEntity<DocumentId> {
  readonly id: DocumentId
  readonly ownerId: UserId
  readonly title: string
  readonly description: Option.Option<string>
  readonly tags: Option.Option<readonly string[]>
  readonly currentVersionId: DocumentVersionId
  readonly createdAt: Date
  readonly updatedAt: Date | null
}

/**
 * Runtime type derived from schema.
 * Represents the validated Document type with Option<T> for optional fields.
 */
export type DocumentType = S.Schema.Type<typeof Document>

/**
 * Serialized Document type derived from schema encoding.
 * Represents the external format for APIs and persistence.
 */
export type SerializedDocument = S.Schema.Encoded<typeof Document>

/**
 * Document Entity
 * 
 * Represents a document in the system with metadata and version tracking.
 * Follows immutable entity pattern - all updates return new instances.
 */
export class DocumentEntity
  extends BaseEntity<IDocument, typeof Document>
  implements IDocument
{
  // ========== Direct Readonly Properties ==========
  // Properties cannot be reassigned after construction
  // Optional values are explicitly handled with Option
  
  readonly ownerId: UserId
  readonly title: string
  readonly description: Option.Option<string> // Explicit optionality with Option type
  readonly tags: Option.Option<readonly string[]> // Explicit optionality with Option type
  readonly currentVersionId: DocumentVersionId

  // ========== Static Factory Methods ==========

  private static toRuntime(data: DocumentType): IDocument {
    return {
      id: data.id,
      ownerId: data.ownerId,
      title: data.title,
      description: data.description,
      tags: data.tags,
      currentVersionId: data.currentVersionId,
      createdAt: data.createdAt,
      updatedAt: Option.getOrNull(data.updatedAt)
    }
  }
  
  /**
   * Creates a Document entity from external/unknown data.
   * Validates input using schema and returns Effect with proper error handling.
   * This is the primary factory method for creating documents from external sources.
   */
  static create(input: unknown): Effect.Effect<DocumentEntity, ValidationError, never> {
    return pipe(
      S.decodeUnknown(Document)(input), // Validate input with schema
      Effect.map((validated) =>
        new DocumentEntity(DocumentEntity.toRuntime(validated))
      ),
      Effect.mapError((error) => 
        new ValidationError(
          `Invalid document data: ${formatParseError(error)}`,
          undefined,
          input
        )
      )
    ) as Effect.Effect<DocumentEntity, ValidationError, never>
  }

  /**
   * Creates a new Document entity with business logic validation.
   * Use this for creating new documents in the domain (not from persistence).
   */
  static createNew(props: {
    id: DocumentId;
    ownerId: UserId;
    title: string;
    description?: string | null;
    tags?: string[] | null;
    currentVersionId: DocumentVersionId;
  }): Effect.Effect<DocumentEntity, ValidationError, never> {
    const documentData = {
      id: props.id,
      ownerId: props.ownerId,
      title: props.title,
      description: props.description ?? null,
      tags: props.tags ?? null,
      currentVersionId: props.currentVersionId,
      createdAt: new Date(),
      updatedAt: null
    }
    
    return pipe(
      S.decodeUnknown(Document)(documentData),
      Effect.map((validated) =>
        new DocumentEntity(DocumentEntity.toRuntime(validated))
      ),
      Effect.mapError((error) => 
        new ValidationError(
          `Invalid document data: ${formatParseError(error)}`,
          undefined,
          documentData
        )
      )
    ) as Effect.Effect<DocumentEntity, ValidationError, never>
  }

  /**
   * Creates entity from persistence layer data.
   * Alias for create() for semantic clarity.
   */
  static fromPersistence(input: unknown): Effect.Effect<DocumentEntity, ValidationError, never> {
    return DocumentEntity.create(input)
  }

  /**
   * Unsafe constructor for when data is already validated.
   * Use only in controlled contexts (e.g., tests, after validation).
   */
  static unsafe(data: DocumentType): DocumentEntity {
    return new DocumentEntity(DocumentEntity.toRuntime(data))
  }

  // ========== Constructor (Private) ==========
  // Constructor receives pre-validated data
  // All validation happens in factory methods before construction
  
  private constructor(runtime: Readonly<IDocument>) {
    super(Document, runtime)
    this.ownerId = runtime.ownerId
    this.title = runtime.title
    this.description = runtime.description // Already Option<string> from schema
    this.tags = runtime.tags // Already Option<readonly string[]> from schema
    this.currentVersionId = runtime.currentVersionId
  }

  // ========== Getters & Computed Properties ==========

  get hasDescriptionValue(): boolean {
    return isSome(this.description)
  }

  get hasTagsValue(): boolean {
    return isSome(this.tags) && Option.getOrElse(this.tags, () => []).length > 0
  }

  get isModified(): boolean {
    return this.updatedAt !== null
  }

  get tagCount(): number {
    return Option.getOrElse(this.tags, () => []).length
  }

  get descriptionOrEmpty(): string {
    return Option.getOrElse(this.description, () => '')
  }

  get tagsOrEmpty(): readonly string[] {
    return Option.getOrElse(this.tags, () => [])
  }

  // ========== Public Domain Methods ==========
  
  hasDescription(): boolean {
    return this.hasDescriptionValue
  }

  hasTags(): boolean {
    return this.hasTagsValue
  }

  hasBeenUpdated(): boolean {
    return this.isModified
  }

  getTagCount(): number {
    return this.tagCount
  }

  /**
   * Renames the document.
   * Returns new entity instance with updated title (immutable update pattern).
   */
  rename(newTitle: string): Effect.Effect<DocumentEntity, ValidationError, never> {
    // Validate only the title field
    if (!DocumentGuards.isValidTitle(newTitle)) {
      return Effect.fail(new ValidationError(
        'Title is required and cannot exceed 255 characters',
        'title',
        newTitle
      ))
    }

    return this.serialized().pipe(
      Effect.mapError((error) =>
        new ValidationError(
          `Failed to prepare document for rename: ${formatParseError(error)}`,
          "title",
          newTitle
        )
      ),
      Effect.flatMap((currentSerialized) =>
        DocumentEntity.create({
          ...currentSerialized,
          title: newTitle,
          updatedAt: new Date() // Pass Date directly, schema will handle conversion
        })
      )
    )
  }

  /**
   * Updates document description.
   * Returns new entity instance with updated description (immutable update pattern).
   */
  updateDescription(newDescription: string | null | undefined): Effect.Effect<DocumentEntity, ValidationError, never> {
    // Validate only the description field
    const desc = newDescription ?? undefined
    if (!DocumentGuards.isValidDescription(desc)) {
      return Effect.fail(new ValidationError(
        'Description cannot exceed 1000 characters',
        'description',
        newDescription
      ))
    }

    return this.serialized().pipe(
      Effect.mapError((error) =>
        new ValidationError(
          `Failed to prepare document for description update: ${formatParseError(error)}`,
          "description",
          newDescription ?? null
        )
      ),
      Effect.flatMap((currentSerialized) =>
        DocumentEntity.create({
          ...currentSerialized,
          description: newDescription ?? null, // Pass null directly, schema will handle conversion
          updatedAt: new Date()
        })
      )
    )
  }

  /**
   * Adds tags to document.
   * Returns new entity instance with updated tags (immutable update pattern).
   */
  addTags(newTags: string[]): Effect.Effect<DocumentEntity, ValidationError | BusinessRuleViolationError, never> {
    if (newTags.length === 0) {
      return Effect.succeed(this)
    }

    const existingTags = Option.getOrElse(this.tags, () => [])

    return DocumentGuards.prepareTagsForAddition(existingTags, newTags).pipe(
      Effect.flatMap((uniqueTags) =>
        this.serialized().pipe(
          Effect.mapError((error) =>
            new ValidationError(
              `Failed to prepare document for tag addition: ${formatParseError(error)}`,
              "tags",
              uniqueTags
            )
          ),
          Effect.flatMap((currentSerialized) =>
            DocumentEntity.create({
              ...currentSerialized,
              tags: uniqueTags,
              updatedAt: new Date()
            })
          )
        )
      )
    )
  }

  /**
   * Removes tags from document.
   * Returns new entity instance with updated tags (immutable update pattern).
   */
  removeTags(tagsToRemove: string[]): Effect.Effect<DocumentEntity, ValidationError, never> {
    if (tagsToRemove.length === 0) {
      return Effect.succeed(this)
    }

    const currentTags = Option.getOrElse(this.tags, () => [])
    if (currentTags.length === 0) {
      return Effect.succeed(this)
    }

    return DocumentGuards.prepareTagsForRemoval(currentTags, tagsToRemove).pipe(
      Effect.flatMap((filteredTags) =>
        this.serialized().pipe(
          Effect.mapError((error) =>
            new ValidationError(
              `Failed to prepare document for tag removal: ${formatParseError(error)}`,
              "tags",
              filteredTags
            )
          ),
          Effect.flatMap((currentSerialized) =>
            DocumentEntity.create({
              ...currentSerialized,
              tags: filteredTags.length > 0 ? filteredTags : null,
              updatedAt: new Date()
            })
          )
        )
      )
    )
  }

  /**
   * Updates current version of document.
   * Returns new entity instance with updated version (immutable update pattern).
   */
  updateCurrentVersion(newVersionId: DocumentVersionId): Effect.Effect<DocumentEntity, ValidationError, never> {
    // DocumentVersionId is a branded type, so it's already validated
    return this.serialized().pipe(
      Effect.mapError((error) =>
        new ValidationError(
          `Failed to prepare document for version update: ${formatParseError(error)}`,
          "currentVersionId",
          newVersionId
        )
      ),
      Effect.flatMap((currentSerialized) =>
        DocumentEntity.create({
          ...currentSerialized,
          currentVersionId: newVersionId,
          updatedAt: new Date() // Pass Date directly, schema will handle conversion
        })
      )
    )
  }

  // ========== Serialization Methods ==========
  
  /**
   * Returns wire format (validated runtime type).
   * Used for internal domain operations.
   */
  toWireFormat(): IDocument {
    return {
      id: this.id,
      ownerId: this.ownerId,
      title: this.title,
      description: this.description,
      tags: this.tags,
      currentVersionId: this.currentVersionId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    }
  }

  /**
   * Serializes the entity using Effect Schema encoding.
   * Properly transforms Option<T> fields to nullable values for external systems.
   * This is automatic serialization with type safety.
   */
  serialized(): Effect.Effect<SerializedDocument, ParseResult.ParseError, never> {
    return S.encode(Document)(this.props as any) as Effect.Effect<SerializedDocument, ParseResult.ParseError, never> // Automatic serialization with type safety
  }

  toPlainObject = () => {
    return {
      id: this.id,
      ownerId: this.ownerId,
      title: this.title,
      description: optionToMaybe(this.description),
      tags: optionToMaybe(this.tags),
      currentVersionId: this.currentVersionId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      hasDescription: this.hasDescriptionValue,
      hasTags: this.hasTagsValue,
      tagCount: this.tagCount,
      isModified: this.isModified
    }
  }
}
