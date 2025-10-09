import { Effect, Option, ParseResult, Schema as S } from "effect"
import { Document as DocumentSchema } from "@domain/document/document.schema"
import { DocumentGuards } from "@domain/document/document.guards"
import { BaseEntity, type IEntity } from "@domain/utils/base.entity"
import { BusinessRuleViolationError, ValidationError } from "@domain/utils/base.errors"
import { formatParseError } from "@domain/utils/option.utils"
import { DocumentValidationError } from "@domain/document/document.error"
import { DocumentId, DocumentVersionId, UserId } from "@domain/refined/ids"

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

export type DocumentType = S.Schema.Type<typeof DocumentSchema>
export type SerializedDocument = S.Schema.Encoded<typeof DocumentSchema>

export class DocumentEntity
  extends BaseEntity<typeof DocumentSchema, DocumentType>
  implements IDocument
{
  private constructor(data: DocumentType) {
    super(DocumentSchema, data)
  }

  static create(
    input: SerializedDocument
  ): Effect.Effect<DocumentEntity, DocumentValidationError, never> {
    return S.decodeUnknown(DocumentSchema)(input).pipe(
      Effect.map((data) => new DocumentEntity(data)),
      Effect.mapError((error) => DocumentEntity.toValidationError(error, input))
    ) as Effect.Effect<DocumentEntity, DocumentValidationError, never>
  }

  private static toValidationError(
    error: unknown,
    input: SerializedDocument
  ): DocumentValidationError {
    if (error instanceof DocumentValidationError) {
      return error
    }

    return new DocumentValidationError(
      "document",
      input,
      formatParseError(error as ParseResult.ParseError)
    )
  }


  get id(): DocumentId {
    return this.data.id
  }

  get ownerId(): UserId {
    return this.data.ownerId
  }

  get title(): string {
    return this.data.title
  }

  get description(): Option.Option<string> {
    return this.data.description
  }

  get tags(): Option.Option<readonly string[]> {
    return this.data.tags
  }

  get currentVersionId(): DocumentVersionId {
    return this.data.currentVersionId
  }

  get createdAt(): Date {
    return this.data.createdAt
  }

  get updatedAt(): Date | null {
    return Option.getOrNull(this.data.updatedAt)
  }

  get hasDescriptionValue(): boolean {
    return Option.isSome(this.description)
  }

  get hasTagsValue(): boolean {
    return (
      Option.isSome(this.tags) && Option.getOrElse(this.tags, () => []).length > 0
    )
  }

  get isModified(): boolean {
    return this.updatedAt !== null
  }

  get tagCount(): number {
    return Option.getOrElse(this.tags, () => []).length
  }

  get descriptionOrEmpty(): string {
    return Option.getOrElse(this.description, () => "")
  }

  get tagsOrEmpty(): readonly string[] {
    return Option.getOrElse(this.tags, () => [])
  }

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

  rename(
    newTitle: string
  ): Effect.Effect<DocumentEntity, DocumentValidationError, never> {
    return this.serialized().pipe(
      Effect.mapError(
        (error) =>
          new DocumentValidationError(
            "title",
            newTitle,
            `Failed to prepare document for rename: ${formatParseError(error)}`
          )
      ),
      Effect.flatMap((currentSerialized) =>
        DocumentEntity.create({
          ...currentSerialized,
          title: newTitle,
          updatedAt: new Date()
        })
      )
    )
  }

  updateDescription(
    newDescription: string | null | undefined
  ): Effect.Effect<DocumentEntity, DocumentValidationError, never> {
    const nextDescription = newDescription ?? null

    return this.serialized().pipe(
      Effect.mapError(
        (error) =>
          new DocumentValidationError(
            "description",
            nextDescription,
            `Failed to prepare document for description update: ${formatParseError(error)}`
          )
      ),
      Effect.flatMap((currentSerialized) =>
        DocumentEntity.create({
          ...currentSerialized,
          description: nextDescription,
          updatedAt: new Date()
        })
      )
    )
  }

  addTags(
    newTags: string[]
  ): Effect.Effect<
    DocumentEntity,
    DocumentValidationError | BusinessRuleViolationError,
    never
  > {
    if (newTags.length === 0) {
      return Effect.succeed(this)
    }

    const existingTags = Option.getOrElse(this.tags, () => [])

    return DocumentGuards.prepareTagsForAddition(existingTags, newTags).pipe(
      Effect.mapError((e) =>
        e instanceof ValidationError
          ? new DocumentValidationError("tags", newTags, e.message)
          : e
      ),
      Effect.flatMap((uniqueTags) =>
        this.serialized().pipe(
          Effect.mapError(
            (error) =>
              new DocumentValidationError(
                "tags",
                uniqueTags,
                `Failed to prepare document for tag addition: ${formatParseError(error)}`
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

  removeTags(
    tagsToRemove: string[]
  ): Effect.Effect<DocumentEntity, DocumentValidationError, never> {
    if (tagsToRemove.length === 0) {
      return Effect.succeed(this)
    }

    const currentTags = Option.getOrElse(this.tags, () => [])
    if (currentTags.length === 0) {
      return Effect.succeed(this)
    }

    return DocumentGuards.prepareTagsForRemoval(
      currentTags,
      tagsToRemove
    ).pipe(
      Effect.mapError(
        (e) =>
          new DocumentValidationError(
            "tags",
            tagsToRemove,
            e instanceof Error ? e.message : String(e)
          )
      ),
      Effect.flatMap((filteredTags) =>
        this.serialized().pipe(
          Effect.mapError(
            (error) =>
              new DocumentValidationError(
                "tags",
                filteredTags,
                `Failed to prepare document for tag removal: ${formatParseError(error)}`
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

  updateCurrentVersion(
    newVersionId: DocumentVersionId
  ): Effect.Effect<DocumentEntity, DocumentValidationError, never> {
    return this.serialized().pipe(
      Effect.mapError(
        (error) =>
          new DocumentValidationError(
            "currentVersionId",
            newVersionId,
            `Failed to prepare document for version update: ${formatParseError(error)}`
          )
      ),
      Effect.flatMap((currentSerialized) =>
        DocumentEntity.create({
          ...currentSerialized,
          currentVersionId: newVersionId,
          updatedAt: new Date()
        })
      )
    )
  }
}
