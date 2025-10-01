import { describe, expect, it } from "vitest";
import { DocumentEntity } from "../../../src/domain/entities/document.entity";
import { ValidationError } from "../../../src/domain/errors/domain.errors";
import { 
  generateTestDocument, 
  createCompleteDocument, 
  createMinimalDocument,
  createDocumentWithTags,
  createTestDocumentEntity,
  documentArbitrary
} from "../../factories/document.factory";
import { TestPatterns } from "../../utils/test.helpers";
import * as fc from "fast-check";

describe("DocumentEntity - Comprehensive Tests", () => {
  describe("Entity Creation", () => {
    it("should create valid document using factory", () => {
      const docData = generateTestDocument({
        title: "Test Document",
      });

      const document = TestPatterns.Effect.expectSuccess(DocumentEntity.create(docData));

      expect(document).toBeInstanceOf(DocumentEntity);
      expect(document.title).toBe("Test Document");
      expect(document.id).toBeDefined();
      expect(document.ownerId).toBeDefined();
    });

    it("should handle validation errors for invalid data", () => {
      const invalidData = generateTestDocument({
        title: "",  // Invalid - empty title
      });

      const error = TestPatterns.Effect.expectFailure(
        DocumentEntity.create(invalidData),
        ValidationError
      );
      
      expect(error).toBeInstanceOf(ValidationError);
    });

    it("should validate title length constraints", () => {
      const tooLongTitle = "a".repeat(256); // Exceeds 255 char limit
      const invalidData = generateTestDocument({
        title: tooLongTitle,
      });

      TestPatterns.Effect.expectFailure(
        DocumentEntity.create(invalidData),
        ValidationError
      );
    });
  });

  describe("Optional Field Handling", () => {
    it("should handle present optional values", () => {
      const docData = createCompleteDocument({
        title: "Complete Document",
      });

      const document = TestPatterns.Effect.expectSuccess(DocumentEntity.create(docData));

      TestPatterns.Option.expectSomeWith(
        document.description,
        (desc) => desc.length > 0,
        "Description should be non-empty"
      );

      const tags = TestPatterns.Option.expectSome(document.tags);
      expect(tags.length).toBeGreaterThan(0);
    });

    it("should handle missing optional values", () => {
      const docData = createMinimalDocument();

      const document = TestPatterns.Effect.expectSuccess(DocumentEntity.create(docData));

      TestPatterns.Option.expectNone(document.description);
      TestPatterns.Option.expectNone(document.tags);
      TestPatterns.Option.expectNone(document.updatedAt);
    });
  });

  describe("Computed Properties & Business Logic", () => {
    it("should calculate computed properties correctly", () => {
      const document = TestPatterns.Effect.expectSuccess(
        DocumentEntity.create(createCompleteDocument({
          title: "Test Doc",
        }))
      );

      TestPatterns.Entity.testComputedProperties(document, [
        {
          name: "hasDescriptionValue",
          getter: (d) => d.hasDescriptionValue,
          expected: true
        },
        {
          name: "hasTagsValue",
          getter: (d) => d.hasTagsValue,
          expected: true
        },
      ]);
    });

    it("should update document title correctly", () => {
      const document = TestPatterns.Effect.expectSuccess(
        DocumentEntity.create(generateTestDocument({ title: "Original Title" }))
      );

      const updatedDocument = TestPatterns.Effect.expectSuccess(
        document.rename("New Title")
      );

      expect(updatedDocument.title).toBe("New Title");
      expect(updatedDocument.isModified).toBe(true);
    });

    it("should update description correctly", () => {
      const document = TestPatterns.Effect.expectSuccess(
        DocumentEntity.create(createMinimalDocument())
      );

      const updatedDocument = TestPatterns.Effect.expectSuccess(
        document.updateDescription("New Description")
      );

      const desc = TestPatterns.Option.expectSome(updatedDocument.description);
      expect(desc).toBe("New Description");
    });

    it("should add tags correctly", () => {
      const document = TestPatterns.Effect.expectSuccess(
        DocumentEntity.create(createMinimalDocument())
      );

      const updatedDocument = TestPatterns.Effect.expectSuccess(
        document.addTags(["tag1", "tag2"])
      );

      const tags = TestPatterns.Option.expectSome(updatedDocument.tags);
      expect(tags).toContain("tag1");
      expect(tags).toContain("tag2");
    });

    it("should handle duplicate tags correctly", () => {
      const document = TestPatterns.Effect.expectSuccess(
        DocumentEntity.create(createDocumentWithTags(["existing"]))
      );

      const updatedDocument = TestPatterns.Effect.expectSuccess(
        document.addTags(["existing", "new"])
      );

      const tags = TestPatterns.Option.expectSome(updatedDocument.tags);
      expect(tags).toContain("existing");
      expect(tags).toContain("new");
      expect(tags.length).toBe(2); // No duplicate
    });

    it("should remove tags correctly", () => {
      const document = TestPatterns.Effect.expectSuccess(
        DocumentEntity.create(createDocumentWithTags(["tag1", "tag2", "tag3"]))
      );

      const updatedDocument = TestPatterns.Effect.expectSuccess(
        document.removeTags(["tag2"])
      );

      const tags = TestPatterns.Option.expectSome(updatedDocument.tags);
      expect(tags).toContain("tag1");
      expect(tags).toContain("tag3");
      expect(tags).not.toContain("tag2");
    });
  });

  describe("Factory Override Testing", () => {
    it("should apply overrides correctly", () => {
      const overrideScenarios = [
        {
          name: "Complete Document",
          overrides: {
            title: "Override Title",
          },
          validator: (doc: DocumentEntity) => {
            expect(doc.title).toBe("Override Title");
            expect(doc.hasDescriptionValue).toBe(true);
          }
        },
        {
          name: "Minimal Document",
          overrides: {
            title: "Minimal Title",
          },
          validator: (doc: DocumentEntity) => {
            expect(doc.title).toBe("Minimal Title");
          }
        },
      ];

      TestPatterns.Factory.testFactoryOverrides(
        (overrides) => overrides.title === "Minimal Title" 
          ? createMinimalDocument(overrides)
          : createCompleteDocument(overrides),
        (data) => DocumentEntity.create(data),
        overrideScenarios
      );
    });
  });

  describe("Error Scenarios", () => {
    it("should validate domain constraints", () => {
      const errorScenarios = [
        {
          name: "empty title",
          data: generateTestDocument({ title: "" }),
          errorType: ValidationError
        },
        {
          name: "title too long",
          data: generateTestDocument({ title: "a".repeat(256) }),
          errorType: ValidationError
        },
      ];

      errorScenarios.forEach(({ data, errorType }) => {
        const error = TestPatterns.Effect.expectFailure(
          DocumentEntity.create(data),
          errorType
        );
        expect(error).toBeInstanceOf(errorType);
      });
    });

    it("should reject invalid tag operations", () => {
      const document = TestPatterns.Effect.expectSuccess(
        DocumentEntity.create(generateTestDocument())
      );
      
      // Empty array should succeed (no change)
      const result = TestPatterns.Effect.expectSuccess(document.addTags([]));
      expect(result).toBe(document);
    });
  });

  describe("Data Integrity & Serialization", () => {
    it("should maintain data through serialization", async () => {
      const document = TestPatterns.Effect.expectSuccess(
        DocumentEntity.create(createCompleteDocument({
          title: "Test Document",
        }))
      );

      await TestPatterns.Entity.testSerializationRoundTrip(
        document,
        (d) => d.serialized(),
        (data) => DocumentEntity.create(data),
        (original, deserialized) => {
          return (
            original.id === deserialized.id &&
            original.title === deserialized.title &&
            original.ownerId === deserialized.ownerId &&
            TestPatterns.Option.equals(original.description, deserialized.description)
          );
        }
      );
    });

    it("should create entity from async effect", async () => {
      const document = await TestPatterns.Effect.expectAsyncSuccess(
        createTestDocumentEntity({ title: "Async Document" })
      );
      
      expect(document).toBeInstanceOf(DocumentEntity);
      expect(document.title).toBe("Async Document");
    });
  });

  describe("Batch Operations", () => {
    it("should handle multiple entities consistently", () => {
      const documents = Array.from({ length: 10 }, () => 
        TestPatterns.Effect.expectSuccess(
          DocumentEntity.create(generateTestDocument())
        )
      );

      expect(documents).toHaveLength(10);
      
      documents.forEach((doc) => {
        expect(doc).toBeInstanceOf(DocumentEntity);
        expect(doc.title.length).toBeGreaterThan(0);
        expect(doc.title.length).toBeLessThanOrEqual(255);
      });

      // Test uniqueness across batch
      const ids = documents.map(d => d.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(documents.length);
    });
  });

  describe("Property-Based Testing", () => {
    it("should handle any valid document data", () => {
      fc.assert(
        fc.property(documentArbitrary, (data) => {
          // Helper function to validate tags
          const isValidTag = (tag: string): boolean => {
            const trimmed = tag.trim();
            return trimmed.length > 0 && trimmed.length <= 50 && /^[a-zA-Z0-9\-_\s]+$/.test(trimmed);
          };
          
          // Pre-condition: Skip invalid data that doesn't meet domain rules
          const titleValid = data.title.trim().length > 0 && data.title.trim().length <= 255;
          const tagsValid = !data.tags || data.tags._tag === "None" || 
            (data.tags._tag === "Some" && 
             data.tags.value.length <= 20 &&
             data.tags.value.every((t: string) => isValidTag(t)));
          
          fc.pre(titleValid && tagsValid);
          
          const result = DocumentEntity.create(data);
          // Valid data should create entity successfully
          const doc = TestPatterns.Effect.expectSuccess(result);
          expect(doc).toBeInstanceOf(DocumentEntity);
          expect(doc.title).toBe(data.title);
        }),
        { numRuns: 50 }
      );
    });

    it("should maintain title constraints in property tests", () => {
      fc.assert(
        fc.property(documentArbitrary, (data) => {
          // Helper to validate tags
          const isValidTag = (tag: string): boolean => {
            const trimmed = tag.trim();
            return trimmed.length > 0 && trimmed.length <= 50 && /^[a-zA-Z0-9\-_\s]+$/.test(trimmed);
          };
          
          // Pre-condition: Only test with valid data
          const titleValid = data.title.trim().length > 0 && data.title.trim().length <= 255;
          const tagsValid = !data.tags || data.tags._tag === "None" || 
            (data.tags._tag === "Some" && data.tags.value.every((t: string) => isValidTag(t)));
          
          fc.pre(titleValid && tagsValid);
          
          const doc = TestPatterns.Effect.expectSuccess(DocumentEntity.create(data));
          // Title must be between 1 and 255 chars (trimmed)
          expect(doc.title.trim().length).toBeGreaterThan(0);
          expect(doc.title.trim().length).toBeLessThanOrEqual(255);
        }),
        { numRuns: 100 }
      );
    });
  });
});

