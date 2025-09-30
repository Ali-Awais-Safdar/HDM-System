import { Effect, Schema as S, Option } from "effect"
import { Document } from "../schema/document.schema"
import { ValidationError, BusinessRuleViolationError } from "../errors/domain.errors"
import { DocumentId, UserId, DocumentVersionId } from "../value-objects/id.vo"
import { toNullable, fromNullable } from "../utils/option.utils"
import { createEntityFactory, type Entity } from "../utils/entity.utils"

export class DocumentEntity implements Entity<S.Schema.Type<typeof Document>> {
  private constructor(readonly props: S.Schema.Type<typeof Document>) {}

  // Standardized factory methods using the entity utilities
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
    return Effect.gen(function* () {
      const documentData = {
        ...props,
        description: fromNullable(props.description),
        tags: fromNullable(props.tags),
        createdAt: new Date(),
        updatedAt: Option.none()
      }
      
      const validatedProps = yield* Effect.try({
        try: () => S.decodeUnknownSync(Document)(documentData),
        catch: (error) => new ValidationError(
          `Invalid document data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          undefined,
          documentData
        )
      })
      
      return new DocumentEntity(validatedProps)
    })
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

  // convenience read accessors
  get id() { return this.props.id }
  get ownerId() { return this.props.ownerId }
  get title() { return this.props.title }
  get description() { return this.props.description }
  get tags() { return this.props.tags }
  get currentVersionId() { return this.props.currentVersionId }
  get createdAt() { return this.props.createdAt }
  get updatedAt() { return this.props.updatedAt }

  // Effect-based method for renaming document
  rename = (newTitle: string): Effect.Effect<DocumentEntity, ValidationError> => {
    return Effect.gen(function* (this: DocumentEntity) {
      const updatedData = {
        ...this.props,
        title: newTitle,
        updatedAt: Option.some(new Date())
      }

      const validatedProps = yield* Effect.try({
        try: () => S.decodeUnknownSync(Document)(updatedData),
        catch: (error) => new ValidationError(
          `Invalid title: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'title',
          newTitle
        )
      })

      return new DocumentEntity(validatedProps)
    }.bind(this))
  }

  // Effect-based method for updating description
  updateDescription = (newDescription: string | null | undefined): Effect.Effect<DocumentEntity, ValidationError> => {
    return Effect.gen(function* (this: DocumentEntity) {
      const updatedData = {
        ...this.props,
        description: fromNullable(newDescription),
        updatedAt: Option.some(new Date())
      }

      const validatedProps = yield* Effect.try({
        try: () => S.decodeUnknownSync(Document)(updatedData),
        catch: (error) => new ValidationError(
          `Invalid description: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'description',
          newDescription
        )
      })

      return new DocumentEntity(validatedProps)
    }.bind(this))
  }

  // Effect-based method for adding tags
  addTags = (newTags: string[]): Effect.Effect<DocumentEntity, ValidationError | BusinessRuleViolationError> => {
    return Effect.gen(function* (this: DocumentEntity) {
      if (newTags.length === 0) {
        return this // No changes needed
      }

      const currentTags = Option.getOrElse(this.props.tags, () => [])
      const normalizedNewTags = newTags
        .map((tag: string) => tag.trim().toLowerCase())
        .filter((tag: string) => tag.length > 0)
      
      if (normalizedNewTags.length === 0) {
        yield* Effect.fail(new BusinessRuleViolationError(
          "INVALID_TAGS",
          "No valid tags provided",
          { newTags }
        ))
      }

      const allTags = [...currentTags, ...normalizedNewTags]
      const uniqueTags = Array.from(new Set(allTags))

      const updatedData = {
        ...this.props,
        tags: Option.some(uniqueTags),
        updatedAt: Option.some(new Date())
      }

      const validatedProps = yield* Effect.try({
        try: () => S.decodeUnknownSync(Document)(updatedData),
        catch: (error) => new ValidationError(
          `Invalid tags: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'tags',
          uniqueTags
        )
      })

      return new DocumentEntity(validatedProps)
    }.bind(this))
  }

  // Effect-based method for removing tags
  removeTags = (tagsToRemove: string[]): Effect.Effect<DocumentEntity, ValidationError> => {
    return Effect.gen(function* (this: DocumentEntity) {
      if (tagsToRemove.length === 0) {
        return this // No changes needed
      }

      const currentTags = Option.getOrElse(this.props.tags, () => [])
      if (currentTags.length === 0) {
        return this // No tags to remove
      }

      const normalizedTagsToRemove = tagsToRemove.map((tag: string) => tag.trim().toLowerCase())
      const filteredTags = currentTags.filter((tag: string) => !normalizedTagsToRemove.includes(tag.toLowerCase()))

      const updatedData = {
        ...this.props,
        tags: filteredTags.length > 0 ? Option.some(filteredTags) : Option.none(),
        updatedAt: Option.some(new Date())
      }

      const validatedProps = yield* Effect.try({
        try: () => S.decodeUnknownSync(Document)(updatedData),
        catch: (error) => new ValidationError(
          `Invalid tags: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'tags',
          filteredTags
        )
      })

      return new DocumentEntity(validatedProps)
    }.bind(this))
  }

  // Effect-based method for updating current version
  updateCurrentVersion = (newVersionId: DocumentVersionId): Effect.Effect<DocumentEntity, ValidationError> => {
    return Effect.gen(function* (this: DocumentEntity) {
      const updatedData = {
        ...this.props,
        currentVersionId: newVersionId,
        updatedAt: Option.some(new Date())
      }

      const validatedProps = yield* Effect.try({
        try: () => S.decodeUnknownSync(Document)(updatedData),
        catch: (error) => new ValidationError(
          `Invalid version ID: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'currentVersionId',
          newVersionId
        )
      })

      return new DocumentEntity(validatedProps)
    }.bind(this))
  }

  // Business logic methods
  hasDescription(): boolean {
    return Option.isSome(this.description)
  }

  hasTags(): boolean {
    return Option.isSome(this.tags) && Option.getOrElse(this.tags, () => []).length > 0
  }

  hasBeenUpdated(): boolean {
    return Option.isSome(this.updatedAt)
  }

  getTagCount(): number {
    return Option.getOrElse(this.tags, () => []).length
  }

  // Standardized serialization methods
  toWireFormat = (): S.Schema.Type<typeof Document> => {
    return this.props
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
      updatedAt: toNullable(this.updatedAt)
    }
  }
}
