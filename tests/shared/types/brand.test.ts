import { describe, it, expect } from "vitest";
import { 
  asUserId, 
  asDocumentId, 
  asMimeType,
  asEmailAddress,
  asFileSize,
  newUserId,
  newDocumentId
} from "../../../src/shared/types/brand";

describe("Branded Types", () => {
  describe("type conversion", () => {
    it("should convert string to UserId", () => {
      const id = "test-user-id";
      const userId = asUserId(id);
      expect(userId).toBe(id);
    });

    it("should convert string to DocumentId", () => {
      const id = "test-document-id";
      const documentId = asDocumentId(id);
      expect(documentId).toBe(id);
    });

    it("should convert string to MimeType", () => {
      const mime = "application/pdf";
      const mimeType = asMimeType(mime);
      expect(mimeType).toBe(mime);
    });

    it("should convert string to EmailAddress", () => {
      const email = "test@example.com";
      const emailAddress = asEmailAddress(email);
      expect(emailAddress).toBe(email);
    });

    it("should convert number to FileSize", () => {
      const size = 1024;
      const fileSize = asFileSize(size);
      expect(fileSize).toBe(size);
    });
  });

  describe("ID generation", () => {
    it("should generate unique UserIds", () => {
      const id1 = newUserId();
      const id2 = newUserId();
      
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe("string");
      expect(typeof id2).toBe("string");
      expect(id1.length).toBeGreaterThan(0);
      expect(id2.length).toBeGreaterThan(0);
    });

    it("should generate unique DocumentIds", () => {
      const id1 = newDocumentId();
      const id2 = newDocumentId();
      
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe("string");
      expect(typeof id2).toBe("string");
      expect(id1.length).toBeGreaterThan(0);
      expect(id2.length).toBeGreaterThan(0);
    });

    it("should generate UUIDs in correct format", () => {
      const userId = newUserId();
      const documentId = newDocumentId();
      
      // UUID v7 format: xxxxxxxx-xxxx-7xxx-xxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      
      expect(userId).toMatch(uuidRegex);
      expect(documentId).toMatch(uuidRegex);
    });
  });
});
