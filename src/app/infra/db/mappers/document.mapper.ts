import { Effect as E, Clock } from "effect"
import { DocumentEntity, type SerializedDocument } from "@domain/document/document.entity"
import { DocumentAggregate } from "@domain/document/document.aggregate"
import { DocumentVersionMapper } from "@infra/db/mappers"
import type { DocumentVersionModel } from "@infra/db/models/document-version.model"
import { DocumentValidationError } from "@domain/document/document.error"
import type { DocumentModel, NewDocumentModel } from "@infra/db/models/document.model"

export const toDb = (
  document: DocumentEntity
): E.Effect<NewDocumentModel, DocumentValidationError, never> => {
  return E.gen(function* () {
    const serialized = yield* document.serialized()
    
    const dbRow: NewDocumentModel = {
      id: serialized.id,
      workspaceId: serialized.workspaceId,
      ownerId: serialized.ownerId,
      title: serialized.title,
      description: serialized.description ?? null,
      tags: (serialized.tags ?? []) as string[],
      publishStatus: serialized.publishStatus,
      publishNotes: serialized.publishNotes ?? null,
      createdAt: new Date(serialized.createdAt),
      updatedAt: serialized.updatedAt ? new Date(serialized.updatedAt) : null
    }
    
    return dbRow
  }).pipe(
    E.mapError((error) => 
      new DocumentValidationError(
        `Failed to serialize document for persistence: ${error.message}`,
        "document",
        document.id
      )
    )
  )
}

export const fromDb = (
  row: DocumentModel
): E.Effect<DocumentEntity, DocumentValidationError, Clock.Clock> => {
  const serialized: SerializedDocument = {
    id: row.id,
    workspaceId: row.workspaceId,
    ownerId: row.ownerId,
    title: row.title,
    description: row.description ?? null,
    tags: (row.tags ?? []) as string[],
    publishStatus: row.publishStatus as "draft" | "published" | "unpublished",
    publishNotes: row.publishNotes ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt 
      ? (row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt)
      : null
  }
  
  return DocumentEntity.create(serialized)
}

export const toAggregate = (
  docRow: DocumentModel,
  versionRows: readonly DocumentVersionModel[]
): E.Effect<
  DocumentAggregate,
  DocumentValidationError | import("@domain/documentVersion/document-version.error").DocumentVersionValidationError | import("@domain/utils/base.errors").BusinessRuleViolationError,
  Clock.Clock
> => {
  const ordered = [...versionRows].sort((a, b) => a.version - b.version)
  return E.all([
    fromDb(docRow),
    E.forEach(ordered, (vr) => DocumentVersionMapper.fromDb(vr))
  ] as const).pipe(
    E.flatMap(([doc, versions]) => DocumentAggregate.initialize(doc, versions))
  )
}

