import { Router } from "express";
import { SearchController } from "../controllers/search.controller";
import { SearchDocumentsUseCase } from "@application/workflow/search-documents.use-case";
import { DocumentDrizzleRepository as DrizzleDocumentRepository } from "@infra/repositories/document.repository";
import { db } from "@infra/services/db/connection";

/**
 * Search routes for document search functionality.
 * 
 * All routes require authentication (handled by middleware chain).
 * Users can only search documents they have access to (ownership + permissions).
 * Admins can search all documents.
 */

// Initialize dependencies
const documentRepository = new DrizzleDocumentRepository(db);
const searchDocumentsUseCase = new SearchDocumentsUseCase(documentRepository);
const searchController = new SearchController(searchDocumentsUseCase);

const router = Router();

/**
 * GET /search/documents
 * 
 * Advanced document search with multiple filter options:
 * - Text search in document titles (fuzzy matching with TRGM)
 * - Tag filtering (documents must have ALL specified tags)
 * - Metadata filtering (JSONB containment with @> operator)
 * - Pagination support
 * 
 * Query Parameters:
 * - query: string (optional) - Text to search in document titles
 * - tags: string (optional) - Comma-separated list of tag names
 * - metadata: string (optional) - JSON object for metadata filtering
 * - limit: number (optional, default: 20, max: 100) - Results per page
 * - offset: number (optional, default: 0) - Number of results to skip
 * 
 * Example:
 * GET /search/documents?query=report&tags=urgent,finance&limit=10&offset=0
 * GET /search/documents?metadata={"department":"finance","status":"active"}
 * 
 * Response:
 * {
 *   "documents": [...],
 *   "pagination": {
 *     "limit": 20,
 *     "offset": 0,
 *     "total": 15,
 *     "hasMore": false
 *   },
 *   "appliedFilters": {
 *     "query": "report",
 *     "tags": ["urgent", "finance"],
 *     "metadata": {"department": "finance"}
 *   }
 * }
 */
router.get("/documents", searchController.searchDocuments.bind(searchController));

export { router as searchRouter };
