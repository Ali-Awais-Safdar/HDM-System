import { Router } from "express";
import { DownloadController } from "../controllers/download.controller";
import { GenerateDownloadLinkUseCase } from "../../../application/use-cases/generate-download-link.use-case";
import { DownloadDocumentUseCase } from "../../../application/use-cases/download-document.use-case";
import { DrizzleDocumentRepository } from "../../../infra/db/repositories/document.repository";
import { DrizzlePermissionRepository } from "../../../infra/db/repositories/permission.repository";
import { DrizzleDownloadTokenRepository } from "../../../infra/db/repositories/download-token.repository";
import { LocalFileStorage } from "../../../infra/storage/local-file-storage";
import { db } from "../../../lib/db/connection";
import { requireAnyRole } from "../../../http/middleware/rbac-mw";
import { RequireAuth } from "../../../http/middleware/jwt-mw";

const downloadRouter = Router();

// Infrastructure dependencies
const documentRepository = new DrizzleDocumentRepository(db);
const permissionRepository = new DrizzlePermissionRepository(db);
const downloadTokenRepository = new DrizzleDownloadTokenRepository(db);
const fileStorage = new LocalFileStorage();

// Use cases
const generateDownloadLinkUseCase = new GenerateDownloadLinkUseCase(
  documentRepository,
  permissionRepository,
  downloadTokenRepository
);

const downloadDocumentUseCase = new DownloadDocumentUseCase(
  documentRepository,
  downloadTokenRepository,
  fileStorage
);

// Controller
const downloadController = new DownloadController(
  generateDownloadLinkUseCase,
  downloadDocumentUseCase
);

// Middleware for authentication and authorization
const requireAuth = new RequireAuth();
const requireUserRole = requireAnyRole();

// Routes

/**
 * POST /documents/:id/download-link
 * Generate a secure, short-lived download link for a document.
 * Requires authentication and read access to the document.
 */
downloadRouter.post(
  "/:id/download-link",
  requireAuth.handle.bind(requireAuth),
  requireUserRole.handle.bind(requireUserRole),
  downloadController.generateDownloadLink
);

export { downloadRouter };
