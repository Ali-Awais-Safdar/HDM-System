import { z } from "zod";
import { searchDocumentsSchema } from "./common";

// Re-export the canonical search schema from common
export { searchDocumentsSchema } from "./common";

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
