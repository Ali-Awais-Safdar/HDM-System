import { describe, it, expect } from "vitest";
import { DocumentPolicy } from "../../../src/domain/policies/document.policy";
import { asUserId, asDocumentId } from "../../../src/shared/types/brand";

describe("Document Policy", () => {
  const adminUserId = asUserId("admin-user-id");
  const regularUserId = asUserId("regular-user-id");
  const otherUserId = asUserId("other-user-id");
  const documentId = asDocumentId("document-id");

  describe("canRead", () => {
    it("should allow admin to read any document", () => {
      const result = DocumentPolicy.canRead({
        userId: adminUserId,
        userRole: "admin",
        documentId,
        ownerId: otherUserId
      });

      expect(result).toBe(true);
    });

    it("should allow owner to read their own document", () => {
      const result = DocumentPolicy.canRead({
        userId: regularUserId,
        userRole: "user",
        documentId,
        ownerId: regularUserId
      });

      expect(result).toBe(true);
    });

    it("should allow user with read permission", () => {
      const result = DocumentPolicy.canRead({
        userId: regularUserId,
        userRole: "user",
        documentId,
        ownerId: otherUserId,
        directPermission: "read"
      });

      expect(result).toBe(true);
    });

    it("should allow user with write permission to read", () => {
      const result = DocumentPolicy.canRead({
        userId: regularUserId,
        userRole: "user",
        documentId,
        ownerId: otherUserId,
        directPermission: "write"
      });

      expect(result).toBe(true);
    });

    it("should deny user without permission", () => {
      const result = DocumentPolicy.canRead({
        userId: regularUserId,
        userRole: "user",
        documentId,
        ownerId: otherUserId
      });

      expect(result).toBe(false);
    });
  });

  describe("canWrite", () => {
    it("should allow admin to write any document", () => {
      const result = DocumentPolicy.canWrite({
        userId: adminUserId,
        userRole: "admin",
        documentId,
        ownerId: otherUserId
      });

      expect(result).toBe(true);
    });

    it("should allow owner to write their own document", () => {
      const result = DocumentPolicy.canWrite({
        userId: regularUserId,
        userRole: "user",
        documentId,
        ownerId: regularUserId
      });

      expect(result).toBe(true);
    });

    it("should allow user with write permission", () => {
      const result = DocumentPolicy.canWrite({
        userId: regularUserId,
        userRole: "user",
        documentId,
        ownerId: otherUserId,
        directPermission: "write"
      });

      expect(result).toBe(true);
    });

    it("should deny user with only read permission", () => {
      const result = DocumentPolicy.canWrite({
        userId: regularUserId,
        userRole: "user",
        documentId,
        ownerId: otherUserId,
        directPermission: "read"
      });

      expect(result).toBe(false);
    });
  });

  describe("canDelete", () => {
    it("should allow admin to delete any document", () => {
      const result = DocumentPolicy.canDelete({
        userId: adminUserId,
        userRole: "admin",
        documentId,
        ownerId: otherUserId
      });

      expect(result).toBe(true);
    });

    it("should allow owner to delete their own document", () => {
      const result = DocumentPolicy.canDelete({
        userId: regularUserId,
        userRole: "user",
        documentId,
        ownerId: regularUserId
      });

      expect(result).toBe(true);
    });

    it("should deny user with write permission from deleting", () => {
      const result = DocumentPolicy.canDelete({
        userId: regularUserId,
        userRole: "user",
        documentId,
        ownerId: otherUserId,
        directPermission: "write"
      });

      expect(result).toBe(false);
    });

    it("should allow user with admin permission to delete", () => {
      const result = DocumentPolicy.canDelete({
        userId: regularUserId,
        userRole: "user",
        documentId,
        ownerId: otherUserId,
        directPermission: "admin"
      });

      expect(result).toBe(true);
    });
  });

  describe("canShare", () => {
    it("should allow admin to share any document", () => {
      const result = DocumentPolicy.canShare({
        userId: adminUserId,
        userRole: "admin",
        documentId,
        ownerId: otherUserId
      });

      expect(result).toBe(true);
    });

    it("should allow owner to share their own document", () => {
      const result = DocumentPolicy.canShare({
        userId: regularUserId,
        userRole: "user",
        documentId,
        ownerId: regularUserId
      });

      expect(result).toBe(true);
    });

    it("should deny user with write permission from sharing", () => {
      const result = DocumentPolicy.canShare({
        userId: regularUserId,
        userRole: "user",
        documentId,
        ownerId: otherUserId,
        directPermission: "write"
      });

      expect(result).toBe(false);
    });
  });
});
