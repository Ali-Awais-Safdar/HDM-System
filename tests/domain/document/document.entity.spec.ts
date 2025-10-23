import { describe, it, expect } from "vitest"
import { Option } from "effect"
import * as fc from "fast-check"
import { DocumentEntity } from "@domain/document/document.entity"
import { DocumentValidationError } from "@domain/document/document.error"
import { BusinessRuleViolationError } from "@domain/utils/base.errors"
import { generateDocument } from "../factories/document.factory"
import { TestPatterns } from "../../utils/test-patterns"
import { withTestClock } from "../setup/test-clock"

describe("DocumentEntity", () => {
  describe("Creation", () => {
    it("should create valid document from factory data", () => {
      const data = generateDocument({
        title: "Test Document",
        description: "A test description",
        tags: ["test", "example"],
      })

      const document = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(data), Date.now())
      )

      expect(document).toBeInstanceOf(DocumentEntity)
      expect(document.title).toBe("Test Document")
      expect(document.hasDescriptionValue).toBe(true)
      expect(document.hasTagsValue).toBe(true)
      expect(document.tagCount).toBe(2)
    })

    it("should handle minimal document data", () => {
      const data = generateDocument({
        title: "Minimal Doc",
        description: undefined,
        tags: undefined,
      })

      const document = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(data), Date.now())
      )

      expect(document.title).toBe("Minimal Doc")
      expect(document.hasDescriptionValue).toBe(false)
      expect(document.hasTagsValue).toBe(false)
      expect(document.tagCount).toBe(0)
    })
  })

  describe("Validation Failures", () => {
    it("should fail with empty title", () => {
      const data = generateDocument({ title: "" })

      const error = TestPatterns.Effect.expectFailure(
        withTestClock(DocumentEntity.create(data), Date.now()),
        DocumentValidationError
      )

      expect(error).toBeInstanceOf(DocumentValidationError)
      expect(error.field).toBe("document")
    })

    it("should fail with whitespace-only title", () => {
      const data = generateDocument({ title: "   " })

      const error = TestPatterns.Effect.expectFailure(
        withTestClock(DocumentEntity.create(data), Date.now()),
        DocumentValidationError
      )

      expect(error).toBeInstanceOf(DocumentValidationError)
    })

    it("should fail with title exceeding 255 characters", () => {
      const data = generateDocument({ title: "a".repeat(256) })

      const error = TestPatterns.Effect.expectFailure(
        withTestClock(DocumentEntity.create(data), Date.now()),
        DocumentValidationError
      )

      expect(error).toBeInstanceOf(DocumentValidationError)
    })

    it("should fail with invalid description length", () => {
      const data = generateDocument({ description: "x".repeat(1001) })

      const error = TestPatterns.Effect.expectFailure(
        withTestClock(DocumentEntity.create(data), Date.now()),
        DocumentValidationError
      )

      expect(error).toBeInstanceOf(DocumentValidationError)
    })

    it("should fail with invalid tags", () => {
      const data = generateDocument({ tags: ["a".repeat(51)] }) // Tag too long

      const error = TestPatterns.Effect.expectFailure(
        withTestClock(DocumentEntity.create(data), Date.now()),
        DocumentValidationError
      )

      expect(error).toBeInstanceOf(DocumentValidationError)
    })
  })

  describe("Title Trimming", () => {
    it("should trim whitespace from title", () => {
      const data = generateDocument({ title: "  Trimmed Title  " })

      const document = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(data), Date.now())
      )

      expect(document.title).toBe("Trimmed Title")
    })
  })

  describe("Computed Properties", () => {
    it("should compute description presence correctly", () => {
      const withDesc = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(generateDocument({ description: "test" })), Date.now())
      )
      const withoutDesc = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(generateDocument({ description: undefined })), Date.now())
      )

      expect(withDesc.hasDescriptionValue).toBe(true)
      expect(withoutDesc.hasDescriptionValue).toBe(false)
    })

    it("should compute tags presence correctly", () => {
      const withTags = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(generateDocument({ tags: ["test"] })), Date.now())
      )
      const withoutTags = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(generateDocument({ tags: undefined })), Date.now())
      )

      expect(withTags.hasTagsValue).toBe(true)
      expect(withoutTags.hasTagsValue).toBe(false)
    })
  })

  describe("Option Transitions", () => {
    it("should handle description Some/None transitions", () => {
      // Test Some case
      const withDescription = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(generateDocument({ description: "Valid description" })), Date.now())
      )
      
      expect(withDescription.hasDescriptionValue).toBe(true)
      expect(withDescription.descriptionOrEmpty).toBe("Valid description")
      
      // Test None case
      const withoutDescription = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(generateDocument({ description: undefined })), Date.now())
      )
      
      expect(withoutDescription.hasDescriptionValue).toBe(false)
      expect(withoutDescription.descriptionOrEmpty).toBe("")
    })

    it("should handle tags Some/None transitions", () => {
      // Test Some case with tags
      const withTags = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(generateDocument({ tags: ["alpha", "beta", "gamma"] })), Date.now())
      )
      
      expect(withTags.hasTagsValue).toBe(true)
      expect(withTags.tagCount).toBe(3)
      expect(withTags.tagsOrEmpty).toEqual(["alpha", "beta", "gamma"])
      
      // Test None case
      const withoutTags = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(generateDocument({ tags: undefined })), Date.now())
      )
      
      expect(withoutTags.hasTagsValue).toBe(false)
      expect(withoutTags.tagCount).toBe(0)
      expect(withoutTags.tagsOrEmpty).toEqual([])
      
      // Test empty array case (should be treated as None)
      const emptyTags = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(generateDocument({ tags: [] })), Date.now())
      )
      
      expect(emptyTags.hasTagsValue).toBe(false)
      expect(emptyTags.tagCount).toBe(0)
      expect(emptyTags.tagsOrEmpty).toEqual([])
    })

    it("should handle mixed Option states", () => {
      const mixed = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(generateDocument({ 
          description: "Has description", 
          tags: undefined 
        })), Date.now())
      )
      
      expect(mixed.hasDescriptionValue).toBe(true)
      expect(mixed.hasTagsValue).toBe(false)
      expect(mixed.descriptionOrEmpty).toBe("Has description")
      expect(mixed.tagsOrEmpty).toEqual([])
    })
  })

  describe("Mutations", () => {
    const FIXED_TIME = 1704067200000 // 2025-01-01T00:00:00.000Z
    const LATER_TIME = 1704067260000 // 2025-01-01T00:01:00.000Z

    it("should rename document and update timestamp", () => {
      const original = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(generateDocument({ title: "Original Title" })), FIXED_TIME)
      )

      const renamed = TestPatterns.Effect.expectSuccess(
        withTestClock(original.rename("New Title"), LATER_TIME)
      )

      expect(renamed.title).toBe("New Title")
      expect(renamed.id).toBe(original.id) // ID persists
      expect(renamed.ownerId).toBe(original.ownerId) // Other properties persist
      expect(renamed.isModified).toBe(true)
    })

    it("should update description and update timestamp", () => {
      const original = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(generateDocument({ description: "Old description" })), FIXED_TIME)
      )

      const updated = TestPatterns.Effect.expectSuccess(
        withTestClock(original.updateDescription(Option.some("New description")), LATER_TIME)
      )

      expect(updated.descriptionOrEmpty).toBe("New description")
      expect(updated.id).toBe(original.id)
      expect(updated.isModified).toBe(true)
    })

    // Removed test for updateCurrentVersion - method no longer exists
    // Current version is now managed via document_versions table

    it("should fail rename with invalid title length", () => {
      const original = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(generateDocument()), FIXED_TIME)
      )

      const error = TestPatterns.Effect.expectFailure(
        withTestClock(original.rename("a".repeat(256)), LATER_TIME),
        DocumentValidationError
      )

      expect(error).toBeInstanceOf(DocumentValidationError)
      expect(error.field).toBe("title")
    })

    it("should fail rename with empty title", () => {
      const original = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(generateDocument()), FIXED_TIME)
      )

      const error = TestPatterns.Effect.expectFailure(
        withTestClock(original.rename(""), LATER_TIME),
        DocumentValidationError
      )

      expect(error).toBeInstanceOf(DocumentValidationError)
    })
  })

  describe("Tag Operations", () => {
    const FIXED_TIME = 1704067200000
    const LATER_TIME = 1704067260000

    it("should add tags successfully", () => {
      const original = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(generateDocument({ tags: ["existing"] })), FIXED_TIME)
      )

      const updated = TestPatterns.Effect.expectSuccess(
        withTestClock(original.addTags(["new", "tags"]), LATER_TIME)
      )

      expect(updated.tagsOrEmpty).toContain("existing")
      expect(updated.tagsOrEmpty).toContain("new")
      expect(updated.tagsOrEmpty).toContain("tags")
      expect(updated.isModified).toBe(true)
    })

    it("should remove tags successfully", () => {
      const original = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(generateDocument({ tags: ["keep", "remove"] })), FIXED_TIME)
      )

      const updated = TestPatterns.Effect.expectSuccess(
        withTestClock(original.removeTags(["remove"]), LATER_TIME)
      )

      expect(updated.tagsOrEmpty).toContain("keep")
      expect(updated.tagsOrEmpty).not.toContain("remove")
      expect(updated.isModified).toBe(true)
    })

    it("should fail adding empty tag array", () => {
      const original = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(generateDocument()), FIXED_TIME)
      )

      const result = withTestClock(original.addTags([]), LATER_TIME)
      const error = TestPatterns.Effect.expectFailure(result as any, BusinessRuleViolationError)

      expect(error).toBeInstanceOf(BusinessRuleViolationError)
      expect((error as BusinessRuleViolationError).details?.rule).toBe("INVALID_TAGS")
    })

    it("should fail removing empty tag array", () => {
      const original = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(generateDocument()), FIXED_TIME)
      )

      const error = TestPatterns.Effect.expectFailure(
        withTestClock(original.removeTags([]), LATER_TIME),
        DocumentValidationError
      )

      expect(error).toBeInstanceOf(DocumentValidationError)
      expect(error.field).toBe("tags")
    })
  })

  describe("Property Tests", () => {
    it("should deduplicate and normalize tags", () => {
      const TAG_RE = new RegExp('^[a-zA-Z0-9\\-_\\s]+$')
      fc.assert(
        fc.property(
          fc.array(
            fc.string({ minLength: 1, maxLength: 10 })
              .filter((s) => TAG_RE.test(s) && s.trim().length > 0),
            { minLength: 1, maxLength: 30 }
          ),
          (rawTags: string[]) => {
            const document = TestPatterns.Effect.expectSuccess(
              withTestClock(DocumentEntity.create(generateDocument({ tags: [] })), Date.now())
            )

            const result = TestPatterns.Effect.expectSuccess(
              withTestClock(document.addTags(rawTags), Date.now())
            )

            const finalTags = result.tagsOrEmpty
            
            // Assert uniqueness (case-insensitive)
            const normalized = finalTags.map(tag => tag.toLowerCase())
            const uniqueNormalized = new Set(normalized)
            expect(uniqueNormalized.size).toBe(normalized.length)
            
            // Assert length constraint
            expect(finalTags.length).toBeLessThanOrEqual(20)
            
            // Assert all tags are normalized (trimmed, lowercase)
            finalTags.forEach(tag => {
              expect(tag).toBe(tag.trim())
              expect(tag.length).toBeGreaterThan(0)
              expect(tag.length).toBeLessThanOrEqual(50)
            })
          }
        )
      )
    })

    it("should maintain data through serialization round-trip", () => {
      const original = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(generateDocument({
          title: "Serialization Test",
          description: "Test description",
          tags: ["test", "serialization"]
        })), Date.now())
      )

      // Serialize
      const serialized = TestPatterns.Effect.expectSuccess(original.serialized())

      // Deserialize
      const recreated = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentEntity.create(serialized), Date.now())
      )

      // Assert key field equality
      expect(recreated.id).toBe(original.id)
      expect(recreated.title).toBe(original.title)
      expect(recreated.ownerId).toBe(original.ownerId)
      // currentVersionId removed - no longer part of document entity
      expect(recreated.descriptionOrEmpty).toBe(original.descriptionOrEmpty)
      expect(recreated.tagsOrEmpty).toEqual(original.tagsOrEmpty)
      expect(recreated.createdAt.getTime()).toBe(original.createdAt.getTime())
    })
  })
})
