import { Effect, Option, ParseResult, Schema as S, Clock } from "effect"
import { Document as DocumentSchema } from "@domain/document/document.schema"
import { addTags as TagListAdd, removeTags as TagListRemove } from "@domain/document/tag-list.vo"
import { BusinessRuleViolationError, ValidationError } from "@domain/utils/base.errors"
import { formatParseError, mapParseError } from "@domain/utils/option.utils"
import { DocumentValidationError } from "@domain/document/document.error"
import { DocumentId, UserId, WorkspaceId } from "@domain/refined/ids"
import { DocumentTitle } from "@domain/document/document-title.vo"
import { DocumentDescription } from "@domain/document/document-description.vo"
import { DocumentPublishStatus } from "@domain/document/document-publish-status.vo"
import { DocumentPublishNotes } from "@domain/document/document-publish-notes.vo"
import { getCurrentTime } from "@domain/utils/audit-trail"
import { applyMutationWithTimestamp, serializeWith } from "@domain/utils/schema-transform"

export type DocumentType = S.Schema.Type<typeof DocumentSchema>
export type SerializedDocument = S.Schema.Encoded<typeof DocumentSchema>

export class DocumentEntity {
  readonly id!: DocumentId
  readonly workspaceId!: WorkspaceId
  readonly ownerId!: UserId
  readonly title!: DocumentTitle
  readonly description!: Option.Option<DocumentDescription>
  readonly tags!: Option.Option<readonly string[]>
  readonly publishStatus!: DocumentPublishStatus
  readonly publishNotes!: Option.Option<DocumentPublishNotes>
  readonly createdAt!: Date
  readonly updatedAt!: Option.Option<Date>

  static create(
    input: SerializedDocument
  ): Effect.Effect<DocumentEntity, DocumentValidationError, Clock.Clock> {
    return getCurrentTime().pipe(
      Effect.flatMap((now) => {
        const dataWithAudit = {
          ...input,
          workspaceId: input.workspaceId,
          createdAt: input.createdAt || now.toISOString(),
          updatedAt: input.updatedAt
        }
        return S.decodeUnknown(DocumentSchema)(dataWithAudit).pipe(
          Effect.map((data) => new DocumentEntity(data)),
          Effect.mapError((error) => new DocumentValidationError(
            mapParseError(error as ParseResult.ParseError, (m) => `Document validation failed: ${m}`),
            "document",
            input
          ))
        )
      })
    ) as Effect.Effect<DocumentEntity, DocumentValidationError, Clock.Clock>
  }

  private constructor(data: DocumentType) {
    this.id = data.id
    this.workspaceId = data.workspaceId
    this.createdAt = data.createdAt
    this.updatedAt = data.updatedAt
    this.ownerId = data.ownerId
    this.title = data.title
    this.description = data.description
    this.tags = data.tags
    this.publishStatus = data.publishStatus
    this.publishNotes = data.publishNotes
  }

  serialized(): Effect.Effect<SerializedDocument, ParseResult.ParseError, never> {
    return serializeWith(DocumentSchema, this as unknown as DocumentType)
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
    return Option.isSome(this.updatedAt)
  }

  get tagCount(): number {
    return Option.getOrElse(this.tags, () => []).length
  }

  get descriptionOrEmpty(): string {
    return Option.match(this.description, {
      onNone: () => "",
      onSome: (desc) => desc ?? ""
    })
  }

  get tagsOrEmpty(): readonly string[] {
    return Option.getOrElse(this.tags, () => [])
  }

  get hasPublishNotesValue(): boolean {
    return Option.isSome(this.publishNotes)
  }

  get publishNotesOrEmpty(): string {
    return Option.match(this.publishNotes, {
      onNone: () => "",
      onSome: (notes) => notes ?? ""
    })
  }

  get isPublished(): boolean {
    return this.publishStatus === "published"
  }

  get isDraft(): boolean {
    return this.publishStatus === "draft"
  }

  get isUnpublished(): boolean {
    return this.publishStatus === "unpublished"
  }

  rename(
    newTitle: string
  ): Effect.Effect<DocumentEntity, DocumentValidationError, Clock.Clock> {
    return S.decodeUnknown(DocumentTitle)(newTitle).pipe(
      Effect.mapError((error) => new DocumentValidationError(
        mapParseError(error as ParseResult.ParseError, (m) => `Document title validation failed: ${m}`),
        "title",
        newTitle
      )),
      Effect.flatMap((validatedTitle) =>
        applyMutationWithTimestamp(
          DocumentSchema,
          this as unknown,
          (_now) => ({ title: validatedTitle } as any),
          (error) => new DocumentValidationError(
            `Failed to prepare document for rename: ${formatParseError(error as ParseResult.ParseError)}`,
            "title",
            newTitle
          ),
          (input) => DocumentEntity.create(input)
        )
      )
    )
  }

  updateDescription(
    newDescription: Option.Option<string>
  ): Effect.Effect<DocumentEntity, DocumentValidationError, Clock.Clock> {
    // Convert Option<string> to external representation for schema validation
    const externalDescription = Option.match(newDescription, {
      onNone: () => undefined,
      onSome: (desc) => desc
    })

    return applyMutationWithTimestamp(
      DocumentSchema,
      this as unknown,
      (_now) => ({ description: externalDescription } as any),
      (error) => new DocumentValidationError(
        `Failed to prepare document for description update: ${formatParseError(error as ParseResult.ParseError)}`,
        "description",
        newDescription
      ),
      (input) => DocumentEntity.create(input)
    )
  }

  addTags(
    newTags: string[]
  ): Effect.Effect<
    DocumentEntity,
    DocumentValidationError | BusinessRuleViolationError,
    Clock.Clock
  > {
    return newTags.length > 0
      ? (() => {
          const existingTags = Option.getOrElse(this.tags, () => [] as string[])
          return TagListAdd(existingTags, newTags).pipe(
            Effect.mapError((e) =>
              e instanceof ValidationError
                ? new DocumentValidationError(e.message, "tags", newTags)
                : e
            ),
            Effect.flatMap((uniqueTags) =>
              applyMutationWithTimestamp(
                DocumentSchema,
                this as unknown,
                (_now) => ({ tags: uniqueTags } as any),
                (error) => new DocumentValidationError(
                  `Failed to prepare document for tag addition: ${formatParseError(error as ParseResult.ParseError)}`,
                  "tags",
                  uniqueTags
                ),
                (input) => DocumentEntity.create(input)
              )
            )
          )
        })()
      : Effect.fail(new BusinessRuleViolationError(
          "INVALID_TAGS",
          "No valid tags provided",
          { candidateTags: newTags }
        ))
  }

  removeTags(
    tagsToRemove: string[]
  ): Effect.Effect<DocumentEntity, DocumentValidationError, Clock.Clock> {
    return tagsToRemove.length > 0
      ? (() => {
          const currentTags = Option.getOrElse(this.tags, () => [] as string[])
          return TagListRemove(currentTags, tagsToRemove).pipe(
            Effect.mapError(
              (e) =>
                new DocumentValidationError(
                  e instanceof Error ? e.message : String(e),
                  "tags",
                  tagsToRemove
                )
            ),
            Effect.flatMap((filteredTags) =>
              applyMutationWithTimestamp(
                DocumentSchema,
                this as unknown,
                (_now) => ({ tags: filteredTags.length > 0 ? filteredTags : undefined } as any),
                (error) => new DocumentValidationError(
                  `Failed to prepare document for tag removal: ${formatParseError(error as ParseResult.ParseError)}`,
                  "tags",
                  filteredTags
                ),
                (input) => DocumentEntity.create(input)
              )
            )
          )
        })()
      : Effect.fail(new DocumentValidationError(
          "No valid tags to remove provided",
          "tags",
          tagsToRemove
        ))
  }

  updatePublishStatus(
    newStatus: DocumentPublishStatus
  ): Effect.Effect<DocumentEntity, DocumentValidationError, Clock.Clock> {
    return applyMutationWithTimestamp(
      DocumentSchema,
      this as unknown,
      (_now) => ({ publishStatus: newStatus } as any),
      (error) => new DocumentValidationError(
        `Failed to prepare document for publish status update: ${formatParseError(error as ParseResult.ParseError)}`,
        "publishStatus",
        newStatus
      ),
      (input) => DocumentEntity.create(input)
    )
  }

  updatePublishNotes(
    newNotes: Option.Option<string>
  ): Effect.Effect<DocumentEntity, DocumentValidationError, Clock.Clock> {
    // Convert Option<string> to external representation for schema validation
    const externalNotes = Option.match(newNotes, {
      onNone: () => undefined,
      onSome: (notes) => notes
    })

    return applyMutationWithTimestamp(
      DocumentSchema,
      this as unknown,
      (_now) => ({ publishNotes: externalNotes } as any),
      (error) => new DocumentValidationError(
        `Failed to prepare document for publish notes update: ${formatParseError(error as ParseResult.ParseError)}`,
        "publishNotes",
        newNotes
      ),
      (input) => DocumentEntity.create(input)
    )
  }
}
