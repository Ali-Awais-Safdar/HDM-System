import { z } from "zod";

/**
 * Common Zod schemas shared across multiple endpoints.
 * Centralizes validation logic to avoid duplication and ensure consistency.
 */

/**
 * Standard error response schema used across all endpoints.
 * Provides consistent error response structure for API documentation and validation.
 */
export const errorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.array(z.object({
    field: z.string(),
    message: z.string()
  })).optional()
});

/**
 * Document ID parameter validation schema.
 * Used for endpoints that require a document ID in the URL path.
 */
export const documentIdParamSchema = z.object({
  id: z.string().min(1, "Document ID is required")
});

/**
 * Canonical search documents schema with comprehensive validation.
 * 
 * Search semantics:
 * - query: Fuzzy title search via ILIKE with trigram matching (pg_trgm extension)
 * - tags: Array filtering - documents must have ALL specified tags
 * - metadata: JSONB containment filtering using @> operator
 * - limit/offset: Standard pagination with reasonable defaults
 */
export const searchDocumentsSchema = z.object({
  /** Text query to search in document titles (optional) */
  query: z.string().max(255).optional().transform(val => val?.trim() || undefined),
  
  /** Array of tag names to filter by (documents must have ALL specified tags) */
  tags: z.array(z.string().min(1).max(100)).max(20).optional(),
  
  /** Metadata object to filter by (uses JSONB containment @>) */
  metadata: z.record(z.string(), z.unknown()).optional(),
  
  /** Maximum number of results to return (default: 20, max: 100) */
  limit: z.coerce.number().int().min(1).max(100).default(20),
  
  /** Number of results to skip for pagination (default: 0) */
  offset: z.coerce.number().int().min(0).default(0),
});

// TypeScript types derived from common schemas
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type DocumentIdParam = z.infer<typeof documentIdParamSchema>;
export type SearchDocumentsRequest = z.infer<typeof searchDocumentsSchema>;
