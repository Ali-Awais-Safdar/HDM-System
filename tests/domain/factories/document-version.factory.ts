import { Schema as S } from "effect"
import { faker } from "../factories/common"
import { DocumentVersion as DocumentVersionSchema } from "@domain/documentVersion/document-version.schema"
import { DocumentVersionEntity } from "@domain/documentVersion/document-version.entity"
import { expectSuccess } from "../../utils/test.helpers"
import { DocumentId, DocumentVersionId } from "@domain/refined/ids"
import { FileKey, FileSize, MimeType } from "@domain/refined/file-reference"

type EncodedDocumentVersion = S.Schema.Encoded<typeof DocumentVersionSchema>

const FIXED_CREATED_AT = new Date("2025-01-03T00:00:00.000Z")

const supportedMimes = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const

const generateFile = () => {
  const mimeType = faker.helpers.arrayElement(supportedMimes) as MimeType
  // Keep file size within (1, 100MB]
  const size = faker.number.int({ min: 1, max: 100 * 1024 * 1024 })
  return {
    checksum: faker.string.hexadecimal({ length: 64, prefix: "", casing: "lower" }) as any,
    fileKey: `files/${faker.string.alphanumeric(16)}` as FileKey,
    mimeType,
    size: size as FileSize,
  }
}

const deterministicDefaults = (): EncodedDocumentVersion => ({
  id: faker.string.uuid() as DocumentVersionId,
  documentId: faker.string.uuid() as DocumentId,
  version: 1,
  file: generateFile(),
  createdBy: undefined,
  createdAt: FIXED_CREATED_AT.toISOString(),
  updatedAt: undefined,
} as EncodedDocumentVersion)

export const generateDocumentVersion = (
  overrides: Partial<EncodedDocumentVersion> = {}
): EncodedDocumentVersion => {
  const base = deterministicDefaults()
  return { ...base, ...overrides } as EncodedDocumentVersion
}

export const createDocumentVersionEntity = (
  overrides: Partial<EncodedDocumentVersion> = {}
) => expectSuccess(DocumentVersionEntity.create(generateDocumentVersion(overrides)))


