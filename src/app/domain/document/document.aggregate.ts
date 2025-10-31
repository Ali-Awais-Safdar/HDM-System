import { Effect, Option, Clock } from "effect"
import { DocumentEntity, type SerializedDocument } from "@domain/document/document.entity"
import { DocumentVersionEntity, type SerializedDocumentVersion } from "@domain/documentVersion/document-version.entity"
import { FileMetadata } from "@domain/documentVersion/file-metadata.vo"
import { DocumentId, DocumentVersionId, UserId } from "@domain/refined/ids"
import { Sha256 } from "@domain/refined/checksum"
import { BusinessRuleViolationError } from "@domain/utils/base.errors"
import { DocumentValidationError } from "@domain/document/document.error"
import { DocumentVersionValidationError } from "@domain/documentVersion/document-version.error"
import { VersionNumber } from "@domain/documentVersion/version-number.vo"

export class DocumentAggregate {
  readonly document!: DocumentEntity
  private readonly _versions!: readonly DocumentVersionEntity[]

  private constructor(doc: DocumentEntity, versions: readonly DocumentVersionEntity[]) {
    this.document = doc
    this._versions = versions
  }

  // Read helpers for versions
  getVersions(): readonly DocumentVersionEntity[] {
    return this._versions
  }

  getVersionCount(): number {
    return this._versions.length
  }

  getLatestVersion(): Option.Option<DocumentVersionEntity> {
    return this._versions.length === 0 
      ? Option.none<DocumentVersionEntity>()
      : Option.some(this._versions[this._versions.length - 1]!)
  }

  getVersionByNumber(versionNumber: number): Option.Option<DocumentVersionEntity> {
    const version = this._versions.find(v => v.version === versionNumber)
    return version ? Option.some(version) : Option.none<DocumentVersionEntity>()
  }

  getVersionByChecksum(checksum: Sha256): Option.Option<DocumentVersionEntity> {
    const version = this._versions.find(v => v.checksum === checksum)
    return version ? Option.some(version) : Option.none<DocumentVersionEntity>()
  }

  getVersionById(versionId: DocumentVersionId): Option.Option<DocumentVersionEntity> {
    const version = this._versions.find(v => v.id === versionId)
    return version ? Option.some(version) : Option.none<DocumentVersionEntity>()
  }

  hasVersionWithChecksum(checksum: Sha256): boolean {
    return this._versions.some((v) => v.checksum === checksum)
  }

  forEachVersion<A>(f: (version: DocumentVersionEntity) => A): Effect.Effect<readonly A[], never, never> {
    return Effect.succeed(this._versions.map(f))
  }

  static initialize(
    document: DocumentEntity,
    versions: readonly DocumentVersionEntity[]
  ): Effect.Effect<DocumentAggregate, BusinessRuleViolationError, never> {
    return validateVersions(document.id, versions).pipe(
      Effect.map(() => new DocumentAggregate(document, ordered(versions)))
    )
  }

  static createFromSerialized(
    documentInput: SerializedDocument,
    versionsInput: readonly SerializedDocumentVersion[]
  ): Effect.Effect<
    DocumentAggregate,
    DocumentValidationError | DocumentVersionValidationError | BusinessRuleViolationError,
    Clock.Clock
  > {
    return Effect.all([
      DocumentEntity.create(documentInput),
      Effect.forEach(versionsInput, (v) => DocumentVersionEntity.create(v))
    ] as const).pipe(
      Effect.flatMap(([doc, versions]) => DocumentAggregate.initialize(doc, versions))
    )
  }

  get highestVersion(): number {
    return this._versions.length === 0 ? 0 : this._versions[this._versions.length - 1]!.version
  }

  nextVersionNumber(versionHint?: number): Effect.Effect<number, BusinessRuleViolationError, never> {
    const expected = this.highestVersion + 1
    if (versionHint == null) {
      return Effect.succeed(expected)
    }
    if (versionHint !== expected) {
      return Effect.fail(new BusinessRuleViolationError(
        "INVALID_NEXT_VERSION",
        "Next version number must be the last version + 1",
        { expectedNext: expected, received: versionHint }
      ))
    }
    return Effect.succeed(versionHint)
  }

  hasChecksum(checksum: Sha256): boolean {
    return this.hasVersionWithChecksum(checksum)
  }

  enforceChecksumUnique(checksum: Sha256): Effect.Effect<void, BusinessRuleViolationError, never> {
    return this.hasChecksum(checksum)
      ? Effect.fail(new BusinessRuleViolationError(
          "DUPLICATE_CHECKSUM",
          "A version with the same checksum already exists for this document",
          { checksum }
        ))
      : Effect.succeed(undefined)
  }

  rename(newTitle: string): Effect.Effect<DocumentAggregate, DocumentValidationError, Clock.Clock> {
    return this.document.rename(newTitle).pipe(
      Effect.map((updated) => new DocumentAggregate(updated, this._versions))
    )
  }

  updateDescription(newDescription: Option.Option<string>): Effect.Effect<DocumentAggregate, DocumentValidationError, Clock.Clock> {
    return this.document.updateDescription(newDescription).pipe(
      Effect.map((updated) => new DocumentAggregate(updated, this._versions))
    )
  }

  addTags(tags: string[]): Effect.Effect<DocumentAggregate, DocumentValidationError | BusinessRuleViolationError, Clock.Clock> {
    return this.document.addTags(tags).pipe(
      Effect.map((updated) => new DocumentAggregate(updated, this._versions))
    )
  }

  removeTags(tags: string[]): Effect.Effect<DocumentAggregate, DocumentValidationError, Clock.Clock> {
    return this.document.removeTags(tags).pipe(
      Effect.map((updated) => new DocumentAggregate(updated, this._versions))
    )
  }

  updatePublishStatus(newStatus: DocumentEntity["publishStatus"]): Effect.Effect<DocumentAggregate, DocumentValidationError, Clock.Clock> {
    return this.document.updatePublishStatus(newStatus).pipe(
      Effect.map((updated) => new DocumentAggregate(updated, this._versions))
    )
  }

  updatePublishNotes(newNotes: Option.Option<string>): Effect.Effect<DocumentAggregate, DocumentValidationError, Clock.Clock> {
    return this.document.updatePublishNotes(newNotes).pipe(
      Effect.map((updated) => new DocumentAggregate(updated, this._versions))
    )
  }

  recordUpload(
    file: FileMetadata,
    createdBy: Option.Option<UserId>,
    versionHint: number | undefined,
    versionId: DocumentVersionId
  ): Effect.Effect<DocumentAggregate, DocumentVersionValidationError | BusinessRuleViolationError, Clock.Clock> {
    const validated = Effect.all([
      this.nextVersionNumber(versionHint),
      this.enforceChecksumUnique(file.checksum)
    ] as const)
    return validated.pipe(
      Effect.flatMap(([nextVersion]) =>
        DocumentVersionEntity.create({
          id: versionId,
          documentId: this.document.id,
          version: nextVersion as VersionNumber,
          file,
          createdBy: Option.match(createdBy, {
            onNone: () => undefined,
            onSome: (id) => id
          }),
          createdAt: undefined,
          updatedAt: undefined
        } as unknown as SerializedDocumentVersion)
      ),
      Effect.map((newVersion) => new DocumentAggregate(this.document, [...this._versions, newVersion]))
    )
  }

  canDelete(force: boolean): Effect.Effect<boolean, BusinessRuleViolationError, never> {
    if (force) return Effect.succeed(true)
    const versionCount = this.getVersionCount()
    if (versionCount > 0) {
      return Effect.fail(new BusinessRuleViolationError(
        "DEPENDENCIES_EXIST",
        "Cannot delete document with existing versions without force",
        { versions: versionCount }
      ))
    }
    return Effect.succeed(true)
  }
}

function ordered(versions: readonly DocumentVersionEntity[]): readonly DocumentVersionEntity[] {
  return [...versions].sort((a, b) => a.version - b.version)
}

function validateVersions(
  documentId: DocumentId,
  versions: readonly DocumentVersionEntity[]
): Effect.Effect<void, BusinessRuleViolationError, never> {
  // All versions must belong to this document
  const wrongDoc = versions.find((v) => v.documentId !== documentId)
  if (wrongDoc) {
    return Effect.fail(new BusinessRuleViolationError(
      "VERSION_OWNERSHIP_MISMATCH",
      "Found a version that does not belong to the aggregate document",
      { versionId: wrongDoc.id, expectedDocumentId: documentId, actualDocumentId: wrongDoc.documentId }
    ))
  }
  // Versions must be 1..n with no gaps
  const sorted = ordered(versions)
  for (let i = 0; i < sorted.length; i++) {
    const expected = i + 1
    if (sorted[i]?.version !== expected) {
      return Effect.fail(new BusinessRuleViolationError(
        "VERSION_SEQUENCE_VIOLATION",
        "Document versions must be sequential starting at 1 with no gaps",
        { index: i, expected, actual: sorted[i]?.version }
      ))
    }
  }
  return Effect.succeed(undefined)
}