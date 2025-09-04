import { z } from "zod";

/**
 * Zod schemas for document CRUD endpoints.
 * Validates every aspect of input as per company guidelines.
 */

export const createDocumentSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(255, "Title cannot exceed 255 characters")
    .trim(),
    
  metadata: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true; // Empty is valid
        try {
          JSON.parse(val);
          return true;
        } catch {
          return false;
        }
      },
      "Invalid JSON in metadata field"
    )
    .transform((val) => {
      if (!val) return {};
      return JSON.parse(val);
    })
    .pipe(
      z.record(z.string(), z.unknown())
        .refine(
          (metadata) => JSON.stringify(metadata).length <= 10000,
          "Metadata cannot exceed 10KB when serialized"
        )
    ),
    
  tags: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true; // Empty is valid
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed);
        } catch {
          return false;
        }
      },
      "Invalid JSON in tags field - must be a valid JSON array"
    )
    .transform((val) => {
      if (!val) return [];
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    })
    .pipe(
      z.array(
        z.string()
          .min(1, "Tag cannot be empty")
          .max(50, "Tag cannot exceed 50 characters")
          .regex(/^[a-zA-Z0-9\-_]+$/, "Tag can only contain letters, numbers, hyphens, and underscores")
      )
      .max(20, "Cannot have more than 20 tags")
      .transform(tags => [...new Set(tags)]) // Remove duplicates
    )
});

export const updateMetadataSchema = z.object({
  metadata: z
    .record(z.string(), z.unknown())
    .refine(
      (metadata) => JSON.stringify(metadata).length <= 10000,
      "Metadata cannot exceed 10KB when serialized"
    )
});

export const documentParamsSchema = z.object({
  id: z
    .string()
    .uuid("Document ID must be a valid UUID")
});

export const searchDocumentsSchema = z.object({
  q: z
    .string()
    .max(100, "Search query cannot exceed 100 characters")
    .optional(),
    
  tags: z
    .string()
    .transform(str => str.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0))
    .optional(),
    
  limit: z
    .string()
    .regex(/^\d+$/, "Limit must be a number")
    .transform(str => parseInt(str, 10))
    .refine(num => num > 0 && num <= 100, "Limit must be between 1 and 100")
    .default(20),
    
  offset: z
    .string()
    .regex(/^\d+$/, "Offset must be a number")
    .transform(str => parseInt(str, 10))
    .refine(num => num >= 0, "Offset must be non-negative")
    .default(0),
    
  metadata: z
    .string()
    .transform(str => {
      try {
        return JSON.parse(str);
      } catch {
        throw new Error("Metadata must be valid JSON");
      }
    })
    .optional()
});

// File upload validation schema
export const fileUploadSchema = z.object({
  originalname: z.string().min(1, "Original filename is required"),
  mimetype: z.string().min(1, "MIME type is required"),
  size: z.number().positive("File size must be positive"),
  buffer: z.instanceof(Buffer)
});

// Response schemas for documentation
export const documentResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  mimeType: z.string(),
  size: z.number(),
  metadata: z.record(z.string(), z.unknown()),
  tags: z.array(z.string()),
  ownerId: z.string().uuid(),
  createdAt: z.date().or(z.string().datetime()),
  updatedAt: z.date().or(z.string().datetime()).nullable()
});

export const deleteDocumentResponseSchema = z.object({
  success: z.boolean(),
  message: z.string()
});

export const errorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.array(z.object({
    field: z.string(),
    message: z.string()
  })).optional()
});

// TypeScript types derived from schemas
export type CreateDocumentRequest = z.infer<typeof createDocumentSchema>;
export type UpdateMetadataRequest = z.infer<typeof updateMetadataSchema>;
export type DocumentParams = z.infer<typeof documentParamsSchema>;
export type SearchDocumentsQuery = z.infer<typeof searchDocumentsSchema>;
export type FileUploadData = z.infer<typeof fileUploadSchema>;
export type DocumentResponse = z.infer<typeof documentResponseSchema>;
export type DeleteDocumentResponse = z.infer<typeof deleteDocumentResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
