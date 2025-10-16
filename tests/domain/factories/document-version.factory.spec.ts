import { describe, it } from "vitest"
import { generateDocumentVersion } from "./document-version.factory"
import { TestPatterns } from "../../utils/test-patterns"

describe("DocumentVersion Factory - Constraints", () => {
  it("should satisfy file and version constraints", () => {
    TestPatterns.Factory.testFactoryConstraints(
      () => generateDocumentVersion(),
      [
        { name: "id uuid", validator: (v) => typeof v.id === "string" && v.id.includes("-") },
        { name: "documentId uuid", validator: (v) => typeof v.documentId === "string" && v.documentId.includes("-") },
        { name: "version positive", validator: (v) => typeof v.version === "number" && v.version > 0 },
        { name: "file size in range", validator: (v) => typeof v.file.size === "number" && v.file.size > 0 && v.file.size <= 100 * 1024 * 1024 },
        { name: "mime supported", validator: (v) => typeof v.file.mimeType === "string" },
      ],
      15
    )
  })

  it("should generate unique version ids", () => {
    TestPatterns.Factory.testFactoryUniqueness(
      () => generateDocumentVersion(),
      (v) => v.id,
      20
    )
  })
})


