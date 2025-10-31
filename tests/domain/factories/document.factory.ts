import { Schema as S, Effect, Clock } from "effect"
import { faker } from "../factories/common"
import { Document as DocumentSchema } from "@domain/document/document.schema"
import { DocumentId, UserId, WorkspaceId } from "@domain/refined/ids"
import { DocumentAggregate } from "@domain/document/document.aggregate"
import { type SerializedDocumentVersion } from "@domain/documentVersion/document-version.entity"
import { FileMetadata } from "@domain/documentVersion/file-metadata.vo"

type EncodedDocument = S.Schema.Encoded<typeof DocumentSchema>

const FIXED_CREATED_AT = new Date("2025-01-03T00:00:00.000Z")

const deterministicDefaults = (): EncodedDocument => {
  return {
    id: faker.string.uuid() as DocumentId,
    workspaceId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa" as WorkspaceId,
    ownerId: faker.string.uuid() as UserId,
    title: `Document ${faker.string.alphanumeric(8)}`,
    description: undefined,
    tags: [],
    publishStatus: "draft" as const,
    publishNotes: undefined,
    createdAt: FIXED_CREATED_AT.toISOString(),
    updatedAt: undefined,
  } as EncodedDocument
}

export const generateDocument = (
  overrides: Partial<EncodedDocument> = {}
): EncodedDocument => {
  const base = deterministicDefaults()
  return { ...base, ...overrides } as EncodedDocument
}

export const createDocumentWithTags = (
  overrides: Partial<EncodedDocument> = {}
): EncodedDocument => {
  const tags = ["alpha", "beta", "release-1"]
  return generateDocument({ tags, ...overrides })
}

export const createDocumentWithoutTags = (
  overrides: Partial<EncodedDocument> = {}
): EncodedDocument => {
  return generateDocument({ tags: [], ...overrides })
}

export const createPublishedDocument = (
  overrides: Partial<EncodedDocument> = {}
): EncodedDocument => {
  return generateDocument({ 
    publishStatus: "published" as const,
    publishNotes: "Published for review",
    ...overrides 
  })
}

export const createUnpublishedDocument = (
  overrides: Partial<EncodedDocument> = {}
): EncodedDocument => {
  return generateDocument({ 
    publishStatus: "unpublished" as const,
    publishNotes: "Unpublished due to issues",
    ...overrides 
  })
}

export const createDraftDocument = (
  overrides: Partial<EncodedDocument> = {}
): EncodedDocument => {
  return generateDocument({ 
    publishStatus: "draft" as const,
    publishNotes: undefined,
    ...overrides 
  })
}

export const buildAggregate = (
  overrides: Partial<EncodedDocument> = {},
  versions: readonly SerializedDocumentVersion[] = []
): Effect.Effect<DocumentAggregate, unknown, Clock.Clock> => {
  const doc = generateDocument(overrides)
  return DocumentAggregate.createFromSerialized(doc, versions)
}

export const versionFrom = (
  input: {
    documentId: DocumentId,
    version: number,
    checksum: S.Schema.Type<typeof FileMetadata>["checksum"],
    fileKey: S.Schema.Type<typeof FileMetadata>["fileKey"],
    mimeType: S.Schema.Type<typeof FileMetadata>["mimeType"],
    size: S.Schema.Type<typeof FileMetadata>["size"],
    createdBy?: UserId
  }
): SerializedDocumentVersion => {
  return {
    id: faker.string.uuid() as any,
    documentId: input.documentId,
    version: input.version,
    file: {
      checksum: input.checksum,
      fileKey: input.fileKey,
      mimeType: input.mimeType,
      size: input.size
    },
    createdBy: input.createdBy ?? null,
    createdAt: FIXED_CREATED_AT.toISOString(),
    updatedAt: null
  }
}
