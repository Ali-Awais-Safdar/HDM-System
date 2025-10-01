import { DocumentVersionEntity, SerializedDocumentVersion } from "../../src/domain/entities/document-version.entity";
import { faker } from "@faker-js/faker";
import { Effect as E } from "effect";
import * as fc from "fast-check";

/**
 * DocumentVersion-specific generators for test data
 */
const documentVersionGenerators = {
  id: () => crypto.randomUUID(),
  documentId: () => crypto.randomUUID(),

  checksum: () => faker.string.hexadecimal({ length: 64, casing: 'lower' }).replace('0x', ''),

  fileKey: () => {
    const folder = faker.helpers.arrayElement(['documents', 'uploads', 'files']);
    const filename = faker.system.fileName();
    return `${folder}/${crypto.randomUUID()}/${filename}`;
  },

  mimeType: () => {
    const mimeTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/jpeg",
      "image/png",
      "text/plain",
      "application/json",
    ];
    return faker.helpers.arrayElement(mimeTypes);
  },

  size: () => faker.number.int({ min: 100 * 1024, max: 50 * 1024 * 1024 }),

  version: () => faker.number.int({ min: 1, max: 20 }),

  createdBy: () => crypto.randomUUID(),

  createdAt: () => faker.date.past({ years: 2 }).toISOString(),
};

/**
 * Base factory function for generating test document version data (encoded format with Options)
 */
export const generateTestDocumentVersion = (
  overrides: Partial<SerializedDocumentVersion> = {}
): SerializedDocumentVersion => {
  const shouldHaveCreator = faker.datatype.boolean({ probability: 0.8 });

  return {
    id: documentVersionGenerators.id(),
    documentId: documentVersionGenerators.documentId(),
    version: documentVersionGenerators.version(),
    checksum: documentVersionGenerators.checksum(),
    fileKey: documentVersionGenerators.fileKey(),
    mimeType: documentVersionGenerators.mimeType(),
    size: documentVersionGenerators.size(),
    createdAt: documentVersionGenerators.createdAt(),
    createdBy: shouldHaveCreator 
      ? { _tag: "Some" as const, value: documentVersionGenerators.createdBy() }
      : { _tag: "None" as const },
    ...overrides,
  };
};

/**
 * Generate multiple test document versions
 */
export const generateTestDocumentVersions = (count: number): SerializedDocumentVersion[] => {
  return Array.from({ length: count }, () => generateTestDocumentVersion());
};

/**
 * Scenario: First version of a document
 */
export const createFirstVersion = (
  documentId: string,
  overrides: Partial<SerializedDocumentVersion> = {}
): SerializedDocumentVersion => {
  return {
    ...generateTestDocumentVersion(),
    documentId,
    version: 1,
    ...overrides,
  };
};

/**
 * Scenario: Version with creator information
 */
export const createVersionWithCreator = (
  createdBy: string,
  overrides: Partial<SerializedDocumentVersion> = {}
): SerializedDocumentVersion => {
  return {
    ...generateTestDocumentVersion(),
    createdBy: { _tag: "Some" as const, value: createdBy },
    ...overrides,
  };
};

/**
 * Scenario: Version without creator
 */
export const createVersionWithoutCreator = (
  overrides: Partial<SerializedDocumentVersion> = {}
): SerializedDocumentVersion => {
  return {
    ...generateTestDocumentVersion(),
    createdBy: { _tag: "None" as const },
    ...overrides,
  };
};

/**
 * Scenario: PDF document version
 */
export const createPdfVersion = (overrides: Partial<SerializedDocumentVersion> = {}): SerializedDocumentVersion => {
  return {
    ...generateTestDocumentVersion(),
    mimeType: "application/pdf",
    ...overrides,
  };
};

/**
 * Scenario: Large file version (> 10MB)
 */
export const createLargeFileVersion = (overrides: Partial<SerializedDocumentVersion> = {}): SerializedDocumentVersion => {
  return {
    ...generateTestDocumentVersion(),
    size: faker.number.int({ min: 10 * 1024 * 1024, max: 100 * 1024 * 1024 }),
    ...overrides,
  };
};

/**
 * Create a test DocumentVersion entity from generated data
 */
export const createTestDocumentVersionEntity = (
  overrides: Partial<SerializedDocumentVersion> = {}
): E.Effect<DocumentVersionEntity, Error> => {
  const versionData = generateTestDocumentVersion(overrides);

  return DocumentVersionEntity.create(versionData).pipe(
    E.mapError((error) => new Error(`Failed to create test document version entity: ${error.message}`))
  ) as E.Effect<DocumentVersionEntity, Error>;
};

/**
 * Create multiple test DocumentVersion entities
 */
export const createTestDocumentVersionEntities = (
  count: number,
  overrides: Partial<SerializedDocumentVersion> = {}
): E.Effect<DocumentVersionEntity[], Error> => {
  const versions = generateTestDocumentVersions(count).map((version) => ({ ...version, ...overrides }));

  return E.all(versions.map((data) => DocumentVersionEntity.create(data))).pipe(
    E.mapError((error) => new Error(`Failed to create test document version entities: ${error}`))
  ) as E.Effect<DocumentVersionEntity[], Error>;
};

/**
 * Fast-check arbitrary for property-based testing
 */
export const documentVersionArbitrary = fc.record({
  id: fc.uuid(),
  documentId: fc.uuid(),
  version: fc.integer({ min: 1, max: 100 }),
  checksum: fc.hexaString({ minLength: 64, maxLength: 64 }),
  fileKey: fc.string({ minLength: 10, maxLength: 200 }),
  mimeType: fc.constantFrom(
    "application/pdf",
    "application/msword",
    "image/jpeg",
    "image/png"
  ),
  size: fc.integer({ min: 1, max: 100 * 1024 * 1024 }),
  createdAt: fc.date().map(d => d.toISOString()),
  createdBy: fc.oneof(
    fc.constant({ _tag: "None" as const }),
    fc.uuid().map(id => ({ _tag: "Some" as const, value: id }))
  ),
});
