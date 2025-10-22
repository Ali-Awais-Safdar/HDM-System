import { Effect as E, Clock } from "effect"
import { DownloadTokenEntity, type SerializedDownloadToken } from "@domain/downloadToken/download-token.entity"
import { DownloadTokenValidationError } from "@domain/downloadToken/download-token.error"
import type { DownloadTokenModel, NewDownloadTokenModel } from "@infra/db/models/download-token.model"

export const toDb = (
  token: DownloadTokenEntity
): E.Effect<NewDownloadTokenModel, DownloadTokenValidationError, never> => {
  return E.gen(function* () {
    const serialized = yield* token.serialized()
    
    const dbRow: NewDownloadTokenModel = {
      id: serialized.id,
      token: serialized.token,
      documentId: serialized.documentId,
      issuedTo: serialized.issuedTo,
      expiresAt: new Date(serialized.expiresAt),
      usedAt: serialized.usedAt ? new Date(serialized.usedAt) : null,
      createdAt: new Date(serialized.createdAt),
      updatedAt: serialized.updatedAt ? new Date(serialized.updatedAt) : null
    }
    
    return dbRow
  }).pipe(
    E.mapError((error) => 
      new DownloadTokenValidationError(
        `Failed to serialize download token for persistence: ${error.message}`,
        "downloadToken",
        token.id
      )
    )
  )
}

export const fromDb = (
  row: DownloadTokenModel
): E.Effect<DownloadTokenEntity, DownloadTokenValidationError, Clock.Clock> => {
  const serialized: SerializedDownloadToken = {
    id: row.id,
    token: row.token,
    documentId: row.documentId,
    issuedTo: row.issuedTo,
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : row.expiresAt,
    usedAt: row.usedAt 
      ? (row.usedAt instanceof Date ? row.usedAt.toISOString() : row.usedAt)
      : null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt 
      ? (row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt)
      : null
  }
  
  return DownloadTokenEntity.create(serialized)
}

