import { describe, it, expect } from "vitest";
import { Document } from "../../../src/domain/entities/document.entity";
import { 
  asDocumentId, 
  asUserId, 
  asMimeType, 
  asFileSize 
} from "../../../src/shared/types/brand";

describe("Document Entity", () => {
  const validDocumentId = asDocumentId("01234567-89ab-cdef-0123-456789abcdef");
  const validOwnerId = asUserId("01234567-89ab-cdef-0123-456789abcdef");
  const validMimeType = asMimeType("application/pdf");
  const validSize = asFileSize(1024);
  const validStorageKey = "documents/test-file.pdf";

  describe("creation", () => {
    it("should create a document with valid properties", () => {
      const document = Document.create({
        id: validDocumentId,
        ownerId: validOwnerId,
        title: "Test Document",
        mimeType: validMimeType,
        size: validSize,
        storageKey: validStorageKey
      });

      expect(document.id).toBe(validDocumentId);
      expect(document.ownerId).toBe(validOwnerId);
      expect(document.title).toBe("Test Document");
      expect(document.mimeType).toBe(validMimeType);
      expect(document.size).toBe(validSize);
      expect(document.storageKey).toBe(validStorageKey);
      expect(document.metadata).toEqual({});
      expect(document.tags).toEqual([]);
      expect(document.createdAt).toBeInstanceOf(Date);
      expect(document.updatedAt).toBeNull();
    });

    it("should create a document with metadata and tags", () => {
      const metadata = { category: "legal", priority: "high" };
      const tags = ["legal", "contract"];

      const document = Document.create({
        id: validDocumentId,
        ownerId: validOwnerId,
        title: "Contract Document",
        mimeType: validMimeType,
        size: validSize,
        storageKey: validStorageKey,
        metadata,
        tags
      });

      expect(document.metadata).toEqual(metadata);
      expect(document.tags).toEqual(tags);
    });
  });

  describe("validation", () => {
    it("should throw error for empty title", () => {
      expect(() => {
        Document.create({
          id: validDocumentId,
          ownerId: validOwnerId,
          title: "",
          mimeType: validMimeType,
          size: validSize,
          storageKey: validStorageKey
        });
      }).toThrow("Document title cannot be empty");
    });

    it("should throw error for title too long", () => {
      const longTitle = "a".repeat(256);
      
      expect(() => {
        Document.create({
          id: validDocumentId,
          ownerId: validOwnerId,
          title: longTitle,
          mimeType: validMimeType,
          size: validSize,
          storageKey: validStorageKey
        });
      }).toThrow("Document title cannot exceed 255 characters");
    });

    it("should throw error for invalid size", () => {
      expect(() => {
        Document.create({
          id: validDocumentId,
          ownerId: validOwnerId,
          title: "Test Document",
          mimeType: validMimeType,
          size: asFileSize(0),
          storageKey: validStorageKey
        });
      }).toThrow("Document size must be positive");
    });
  });

  describe("metadata operations", () => {
    it("should update metadata correctly", () => {
      const document = Document.create({
        id: validDocumentId,
        ownerId: validOwnerId,
        title: "Test Document",
        mimeType: validMimeType,
        size: validSize,
        storageKey: validStorageKey,
        metadata: { category: "draft" }
      });

      const updatedDocument = document.updateMetadata({ 
        category: "final", 
        reviewedBy: "john.doe" 
      });

      expect(updatedDocument.metadata).toEqual({
        category: "final",
        reviewedBy: "john.doe"
      });
      expect(updatedDocument.updatedAt).toBeInstanceOf(Date);
      expect(updatedDocument.createdAt).toBe(document.createdAt);
    });
  });

  describe("tag operations", () => {
    it("should add tags correctly", () => {
      const document = Document.create({
        id: validDocumentId,
        ownerId: validOwnerId,
        title: "Test Document",
        mimeType: validMimeType,
        size: validSize,
        storageKey: validStorageKey,
        tags: ["existing"]
      });

      const updatedDocument = document.addTags(["new", "another"]);

      expect(updatedDocument.tags).toEqual(["existing", "new", "another"]);
      expect(updatedDocument.updatedAt).toBeInstanceOf(Date);
    });

    it("should not duplicate tags", () => {
      const document = Document.create({
        id: validDocumentId,
        ownerId: validOwnerId,
        title: "Test Document",
        mimeType: validMimeType,
        size: validSize,
        storageKey: validStorageKey,
        tags: ["existing"]
      });

      const updatedDocument = document.addTags(["existing", "new"]);

      expect(updatedDocument.tags).toEqual(["existing", "new"]);
    });

    it("should remove tags correctly", () => {
      const document = Document.create({
        id: validDocumentId,
        ownerId: validOwnerId,
        title: "Test Document",
        mimeType: validMimeType,
        size: validSize,
        storageKey: validStorageKey,
        tags: ["tag1", "tag2", "tag3"]
      });

      const updatedDocument = document.removeTags(["tag2"]);

      expect(updatedDocument.tags).toEqual(["tag1", "tag3"]);
      expect(updatedDocument.updatedAt).toBeInstanceOf(Date);
    });
  });
});
