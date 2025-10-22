import { Effect, Option, ParseResult, Schema as S, Clock } from "effect"
import { Document as DocumentSchema } from "@domain/document/document.schema"
import { addTags as TagListAdd, removeTags as TagListRemove } from "@domain/document/tag-list.vo"
import { BusinessRuleViolationError, ValidationError } from "@domain/utils/base.errors"
import { formatParseError, mapParseError } from "@domain/utils/option.utils"
import { DocumentValidationError } from "@domain/document/document.error"
import { DocumentId, DocumentVersionId, UserId } from "@domain/refined/ids"
import { DocumentTitle } from "@domain/document/document-title.vo"
import { DocumentDescription } from "@domain/document/document-description.vo"
import { getCurrentTime } from "@domain/utils/audit-trail"
import { applyMutationWithTimestamp, serializeWith } from "@domain/utils/schema-transform"

export type DocumentType = S.Schema.Type<typeof DocumentSchema>
export type SerializedDocument = S.Schema.Encoded<typeof DocumentSchema>

export class DocumentEntity {
  readonly id!: DocumentId
  readonly ownerId!: UserId
  readonly title!: DocumentTitle
  readonly description!: Option.Option<DocumentDescription>
  readonly tags!: Option.Option<readonly string[]>
  readonly currentVersionId!: DocumentVersionId
  readonly createdAt!: Date
  readonly updatedAt!: Option.Option<Date>

  static create(
    input: SerializedDocument
  ): Effect.Effect<DocumentEntity, DocumentValidationError, Clock.Clock> {
    return getCurrentTime().pipe(
      Effect.flatMap((now) => {
        const dataWithAudit = {
          ...input,
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
    this.createdAt = data.createdAt
    this.updatedAt = data.updatedAt
    this.ownerId = data.ownerId
    this.title = data.title
    this.description = data.description
    this.tags = data.tags
    this.currentVersionId = data.currentVersionId
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

  updateCurrentVersion(
    newVersionId: DocumentVersionId
  ): Effect.Effect<DocumentEntity, DocumentValidationError, Clock.Clock> {
    return applyMutationWithTimestamp(
      DocumentSchema,
      this as unknown,
      (_now) => ({ currentVersionId: newVersionId } as any),
      (error) => new DocumentValidationError(
        `Failed to prepare document for version update: ${formatParseError(error as ParseResult.ParseError)}`,
        "currentVersionId",
        newVersionId
      ),
      (input) => DocumentEntity.create(input)
    )
  }
}
