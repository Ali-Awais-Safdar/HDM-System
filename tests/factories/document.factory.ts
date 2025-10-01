import { DocumentEntity, SerializedDocument } from "../../src/domain/entities/document.entity";
import { faker } from "@faker-js/faker";
import { Effect as E } from "effect";
import * as fc from "fast-check";

/**
 * Document-specific generators for test data
 */
const documentGenerators = {
  id: () => crypto.randomUUID(),
  ownerId: () => crypto.randomUUID(),
  currentVersionId: () => crypto.randomUUID(),
  
  title: () => {
    const titles = [
      "Quarterly Report Q4 2024",
      "Employee Handbook v2.3",
      "Project Proposal - Alpha Initiative",
      "Meeting Notes - Board Review",
      "Financial Statement 2024",
      "Technical Specification Document",
      "User Guide v1.0",
      "Marketing Strategy 2025",
    ];
    return faker.helpers.arrayElement(titles).substring(0, 255);
  },

  description: () => faker.lorem.sentences(faker.number.int({ min: 1, max: 5 })).substring(0, 1000),

  tags: () => {
    const availableTags = [
      "finance", "hr", "engineering", "marketing", "sales", "legal",
      "urgent", "confidential", "archived", "draft", "final", "review-required"
    ];
    const count = faker.number.int({ min: 1, max: 5 });
    const selectedTags = faker.helpers.arrayElements(availableTags, count);
    return Array.from(new Set(selectedTags.map(tag => tag.toLowerCase().substring(0, 50))));
  },

  createdAt: () => faker.date.past({ years: 2 }).toISOString(),
  updatedAt: () => faker.date.recent().toISOString(),
};

/**
 * Base factory function for generating test document data (encoded format with Options)
 */
export const generateTestDocument = (overrides: Partial<SerializedDocument> = {}): SerializedDocument => {
  const shouldHaveDescription = faker.datatype.boolean({ probability: 0.7 });
  const shouldHaveTags = faker.datatype.boolean({ probability: 0.6 });
  const shouldHaveUpdatedAt = faker.datatype.boolean({ probability: 0.5 });

  return {
    id: documentGenerators.id(),
    ownerId: documentGenerators.ownerId(),
    title: documentGenerators.title(),
    description: shouldHaveDescription 
      ? { _tag: "Some" as const, value: documentGenerators.description() }
      : { _tag: "None" as const },
    tags: shouldHaveTags 
      ? { _tag: "Some" as const, value: documentGenerators.tags() }
      : { _tag: "None" as const },
    currentVersionId: documentGenerators.currentVersionId(),
    createdAt: documentGenerators.createdAt(),
    updatedAt: shouldHaveUpdatedAt 
      ? { _tag: "Some" as const, value: documentGenerators.updatedAt() }
      : { _tag: "None" as const },
    ...overrides,
  };
};

/**
 * Generate multiple test documents
 */
export const generateTestDocuments = (count: number): SerializedDocument[] => {
  return Array.from({ length: count }, () => generateTestDocument());
};

/**
 * Scenario: Document with complete data (all optional fields populated)
 */
export const createCompleteDocument = (overrides: Partial<SerializedDocument> = {}): SerializedDocument => {
  return {
    ...generateTestDocument(),
    description: { _tag: "Some" as const, value: documentGenerators.description() },
    tags: { _tag: "Some" as const, value: documentGenerators.tags() },
    updatedAt: { _tag: "Some" as const, value: documentGenerators.updatedAt() },
    ...overrides,
  };
};

/**
 * Scenario: Minimal document (only required fields)
 */
export const createMinimalDocument = (overrides: Partial<SerializedDocument> = {}): SerializedDocument => {
  return {
    ...generateTestDocument(),
    description: { _tag: "None" as const },
    tags: { _tag: "None" as const },
    updatedAt: { _tag: "None" as const },
    ...overrides,
  };
};

/**
 * Scenario: Recently modified document
 */
export const createRecentlyModifiedDocument = (overrides: Partial<SerializedDocument> = {}): SerializedDocument => {
  return {
    ...generateTestDocument(),
    createdAt: faker.date.past({ years: 1 }).toISOString(),
    updatedAt: { _tag: "Some" as const, value: faker.date.recent().toISOString() },
    ...overrides,
  };
};

/**
 * Scenario: Document with specific tags
 */
export const createDocumentWithTags = (
  tags: string[],
  overrides: Partial<SerializedDocument> = {}
): SerializedDocument => {
  return {
    ...generateTestDocument(),
    tags: { _tag: "Some" as const, value: tags },
    ...overrides,
  };
};

/**
 * Create a test Document entity from generated data
 */
export const createTestDocumentEntity = (
  overrides: Partial<SerializedDocument> = {}
): E.Effect<DocumentEntity, Error> => {
  const docData = generateTestDocument(overrides);

  return DocumentEntity.create(docData).pipe(
    E.mapError((error) => new Error(`Failed to create test document entity: ${error.message}`))
  ) as E.Effect<DocumentEntity, Error>;
};

/**
 * Create multiple test Document entities
 */
export const createTestDocumentEntities = (
  count: number,
  overrides: Partial<SerializedDocument> = {}
): E.Effect<DocumentEntity[], Error> => {
  const docs = generateTestDocuments(count).map((doc) => ({ ...doc, ...overrides }));

  return E.all(docs.map((data) => DocumentEntity.create(data))).pipe(
    E.mapError((error) => new Error(`Failed to create test document entities: ${error}`))
  ) as E.Effect<DocumentEntity[], Error>;
};

/**
 * Fast-check arbitrary for property-based testing
 */
export const documentArbitrary = fc.record({
  id: fc.uuid(),
  ownerId: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 255 }),
  description: fc.oneof(
    fc.constant({ _tag: "None" as const }),
    fc.string({ maxLength: 1000 }).map(s => ({ _tag: "Some" as const, value: s }))
  ),
  tags: fc.oneof(
    fc.constant({ _tag: "None" as const }),
    fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 })
      .map(arr => ({ _tag: "Some" as const, value: arr }))
  ),
  currentVersionId: fc.uuid(),
  createdAt: fc.date().map(d => d.toISOString()),
  updatedAt: fc.oneof(
    fc.constant({ _tag: "None" as const }),
    fc.date().map(d => ({ _tag: "Some" as const, value: d.toISOString() }))
  ),
});
