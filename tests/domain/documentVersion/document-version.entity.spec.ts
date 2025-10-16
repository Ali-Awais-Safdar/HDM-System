import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { DocumentVersionEntity } from "@domain/documentVersion/document-version.entity"
import { DocumentVersionValidationError } from "@domain/documentVersion/document-version.error"
import { generateDocumentVersion, createDocumentVersionEntity } from "../factories/document-version.factory"
import { TestPatterns } from "../../utils/test-patterns"
import { withTestClock } from "../setup/test-clock"

describe("DocumentVersionEntity", () => {
  describe("Creation", () => {
    it("should create valid document version from factory data", () => {
      const data = generateDocumentVersion({
        version: 1,
        file: {
          checksum: "abc123",
          fileKey: "files/test.pdf",
          mimeType: "application/pdf",
          size: 1024 * 1024, // 1MB
        },
        createdBy: "user-123",
      })

      const version = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentVersionEntity.create(data), Date.now())
      )

      expect(version).toBeInstanceOf(DocumentVersionEntity)
      expect(version.version).toBe(1)
      expect(version.file.mimeType).toBe("application/pdf")
      expect(version.file.size).toBe(1024 * 1024)
    })

    it("should handle minimal document version data", () => {
      const data = generateDocumentVersion({
        version: 1,
        createdBy: undefined,
      })

      const version = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentVersionEntity.create(data), Date.now())
      )

      expect(version.version).toBe(1)
      expect(version.hasCreatorInfo).toBe(false)
    })
  })

  describe("Validation Failures", () => {
    it("should fail with unsupported MIME type", () => {
      const data = generateDocumentVersion({
        file: {
          checksum: "abc123",
          fileKey: "files/test.xyz",
          mimeType: "application/unsupported",
          size: 1024,
        },
      })

      const error = TestPatterns.Effect.expectFailure(
        withTestClock(DocumentVersionEntity.create(data), Date.now()),
        DocumentVersionValidationError
      )

      expect(error).toBeInstanceOf(DocumentVersionValidationError)
    })

    it("should fail with file size exceeding 100MB", () => {
      const data = generateDocumentVersion({
        file: {
          checksum: "abc123",
          fileKey: "files/large.pdf",
          mimeType: "application/pdf",
          size: 101 * 1024 * 1024, // 101MB
        },
      })

      const error = TestPatterns.Effect.expectFailure(
        withTestClock(DocumentVersionEntity.create(data), Date.now()),
        DocumentVersionValidationError
      )

      expect(error).toBeInstanceOf(DocumentVersionValidationError)
    })

    it("should fail with zero file size", () => {
      const data = generateDocumentVersion({
        file: {
          checksum: "abc123",
          fileKey: "files/empty.pdf",
          mimeType: "application/pdf",
          size: 0,
        },
      })

      const error = TestPatterns.Effect.expectFailure(
        withTestClock(DocumentVersionEntity.create(data), Date.now()),
        DocumentVersionValidationError
      )

      expect(error).toBeInstanceOf(DocumentVersionValidationError)
    })

    it("should fail with negative version number", () => {
      const data = generateDocumentVersion({
        version: -1,
      })

      const error = TestPatterns.Effect.expectFailure(
        withTestClock(DocumentVersionEntity.create(data), Date.now()),
        DocumentVersionValidationError
      )

      expect(error).toBeInstanceOf(DocumentVersionValidationError)
    })
  })

  describe("Creator Info Option Handling", () => {
    it("should handle creator Some case", () => {
      const version = createDocumentVersionEntity({
        createdBy: "user-123",
      })

      expect(version.hasCreatorInfo).toBe(true)
      const creatorId = TestPatterns.Option.expectSome(version.getCreatorIdOption())
      expect(creatorId).toBe("user-123")
    })

    it("should handle creator None case", () => {
      const version = createDocumentVersionEntity({
        createdBy: undefined,
      })

      expect(version.hasCreatorInfo).toBe(false)
      TestPatterns.Option.expectNone(version.getCreatorIdOption())
    })
  })

  describe("Size Calculations", () => {
    it("should calculate sizeInKB correctly", () => {
      const version = createDocumentVersionEntity({
        file: {
          checksum: "abc123",
          fileKey: "files/test.pdf",
          mimeType: "application/pdf",
          size: 1536, // 1.5KB
        },
      })

      expect(version.sizeInKB).toBe(2) // Math.round(1536 / 1024) = 2
    })

    it("should calculate sizeInMB correctly", () => {
      const version = createDocumentVersionEntity({
        file: {
          checksum: "abc123",
          fileKey: "files/test.pdf",
          mimeType: "application/pdf",
          size: 2.5 * 1024 * 1024, // 2.5MB
        },
      })

      expect(version.sizeInMB).toBe(2.5) // Math.round((2.5 * 100) / 100) = 2.5
    })

    it("should handle large file sizes", () => {
      const version = createDocumentVersionEntity({
        file: {
          checksum: "abc123",
          fileKey: "files/large.pdf",
          mimeType: "application/pdf",
          size: 50 * 1024 * 1024, // 50MB
        },
      })

      expect(version.sizeInMB).toBe(50)
      expect(version.sizeInKB).toBe(51200) // 50 * 1024
    })
  })

  describe("Version Comparisons", () => {
    it("should identify first version correctly", () => {
      const firstVersion = createDocumentVersionEntity({ version: 1 })
      const laterVersion = createDocumentVersionEntity({ version: 2 })

      expect(firstVersion.isFirstVersion).toBe(true)
      expect(laterVersion.isFirstVersion).toBe(false)
    })

    it("should compare versions correctly", () => {
      const v1 = createDocumentVersionEntity({ version: 1 })
      const v2 = createDocumentVersionEntity({ version: 2 })
      const v3 = createDocumentVersionEntity({ version: 3 })

      // v2 is newer than v1
      expect(v2.isNewerThan(v1)).toBe(true)
      expect(v1.isOlderThan(v2)).toBe(true)

      // v3 is newer than v2
      expect(v3.isNewerThan(v2)).toBe(true)
      expect(v2.isOlderThan(v3)).toBe(true)

      // v1 is older than v3
      expect(v1.isOlderThan(v3)).toBe(true)
      expect(v3.isNewerThan(v1)).toBe(true)

      // Same version
      const v1Copy = createDocumentVersionEntity({ version: 1 })
      expect(v1.isNewerThan(v1Copy)).toBe(false)
      expect(v1.isOlderThan(v1Copy)).toBe(false)
    })
  })

  describe("File Metadata Access", () => {
    it("should expose file properties correctly", () => {
      const version = createDocumentVersionEntity({
        file: {
          checksum: "abc123def456",
          fileKey: "files/test.pdf",
          mimeType: "application/pdf",
          size: 1024,
        },
      })

      expect(version.checksum).toBe("abc123def456")
      expect(version.fileKey).toBe("files/test.pdf")
      expect(version.mimeType).toBe("application/pdf")
      expect(version.size).toBe(1024)
    })

    it("should maintain file metadata through serialization", () => {
      const originalFile = {
        checksum: "def456ghi789",
        fileKey: "files/document.pdf",
        mimeType: "image/png",
        size: 2048,
      }

      const original = createDocumentVersionEntity({
        file: originalFile,
      })

      // Verify accessors match input
      expect(original.checksum).toBe(originalFile.checksum)
      expect(original.fileKey).toBe(originalFile.fileKey)
      expect(original.mimeType).toBe(originalFile.mimeType)
      expect(original.size).toBe(originalFile.size)

      // Serialize and deserialize
      const serialized = TestPatterns.Effect.expectSuccess(original.serialized())
      const recreated = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentVersionEntity.create(serialized), Date.now())
      )

      // Verify accessors still match after round-trip
      expect(recreated.checksum).toBe(originalFile.checksum)
      expect(recreated.fileKey).toBe(originalFile.fileKey)
      expect(recreated.mimeType).toBe(originalFile.mimeType)
      expect(recreated.size).toBe(originalFile.size)
    })

    it("should handle different MIME types correctly", () => {
      const mimeTypes = [
        "application/pdf",
        "text/plain",
        "image/jpeg",
        "image/png",
        "application/msword",
      ]

      mimeTypes.forEach((mimeType) => {
        const version = createDocumentVersionEntity({
          file: {
            checksum: "test123",
            fileKey: `files/test.${mimeType.split("/")[1]}`,
            mimeType,
            size: 1024,
          },
        })

        expect(version.mimeType).toBe(mimeType)
      })
    })

    it("should preserve file metadata integrity across operations", () => {
      const fileData = {
        checksum: "sha256:abcdef123456",
        fileKey: "uploads/2025/document-v2.pdf",
        mimeType: "application/pdf",
        size: 5 * 1024 * 1024, // 5MB
      }

      const version = createDocumentVersionEntity({
        version: 2,
        file: fileData,
      })

      // Test all accessors return the exact input values
      expect(version.checksum).toBe(fileData.checksum)
      expect(version.fileKey).toBe(fileData.fileKey)
      expect(version.mimeType).toBe(fileData.mimeType)
      expect(version.size).toBe(fileData.size)

      // Verify through serialization round-trip
      const serialized = TestPatterns.Effect.expectSuccess(version.serialized())
      const recreated = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentVersionEntity.create(serialized), Date.now())
      )

      // All file metadata should be preserved exactly
      expect(recreated.checksum).toBe(fileData.checksum)
      expect(recreated.fileKey).toBe(fileData.fileKey)
      expect(recreated.mimeType).toBe(fileData.mimeType)
      expect(recreated.size).toBe(fileData.size)
    })
  })

  describe("Document Association", () => {
    it("should check document association correctly", () => {
      const documentId = "550e8400-e29b-41d4-a716-446655440001" as any
      const version = createDocumentVersionEntity({
        documentId,
      })

      expect(version.isForDocument(documentId)).toBe(true)
      expect(version.isForDocument("550e8400-e29b-41d4-a716-446655440002" as any)).toBe(false)
    })

    it("should check version number correctly", () => {
      const version = createDocumentVersionEntity({ version: 5 })

      expect(version.isVersion(5)).toBe(true)
      expect(version.isVersion(1)).toBe(false)
    })
  })

  describe("Serialization", () => {
    it("should maintain data through serialization round-trip", () => {
      const original = createDocumentVersionEntity({
        version: 2,
        createdBy: "user-456",
        file: {
          checksum: "def456ghi789",
          fileKey: "files/document.pdf",
          mimeType: "application/pdf",
          size: 2048,
        },
      })

      // Serialize
      const serialized = TestPatterns.Effect.expectSuccess(original.serialized())

      // Deserialize
      const recreated = TestPatterns.Effect.expectSuccess(
        withTestClock(DocumentVersionEntity.create(serialized), Date.now())
      )

      // Assert key field equality
      expect(recreated.id).toBe(original.id)
      expect(recreated.documentId).toBe(original.documentId)
      expect(recreated.version).toBe(original.version)
      expect(recreated.checksum).toBe(original.checksum)
      expect(recreated.fileKey).toBe(original.fileKey)
      expect(recreated.mimeType).toBe(original.mimeType)
      expect(recreated.size).toBe(original.size)
      expect(recreated.createdAt.getTime()).toBe(original.createdAt.getTime())
    })
  })

  describe("Property Tests", () => {
    it("should maintain version comparison consistency", () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 1, max: 1000 }),
            fc.integer({ min: 1, max: 1000 })
          ),
          ([versionA, versionB]) => {
            const vA = createDocumentVersionEntity({ version: versionA })
            const vB = createDocumentVersionEntity({ version: versionB })

            // If A is newer than B, then B must be older than A
            if (vA.isNewerThan(vB)) {
              expect(vB.isOlderThan(vA)).toBe(true)
            }

            // If A is older than B, then B must be newer than A
            if (vA.isOlderThan(vB)) {
              expect(vB.isNewerThan(vA)).toBe(true)
            }

            // If versions are equal, neither should be newer/older
            if (versionA === versionB) {
              expect(vA.isNewerThan(vB)).toBe(false)
              expect(vA.isOlderThan(vB)).toBe(false)
            }

            // Mutual exclusivity: A cannot be both newer and older than B
            expect(vA.isNewerThan(vB) && vA.isOlderThan(vB)).toBe(false)
          }
        )
      )
    })
  })
})
