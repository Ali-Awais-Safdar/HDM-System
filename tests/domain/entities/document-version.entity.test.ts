import { describe, expect, it } from "vitest";
import { DocumentVersionEntity } from "../../../src/domain/entities/document-version.entity";
import { ValidationError } from "../../../src/domain/errors/domain.errors";
import { 
  generateTestDocumentVersion,
  createFirstVersion,
  createVersionWithCreator,
  createVersionWithoutCreator,
  documentVersionArbitrary
} from "../../factories/document-version.factory";
import { TestPatterns } from "../../utils/test.helpers";
import * as fc from "fast-check";

describe("DocumentVersionEntity", () => {
  describe("Creation & Validation", () => {
    it("should create valid document version", () => {
      const versionData = generateTestDocumentVersion();
      const version = TestPatterns.Effect.expectSuccess(DocumentVersionEntity.create(versionData));

      expect(version).toBeInstanceOf(DocumentVersionEntity);
      expect(version.version).toBeGreaterThan(0);
      expect(version.checksum).toHaveLength(64);
    });

    it("should validate version number", () => {
      const invalidData = generateTestDocumentVersion({ version: 0 });
      TestPatterns.Effect.expectFailure(DocumentVersionEntity.create(invalidData), ValidationError);
    });
  });

  describe("Business Logic", () => {
    it("should identify first version", () => {
      const firstVer = TestPatterns.Effect.expectSuccess(
        DocumentVersionEntity.create(createFirstVersion(crypto.randomUUID()))
      );
      expect(firstVer.isFirstVersion).toBe(true);
    });

    it("should compare versions", () => {
      const v1 = TestPatterns.Effect.expectSuccess(
        DocumentVersionEntity.create(generateTestDocumentVersion({ version: 1 }))
      );
      const v2 = TestPatterns.Effect.expectSuccess(
        DocumentVersionEntity.create(generateTestDocumentVersion({ version: 2 }))
      );

      expect(v2.isNewerThan(v1)).toBe(true);
      expect(v1.isOlderThan(v2)).toBe(true);
    });

    it("should handle creator info", () => {
      const withCreator = TestPatterns.Effect.expectSuccess(
        DocumentVersionEntity.create(createVersionWithCreator(crypto.randomUUID()))
      );
      const withoutCreator = TestPatterns.Effect.expectSuccess(
        DocumentVersionEntity.create(createVersionWithoutCreator())
      );

      expect(withCreator.hasCreatorInfo).toBe(true);
      expect(withoutCreator.hasCreatorInfo).toBe(false);
    });

    it("should calculate file sizes", () => {
      const version = TestPatterns.Effect.expectSuccess(
        DocumentVersionEntity.create(generateTestDocumentVersion({ size: 2048 * 1024 }))
      );

      expect(version.sizeInKB).toBe(2048);
      expect(version.sizeInMB).toBeCloseTo(2, 1);
    });
  });

  describe("Property-Based Testing", () => {
    it("should handle valid data", () => {
      fc.assert(
        fc.property(documentVersionArbitrary, (data) => {
          const version = TestPatterns.Effect.expectSuccess(DocumentVersionEntity.create(data));
          expect(version.version).toBe(data.version);
          expect(version.checksum).toBe(data.checksum);
        }),
        { numRuns: 30 }
      );
    });
  });
});

