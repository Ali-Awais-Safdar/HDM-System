import { Effect, Schema as S, Option, ParseResult } from "effect"
import { Document } from "../schema/document.schema"
import { ValidationError, BusinessRuleViolationError } from "../errors/domain.errors"
import { DocumentId, UserId, DocumentVersionId } from "../value-objects/id.vo"
import { toNullable, fromNullable, isSome } from "../utils/option.utils"
import { createEntityFactory, type Entity, type IEntity } from "../utils/entity.utils"
import { isValidDocumentTitle, isValidDocumentDescription, isValidDocumentTagList } from "../guards/document.guards"

export interface IDocument extends IEntity {
  readonly id: DocumentId
  readonly ownerId: UserId
  readonly title: string
  readonly description: Option.Option<string>
  readonly tags: Option.Option<readonly string[]>
  readonly currentVersionId: DocumentVersionId
  readonly createdAt: Date
  readonly updatedAt: Option.Option<Date>
}

/**
 * Serialized Document type derived from schema encoding.
 * Represents the external format for APIs and persistence.
 */
export type SerializedDocument = S.Schema.Encoded<typeof Document>

export class DocumentEntity implements Entity<S.Schema.Type<typeof Document>, SerializedDocument>, IDocument {
  // ========== Static Factory Methods ==========
  
  static create = createEntityFactory(
    Document,
    (props) => new DocumentEntity(props),
    "Document"
  ).create

  static createNew = (props: {
    id: DocumentId;
    ownerId: UserId;
    title: string;
    description?: string | null;
    tags?: string[] | null;
    currentVersionId: DocumentVersionId;
  }): Effect.Effect<DocumentEntity, ValidationError> => {
    const documentData = {
      id: props.id,
      ownerId: props.ownerId,
      title: props.title,
      description: props.description 
        ? { _tag: "Some" as const, value: props.description }
        : { _tag: "None" as const },
      tags: props.tags
        ? { _tag: "Some" as const, value: props.tags }
        : { _tag: "None" as const },
      currentVersionId: props.currentVersionId,
      createdAt: new Date().toISOString(),
      updatedAt: { _tag: "None" as const }
    }
    return S.decodeUnknown(Document)(documentData).pipe(
      Effect.map((validated) => new DocumentEntity(validated)),
      Effect.mapError((error) => new ValidationError(
        `Invalid document data: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        documentData
      ))
    )
  }

  static fromPersistence = createEntityFactory(
    Document,
    (props) => new DocumentEntity(props),
    "Document"
  ).fromPersistence

  static unsafe = createEntityFactory(
    Document,
    (props) => new DocumentEntity(props),
    "Document"
  ).unsafe

  // ========== Constructor ==========
  
  private constructor(readonly props: Readonly<S.Schema.Type<typeof Document>>) {}

  // ========== Getters & Computed Properties ==========
  
  get id() { return this.props.id }
  get ownerId() { return this.props.ownerId }
  get title() { return this.props.title }
  get description() { return this.props.description }
  get tags() { return this.props.tags }
  get currentVersionId() { return this.props.currentVersionId }
  get createdAt() { return this.props.createdAt }
  get updatedAt() { return this.props.updatedAt }

  get hasDescriptionValue(): boolean {
    return isSome(this.description)
  }

  get hasTagsValue(): boolean {
    return isSome(this.tags) && Option.getOrElse(this.tags, () => []).length > 0
  }

  get isModified(): boolean {
    return isSome(this.updatedAt)
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

  rename = (newTitle: string): Effect.Effect<DocumentEntity, ValidationError> => {
    // Validate only the title field
    if (!isValidDocumentTitle(newTitle)) {
      return Effect.fail(new ValidationError(
        'Title is required and cannot exceed 255 characters',
        'title',
        newTitle
      ))
    }
    
    // Construct new entity directly
    const updated = new DocumentEntity({
      ...this.props,
      title: newTitle,
      updatedAt: Option.some(new Date())
    })
    
    return Effect.succeed(updated)
  }

  updateDescription = (newDescription: string | null | undefined): Effect.Effect<DocumentEntity, ValidationError> => {
    // Validate only the description field
    const desc = newDescription ?? undefined
    if (!isValidDocumentDescription(desc)) {
      return Effect.fail(new ValidationError(
        'Description cannot exceed 1000 characters',
        'description',
        newDescription
      ))
    }
    
    // Construct new entity directly
    const updated = new DocumentEntity({
      ...this.props,
      description: fromNullable(newDescription),
      updatedAt: Option.some(new Date())
    })
    
    return Effect.succeed(updated)
  }

  addTags = (newTags: string[]): Effect.Effect<DocumentEntity, ValidationError | BusinessRuleViolationError> => {
    if (newTags.length === 0) {
      return Effect.succeed(this)
    }
    
    const currentTags = Option.getOrElse(this.props.tags, () => [])
    const normalizedNewTags = newTags
      .map((tag: string) => tag.trim().toLowerCase())
      .filter((tag: string) => tag.length > 0)
    
    if (normalizedNewTags.length === 0) {
      return Effect.fail(new BusinessRuleViolationError(
        "INVALID_TAGS",
        "No valid tags provided",
        { newTags }
      ))
    }
    
    const allTags = [...currentTags, ...normalizedNewTags]
    const uniqueTags = Array.from(new Set(allTags))
    
    // Validate the final tag list
    if (!isValidDocumentTagList(uniqueTags)) {
      return Effect.fail(new ValidationError(
        'Invalid tag list: duplicate tags or too many tags',
        'tags',
        uniqueTags
      ))
    }
    
    // Construct new entity directly
    const updated = new DocumentEntity({
      ...this.props,
      tags: Option.some(uniqueTags),
      updatedAt: Option.some(new Date())
    })
    
    return Effect.succeed(updated)
  }

  removeTags = (tagsToRemove: string[]): Effect.Effect<DocumentEntity, ValidationError> => {
    if (tagsToRemove.length === 0) {
      return Effect.succeed(this)
    }
    
    const currentTags = Option.getOrElse(this.props.tags, () => [])
    if (currentTags.length === 0) {
      return Effect.succeed(this)
    }
    
    const normalizedTagsToRemove = tagsToRemove.map((tag: string) => tag.trim().toLowerCase())
    const filteredTags = currentTags.filter((tag: string) => !normalizedTagsToRemove.includes(tag.toLowerCase()))
    
    // Validate the final tag list if not empty
    if (filteredTags.length > 0 && !isValidDocumentTagList(filteredTags)) {
      return Effect.fail(new ValidationError(
        'Invalid tag list after removal',
        'tags',
        filteredTags
      ))
    }
    
    // Construct new entity directly
    const updated = new DocumentEntity({
      ...this.props,
      tags: filteredTags.length > 0 ? Option.some(filteredTags) : Option.none(),
      updatedAt: Option.some(new Date())
    })
    
    return Effect.succeed(updated)
  }

  updateCurrentVersion = (newVersionId: DocumentVersionId): Effect.Effect<DocumentEntity, ValidationError> => {
    // DocumentVersionId is a branded type, so it's already validated
    // Construct new entity directly
    const updated = new DocumentEntity({
      ...this.props,
      currentVersionId: newVersionId,
      updatedAt: Option.some(new Date())
    })
    
    return Effect.succeed(updated)
  }

  // ========== Serialization Methods ==========
  
  toWireFormat = (): S.Schema.Type<typeof Document> => {
    return this.props
  }

  /**
   * Serializes the entity using Effect Schema encoding.
   */
  serialized = (): Effect.Effect<SerializedDocument, ParseResult.ParseError, never> => {
    return S.encode(Document)(this.props)
  }

  toPlainObject = () => {
    return {
      id: this.id,
      ownerId: this.ownerId,
      title: this.title,
      description: toNullable(this.description),
      tags: toNullable(this.tags),
      currentVersionId: this.currentVersionId,
      createdAt: this.createdAt,
      updatedAt: toNullable(this.updatedAt),
      hasDescription: this.hasDescriptionValue,
      hasTags: this.hasTagsValue,
      tagCount: this.tagCount,
      isModified: this.isModified
    }
  }
}
