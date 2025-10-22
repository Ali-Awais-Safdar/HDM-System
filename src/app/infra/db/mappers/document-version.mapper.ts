import { Effect as E, Clock } from "effect"
import { DocumentVersionEntity, type SerializedDocumentVersion } from "@domain/documentVersion/document-version.entity"
import { DocumentVersionValidationError } from "@domain/documentVersion/document-version.error"
import type { DocumentVersionModel, NewDocumentVersionModel } from "@infra/db/models/document-version.model"

export const toDb = (
  version: DocumentVersionEntity
): E.Effect<NewDocumentVersionModel, DocumentVersionValidationError, never> => {
  return E.gen(function* () {
    const serialized = yield* version.serialized()
    
    const dbRow: NewDocumentVersionModel = {
      id: serialized.id,
      documentId: serialized.documentId,
      version: serialized.version,
      checksum: serialized.file.checksum,
      fileKey: serialized.file.fileKey,
      mimeType: serialized.file.mimeType,
      size: serialized.file.size,
      createdBy: serialized.createdBy ?? null,
      createdAt: new Date(serialized.createdAt),
      updatedAt: serialized.updatedAt ? new Date(serialized.updatedAt) : null
    }
    
    return dbRow
  }).pipe(
    E.mapError((error) => 
      new DocumentVersionValidationError(
        `Failed to serialize document version for persistence: ${error.message}`,
        "documentVersion",
        version.id
      )
    )
  )
}

export const fromDb = (
  row: DocumentVersionModel
): E.Effect<DocumentVersionEntity, DocumentVersionValidationError, Clock.Clock> => {
  const serialized: SerializedDocumentVersion = {
    id: row.id,
    documentId: row.documentId,
    version: row.version,
    file: {
      checksum: row.checksum,
      fileKey: row.fileKey,
      mimeType: row.mimeType,
      size: row.size
    },
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt 
      ? (row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt)
      : null
  }
  
  return DocumentVersionEntity.create(serialized)
}

