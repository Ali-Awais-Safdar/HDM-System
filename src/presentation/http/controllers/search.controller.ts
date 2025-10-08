import { Request, Response } from "express";
import { SearchDocumentsUseCase, SearchDocumentsParams } from "/workflow/search-documents.use-case";
import { searchDocumentsSchema } from "../schemas/search.schema";
import { logger } from "../../../shared/logging/logger";
import { handleValidationError, sendErr, sendOk } from "../errors";
import { Option } from "effect";

/**
 * Controller for document search operations.
 * Handles HTTP requests for advanced document search with pagination.
 */
export class SearchController {
  constructor(
    private readonly searchDocumentsUseCase: SearchDocumentsUseCase
  ) {}

  /**
   * GET /search/documents
   * 
   * Advanced document search with support for:
   * - Text search in titles (with fuzzy matching)
   * - Tag filtering (AND operation)
   * - Metadata filtering (JSONB containment)
   * - Pagination
   * 
   * Query parameters:
   * - query: string (optional) - Text to search in document titles
   * - tags: string[] (optional) - Array of tag names (comma-separated)
   * - metadata: object (optional) - Metadata filters as JSON
   * - limit: number (optional, default: 20, max: 100) - Results per page
   * - offset: number (optional, default: 0) - Number of results to skip
   */
  async searchDocuments(req: Request, res: Response): Promise<void> {
    try {
      // Parse and validate query parameters
      const validationResult = searchDocumentsSchema.safeParse({
        ...req.query,
        // Parse comma-separated tags
        tags: req.query.tags ? String(req.query.tags).split(',').map(t => t.trim()).filter(t => t.length > 0) : undefined,
        // Parse JSON metadata if provided
        metadata: req.query.metadata ? JSON.parse(String(req.query.metadata)) : undefined,
      });

      if (!validationResult.success) {
        handleValidationError(res, validationResult.error);
        return;
      }

      const searchParams: SearchDocumentsParams = {
        limit: validationResult.data.limit,
        offset: validationResult.data.offset,
        ...(validationResult.data.query && { query: validationResult.data.query }),
        ...(validationResult.data.tags && { tags: validationResult.data.tags }),
        ...(validationResult.data.metadata && { metadata: validationResult.data.metadata }),
      };

      // Get user context from middleware
      const userId = req.user?.id;
      const userRole = req.user?.role;

      if (!userId || !userRole) {
        sendErr(res, new Error("Authentication required"), "Authentication required", "UNAUTHORIZED");
        return;
      }

      // Execute search
      const result = await this.searchDocumentsUseCase.execute(
        userId,
        userRole,
        searchParams
      );

      if (!result.ok) {
        logger.warn("Search failed", {
          userId: userId,
          searchParams: searchParams,
          error: result.error.message
        } as any);

        sendErr(res, result.error, result.error.message);
        return;
      }

      // Transform response to match API contract
      const response = {
        documents: result.value.documents.map(doc => ({
          id: doc.id,
          title: doc.title,
          mimeType: doc.mimeType,
          size: doc.size,
          metadata: doc.metadata,
          tags: doc.tags,
          createdAt: doc.createdAt.toISOString(),
          updatedAt: Option.match(doc.updatedAt, {
            onNone: () => null,
            onSome: (date) => date.toISOString()
          }),
          ownerId: doc.ownerId,
        })),
        pagination: result.value.pagination,
        appliedFilters: {
          ...result.value.appliedFilters,
          ownerId: result.value.appliedFilters.ownerId || undefined, // Don't expose internal user filtering
        }
      };

      logger.info("Document search completed", {
        userId: userId,
        searchParams: searchParams,
        resultCount: response.documents.length,
        hasMore: response.pagination.hasMore
      } as any);

      sendOk(res, response, 200);
    } catch (error) {
      logger.error("Unexpected error in search", {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id,
        query: req.query
      } as any);

      if (error instanceof SyntaxError) {
        sendErr(res, error, "Invalid JSON in metadata parameter", "BAD_REQUEST");
      } else {
        sendErr(res, error);
      }
    }
  }
}
