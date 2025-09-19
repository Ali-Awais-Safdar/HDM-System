import { DocumentRepository, DocumentSearchFilters } from "../../domain/services/document.service";
import { Document } from "../../domain/entities/document.entity";
import { UserId, asUserId } from "../../shared/types/brand";
import { UserRole } from "../../domain/entities/user.entity";
import { Result, ok, err } from "../../shared/result/result";

/**
 * Search Documents Use Case
 * 
 * Handles advanced document search with:
 * - Text search (title and content)
 * - Tag filtering (many-to-many)
 * - Metadata filtering (JSONB containment)
 * - Pagination
 * - Permission-based filtering (user can only see documents they have access to)
 */
export class SearchDocumentsUseCase {
  constructor(
    private readonly documentRepository: DocumentRepository
  ) {}

  async execute(
    userId: string,
    userRole: UserRole,
    searchParams: SearchDocumentsParams
  ): Promise<Result<SearchDocumentsResponse, SearchDocumentsError>> {
    try {
      // Convert and validate input
      const userIdBrand = asUserId(userId);
      
      // Build search filters
      const filters: DocumentSearchFilters = {
        limit: Math.min(searchParams.limit || 20, 100), // Cap at 100
        offset: Math.max(searchParams.offset || 0, 0)
      };
      
      // Only add optional properties if they have values
      const trimmedQuery = searchParams.query?.trim();
      if (trimmedQuery) {
        filters.query = trimmedQuery;
      }
      
      const validTags = searchParams.tags?.filter(tag => tag.trim().length > 0);
      if (validTags && validTags.length > 0) {
        filters.tags = validTags;
      }
      
      if (searchParams.metadata) {
        filters.metadata = searchParams.metadata;
      }

      // For regular users, restrict to their own documents
      // Admins can search all documents
      if (userRole === "user") {
        filters.ownerId = userIdBrand;
      }

      // Execute search
      const searchResult = await this.documentRepository.search(filters);
      
      if (!searchResult.ok) {
        return err(new SearchDocumentsError("Failed to search documents", "SEARCH_FAILED"));
      }

      // Build response
      const response: SearchDocumentsResponse = {
        documents: searchResult.value,
        pagination: {
          limit: filters.limit!,
          offset: filters.offset!,
          total: searchResult.value.length, // Note: This is not the total count, just current page count
          hasMore: searchResult.value.length === filters.limit
        },
        appliedFilters: {
          ...(filters.query !== undefined && { query: filters.query }),
          ...(filters.tags !== undefined && { tags: filters.tags }),
          ...(filters.metadata !== undefined && { metadata: filters.metadata }),
          ...(filters.ownerId !== undefined && { ownerId: filters.ownerId })
        }
      };

      return ok(response);
    } catch {
      return err(new SearchDocumentsError("Unexpected error during search", "INTERNAL_ERROR"));
    }
  }
}

/**
 * Search parameters from the client
 */
export interface SearchDocumentsParams {
  /** Text query to search in document titles and content */
  query?: string;
  
  /** Array of tag names to filter by (documents must have ALL specified tags) */
  tags?: string[];
  
  /** Metadata object to filter by (uses JSONB containment @>) */
  metadata?: Record<string, unknown>;
  
  /** Maximum number of results to return (default: 20, max: 100) */
  limit?: number;
  
  /** Number of results to skip for pagination (default: 0) */
  offset?: number;
}

/**
 * Search response with results and pagination info
 */
export interface SearchDocumentsResponse {
  /** Array of documents matching the search criteria */
  documents: Document[];
  
  /** Pagination information */
  pagination: {
    limit: number;
    offset: number;
    total: number; // Note: This is current page count, not total available
    hasMore: boolean;
  };
  
  /** The filters that were actually applied */
  appliedFilters: {
    query?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
    ownerId?: UserId;
  };
}

/**
 * Search-specific error class
 */
export class SearchDocumentsError extends Error {
  constructor(
    message: string,
    public readonly code: "SEARCH_FAILED" | "INVALID_PARAMS" | "INTERNAL_ERROR"
  ) {
    super(message);
    this.name = "SearchDocumentsError";
  }
}
