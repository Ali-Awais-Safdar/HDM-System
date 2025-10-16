import { describe, it, expect } from "vitest"
import { generateDocument, createDocumentWithTags } from "./document.factory"
import { TestPatterns } from "../../utils/test-patterns"

describe("Document Factory - Constraints", () => {
  it("should satisfy domain constraints", () => {
    TestPatterns.Factory.testFactoryConstraints(
      () => generateDocument(),
      [
        {
          name: "id is UUID",
          validator: (d) => typeof d.id === "string" && d.id.includes("-"),
        },
        {
          name: "title is non-empty and <= 255",
          validator: (d) => typeof d.title === "string" && d.title.trim().length > 0 && d.title.length <= 255,
        },
        {
          name: "tags are undefined or valid list",
          validator: (d) => d.tags === undefined || (Array.isArray(d.tags) && d.tags.length <= 20),
        },
      ],
      15
    )
  })

  it("should generate unique ids", () => {
    TestPatterns.Factory.testFactoryUniqueness(
      () => generateDocument(),
      (d) => d.id,
      20
    )
  })

  it("should allow tag scenarios", () => {
    const d = createDocumentWithTags()
    expect(Array.isArray(d.tags)).toBe(true)
    if (Array.isArray(d.tags)) {
      expect(d.tags.length).toBeGreaterThan(0)
    }
  })
})


