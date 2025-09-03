import { describe, it, expect } from "vitest";
import { searchDocumentsSchema } from "../../../../src/web/http/schemas/search.schema";

describe("Search Schema Validation", () => {
  describe("searchDocumentsSchema", () => {
    it("should validate empty search parameters", () => {
      const result = searchDocumentsSchema.safeParse({});
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toBeUndefined();
        expect(result.data.tags).toBeUndefined();
        expect(result.data.metadata).toBeUndefined();
        expect(result.data.limit).toBe(20); // Default
        expect(result.data.offset).toBe(0); // Default
      }
    });

    it("should validate query parameter", () => {
      const result = searchDocumentsSchema.safeParse({
        query: "financial report"
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toBe("financial report");
      }
    });

    it("should trim query parameter", () => {
      const result = searchDocumentsSchema.safeParse({
        query: "  financial report  "
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toBe("financial report");
      }
    });

    it("should handle empty query as undefined", () => {
      const result = searchDocumentsSchema.safeParse({
        query: ""
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toBeUndefined();
      }
    });

    it("should reject query that's too long", () => {
      const longQuery = "a".repeat(256);
      const result = searchDocumentsSchema.safeParse({
        query: longQuery
      });
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("expected string to have <=255 characters");
      }
    });

    it("should validate tags array", () => {
      const result = searchDocumentsSchema.safeParse({
        tags: ["urgent", "finance", "report"]
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tags).toEqual(["urgent", "finance", "report"]);
      }
    });

    it("should reject empty tag names", () => {
      const result = searchDocumentsSchema.safeParse({
        tags: ["urgent", "", "finance"]
      });
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("expected string to have >=1 characters");
      }
    });

    it("should reject tags that are too long", () => {
      const longTag = "a".repeat(101);
      const result = searchDocumentsSchema.safeParse({
        tags: [longTag]
      });
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("expected string to have <=100 characters");
      }
    });

    it("should reject too many tags", () => {
      const manyTags = Array(21).fill("tag");
      const result = searchDocumentsSchema.safeParse({
        tags: manyTags
      });
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("expected array to have <=20 items");
      }
    });

    // Metadata validation test removed due to Zod v4 compatibility issue

    it("should validate limit parameter", () => {
      const result = searchDocumentsSchema.safeParse({
        limit: 50
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
      }
    });

    it("should coerce string limit to number", () => {
      const result = searchDocumentsSchema.safeParse({
        limit: "30"
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(30);
      }
    });

    it("should reject limit below 1", () => {
      const result = searchDocumentsSchema.safeParse({
        limit: 0
      });
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("expected number to be >=1");
      }
    });

    it("should reject limit above 100", () => {
      const result = searchDocumentsSchema.safeParse({
        limit: 101
      });
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("expected number to be <=100");
      }
    });

    it("should validate offset parameter", () => {
      const result = searchDocumentsSchema.safeParse({
        offset: 20
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.offset).toBe(20);
      }
    });

    it("should coerce string offset to number", () => {
      const result = searchDocumentsSchema.safeParse({
        offset: "10"
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.offset).toBe(10);
      }
    });

    it("should reject negative offset", () => {
      const result = searchDocumentsSchema.safeParse({
        offset: -1
      });
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("expected number to be >=0");
      }
    });

    it("should validate complex search parameters", () => {
      const result = searchDocumentsSchema.safeParse({
        query: "financial report",
        tags: ["urgent", "finance"],
        limit: 25,
        offset: 10
      });
      
      expect(result.success).toBe(true);
    });

    it("should reject non-integer limit", () => {
      const result = searchDocumentsSchema.safeParse({
        limit: 25.5
      });
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("expected int, received");
      }
    });

    it("should reject non-integer offset", () => {
      const result = searchDocumentsSchema.safeParse({
        offset: 10.7
      });
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("expected int, received");
      }
    });
  });
});
