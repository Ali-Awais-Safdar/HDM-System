import { describe, it, expect } from "vitest";
import {
  generateDownloadLinkSchema,
  downloadTokenParamSchema,
  documentIdParamSchema,
  generateDownloadLinkResponseSchema,
  downloadErrorResponseSchema,
} from "../../../../src/web/http/schemas/download.schema";

describe("Download Schemas", () => {
  describe("generateDownloadLinkSchema", () => {
    it("should validate valid request with expiresInMinutes", () => {
      const validData = { expiresInMinutes: 10 };
      const result = generateDownloadLinkSchema.safeParse(validData);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.expiresInMinutes).toBe(10);
      }
    });

    it("should use default value when expiresInMinutes is not provided", () => {
      const validData = {};
      const result = generateDownloadLinkSchema.safeParse(validData);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.expiresInMinutes).toBe(5); // Default value
      }
    });

    it("should coerce string numbers to numbers", () => {
      const validData = { expiresInMinutes: "15" };
      const result = generateDownloadLinkSchema.safeParse(validData);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.expiresInMinutes).toBe(15);
        expect(typeof result.data.expiresInMinutes).toBe("number");
      }
    });

    it("should reject expiresInMinutes below minimum (1)", () => {
      const invalidData = { expiresInMinutes: 0 };
      const result = generateDownloadLinkSchema.safeParse(invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toHaveLength(1);
        expect(result.error.issues[0]!.code).toBe("too_small");
        expect(result.error.issues[0]!.path).toEqual(["expiresInMinutes"]);
      }
    });

    it("should reject expiresInMinutes above maximum (60)", () => {
      const invalidData = { expiresInMinutes: 120 };
      const result = generateDownloadLinkSchema.safeParse(invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toHaveLength(1);
        expect(result.error.issues[0]!.code).toBe("too_big");
        expect(result.error.issues[0]!.path).toEqual(["expiresInMinutes"]);
      }
    });

    it("should reject non-integer values", () => {
      const invalidData = { expiresInMinutes: 10.5 };
      const result = generateDownloadLinkSchema.safeParse(invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.code).toBe("invalid_type");
        expect(result.error.issues[0]!.message).toContain("expected int");
      }
    });

    it("should reject non-numeric strings", () => {
      const invalidData = { expiresInMinutes: "invalid" };
      const result = generateDownloadLinkSchema.safeParse(invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.code).toBe("invalid_type");
      }
    });

    it("should reject negative values", () => {
      const invalidData = { expiresInMinutes: -5 };
      const result = generateDownloadLinkSchema.safeParse(invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.code).toBe("too_small");
      }
    });

    it("should handle optional field correctly", () => {
      const validData = { expiresInMinutes: undefined };
      const result = generateDownloadLinkSchema.safeParse(validData);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.expiresInMinutes).toBe(5); // Default value
      }
    });

    it("should ignore extra fields", () => {
      const dataWithExtra = { 
        expiresInMinutes: 30,
        extraField: "ignored"
      };
      const result = generateDownloadLinkSchema.safeParse(dataWithExtra);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.expiresInMinutes).toBe(30);
        expect("extraField" in result.data).toBe(false);
      }
    });
  });

  describe("downloadTokenParamSchema", () => {
    it("should validate valid token", () => {
      const validData = { token: "valid-token-string" };
      const result = downloadTokenParamSchema.safeParse(validData);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.token).toBe("valid-token-string");
      }
    });

    it("should reject empty token", () => {
      const invalidData = { token: "" };
      const result = downloadTokenParamSchema.safeParse(invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.code).toBe("too_small");
        expect(result.error.issues[0]!.message).toBe("Download token is required");
      }
    });

    it("should reject missing token", () => {
      const invalidData = {};
      const result = downloadTokenParamSchema.safeParse(invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.code).toBe("invalid_type");
        expect(result.error.issues[0]!.path).toEqual(["token"]);
      }
    });

    it("should reject null token", () => {
      const invalidData = { token: null };
      const result = downloadTokenParamSchema.safeParse(invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.code).toBe("invalid_type");
      }
    });

    it("should reject non-string token", () => {
      const invalidData = { token: 123 };
      const result = downloadTokenParamSchema.safeParse(invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.code).toBe("invalid_type");
        expect(result.error.issues[0]!.message).toContain("expected string");
      }
    });

    it("should handle very long tokens", () => {
      const longToken = "a".repeat(1000);
      const validData = { token: longToken };
      const result = downloadTokenParamSchema.safeParse(validData);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.token).toBe(longToken);
      }
    });

    it("should handle tokens with special characters", () => {
      const specialToken = "token-with-special_chars.123!@#";
      const validData = { token: specialToken };
      const result = downloadTokenParamSchema.safeParse(validData);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.token).toBe(specialToken);
      }
    });
  });

  describe("documentIdParamSchema", () => {
    it("should validate valid document ID", () => {
      const validData = { id: "doc-123" };
      const result = documentIdParamSchema.safeParse(validData);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe("doc-123");
      }
    });

    it("should reject empty document ID", () => {
      const invalidData = { id: "" };
      const result = documentIdParamSchema.safeParse(invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.code).toBe("too_small");
        expect(result.error.issues[0]!.message).toBe("Document ID is required");
      }
    });

    it("should reject missing document ID", () => {
      const invalidData = {};
      const result = documentIdParamSchema.safeParse(invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.code).toBe("invalid_type");
        expect(result.error.issues[0]!.path).toEqual(["id"]);
      }
    });

    it("should reject non-string document ID", () => {
      const invalidData = { id: 123 };
      const result = documentIdParamSchema.safeParse(invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.code).toBe("invalid_type");
        expect(result.error.issues[0]!.message).toContain("expected string");
      }
    });

    it("should handle UUID format document IDs", () => {
      const uuidId = "01234567-89ab-cdef-0123-456789abcdef";
      const validData = { id: uuidId };
      const result = documentIdParamSchema.safeParse(validData);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(uuidId);
      }
    });
  });

  describe("generateDownloadLinkResponseSchema", () => {
    it("should validate valid response", () => {
      const validResponse = {
        url: "/downloads/abc123",
        expiresAt: "2023-12-31T23:59:59.999Z",
        documentId: "doc-123",
        issuedTo: "user-456",
        message: "Download link generated successfully",
      };
      
      const result = generateDownloadLinkResponseSchema.safeParse(validResponse);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validResponse);
      }
    });

    it("should reject response with missing required fields", () => {
      const invalidResponse = {
        url: "/downloads/abc123",
        // Missing expiresAt, documentId, issuedTo, message
      };
      
      const result = generateDownloadLinkResponseSchema.safeParse(invalidResponse);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
        const missingFields = result.error.issues.map(issue => issue.path[0]);
        expect(missingFields).toContain("expiresAt");
        expect(missingFields).toContain("documentId");
        expect(missingFields).toContain("issuedTo");
        expect(missingFields).toContain("message");
      }
    });

    it("should reject response with invalid field types", () => {
      const invalidResponse = {
        url: 123, // Should be string
        expiresAt: new Date(), // Should be string (ISO date)
        documentId: null, // Should be string
        issuedTo: [], // Should be string
        message: true, // Should be string
      };
      
      const result = generateDownloadLinkResponseSchema.safeParse(invalidResponse);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBe(5); // All fields are invalid
        result.error.issues.forEach(issue => {
          expect(issue.code).toBe("invalid_type");
          expect(issue.message).toContain("expected string");
        });
      }
    });

    it("should handle extra fields in response", () => {
      const responseWithExtra = {
        url: "/downloads/abc123",
        expiresAt: "2023-12-31T23:59:59.999Z",
        documentId: "doc-123",
        issuedTo: "user-456",
        message: "Download link generated successfully",
        extraField: "ignored",
      };
      
      const result = generateDownloadLinkResponseSchema.safeParse(responseWithExtra);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect("extraField" in result.data).toBe(false);
      }
    });
  });

  describe("downloadErrorResponseSchema", () => {
    it("should validate error response with required fields", () => {
      const validError = {
        error: "Download token not found",
      };
      
      const result = downloadErrorResponseSchema.safeParse(validError);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.error).toBe("Download token not found");
        expect(result.data.code).toBeUndefined();
        expect(result.data.details).toBeUndefined();
      }
    });

    it("should validate error response with all fields", () => {
      const fullError = {
        error: "Invalid request body",
        code: "VALIDATION_ERROR",
        details: [
          {
            code: "too_small",
            path: ["expiresInMinutes"],
            message: "Number must be greater than or equal to 1",
          }
        ],
      };
      
      const result = downloadErrorResponseSchema.safeParse(fullError);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(fullError);
      }
    });

    it("should reject error response without error field", () => {
      const invalidError = {
        code: "VALIDATION_ERROR",
        details: "Some details",
      };
      
      const result = downloadErrorResponseSchema.safeParse(invalidError);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.code).toBe("invalid_type");
        expect(result.error.issues[0]!.path).toEqual(["error"]);
      }
    });

    it("should handle various details types", () => {
      const testCases = [
        { details: "string details" },
        { details: 123 },
        { details: true },
        { details: null },
        { details: { nested: "object" } },
        { details: ["array", "of", "values"] },
      ];
      
      testCases.forEach(testCase => {
        const errorWithDetails = {
          error: "Some error",
          ...testCase,
        };
        
        const result = downloadErrorResponseSchema.safeParse(errorWithDetails);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.details).toEqual(testCase.details);
        }
      });
    });

    it("should handle empty error message", () => {
      const errorWithEmptyMessage = {
        error: "",
      };
      
      const result = downloadErrorResponseSchema.safeParse(errorWithEmptyMessage);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.error).toBe("");
      }
    });

    it("should reject non-string error field", () => {
      const invalidError = {
        error: 123,
      };
      
      const result = downloadErrorResponseSchema.safeParse(invalidError);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.code).toBe("invalid_type");
        expect(result.error.issues[0]!.message).toContain("expected string");
      }
    });

    it("should reject non-string code field when provided", () => {
      const invalidError = {
        error: "Some error",
        code: 123,
      };
      
      const result = downloadErrorResponseSchema.safeParse(invalidError);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.code).toBe("invalid_type");
        expect(result.error.issues[0]!.path).toEqual(["code"]);
        expect(result.error.issues[0]!.message).toContain("expected string");
      }
    });
  });

  describe("Schema edge cases", () => {
    it("should handle null values appropriately", () => {
      const schemas = [
        { schema: generateDownloadLinkSchema, data: null },
        { schema: downloadTokenParamSchema, data: null },
        { schema: documentIdParamSchema, data: null },
        { schema: generateDownloadLinkResponseSchema, data: null },
        { schema: downloadErrorResponseSchema, data: null },
      ];

      schemas.forEach(({ schema, data }) => {
        const result = schema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.code).toBe("invalid_type");
        }
      });
    });

    it("should handle undefined values appropriately", () => {
      const schemas = [
        { schema: generateDownloadLinkSchema, data: undefined },
        { schema: downloadTokenParamSchema, data: undefined },
        { schema: documentIdParamSchema, data: undefined },
        { schema: generateDownloadLinkResponseSchema, data: undefined },
        { schema: downloadErrorResponseSchema, data: undefined },
      ];

      schemas.forEach(({ schema, data }) => {
        const result = schema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.code).toBe("invalid_type");
        }
      });
    });

    it("should handle array values appropriately", () => {
      const schemas = [
        { schema: generateDownloadLinkSchema, data: [] },
        { schema: downloadTokenParamSchema, data: [] },
        { schema: documentIdParamSchema, data: [] },
        { schema: generateDownloadLinkResponseSchema, data: [] },
        { schema: downloadErrorResponseSchema, data: [] },
      ];

      schemas.forEach(({ schema, data }) => {
        const result = schema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.code).toBe("invalid_type");
        }
      });
    });
  });
});
