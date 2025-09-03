import { z } from "zod";

/**
 * Validation schema for document search requests.
 * Supports text search, tag filtering, metadata filtering, and pagination.
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

/**
 * Type for validated search parameters
 */
export type SearchDocumentsRequest = z.infer<typeof searchDocumentsSchema>;

/**
 * Response schema for search results
 */
export const searchDocumentsResponseSchema = z.object({
  documents: z.array(z.object({
    id: z.string(),
    title: z.string(),
    mimeType: z.string(),
    size: z.number(),
    metadata: z.record(z.string(), z.unknown()),
    tags: z.array(z.string()),
    createdAt: z.string(),
    updatedAt: z.string().optional(),
    ownerId: z.string(),
  })),
  pagination: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
    hasMore: z.boolean(),
  }),
  appliedFilters: z.object({
    query: z.string().optional(),
    tags: z.array(z.string()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    ownerId: z.string().optional(),
  }),
});

/**
 * Type for search response
 */
export type SearchDocumentsResponse = z.infer<typeof searchDocumentsResponseSchema>;
