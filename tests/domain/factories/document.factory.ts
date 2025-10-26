import { Schema as S } from "effect"
import { faker } from "../factories/common"
import { Document as DocumentSchema } from "@domain/document/document.schema"
import { DocumentId, UserId } from "@domain/refined/ids"

type EncodedDocument = S.Schema.Encoded<typeof DocumentSchema>

const FIXED_CREATED_AT = new Date("2025-01-03T00:00:00.000Z")

const deterministicDefaults = (): EncodedDocument => {
  return {
    id: faker.string.uuid() as DocumentId,
    ownerId: faker.string.uuid() as UserId,
    title: `Document ${faker.string.alphanumeric(8)}`,
    description: undefined,
    tags: undefined,
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
  return generateDocument({ tags: undefined, ...overrides })
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


