import { Router } from "express";
import { DownloadController } from "../controllers/download.controller";
import { GenerateDownloadLinkUseCase } from "../../../application/use-cases/generate-download-link.use-case";
import { DownloadDocumentUseCase } from "../../../application/use-cases/download-document.use-case";
import { DrizzleDocumentRepository } from "../../../infra/db/repositories/document.repository";
import { DrizzlePermissionRepository } from "../../../infra/db/repositories/permission.repository";
import { DrizzleDownloadTokenRepository } from "../../../infra/db/repositories/download-token.repository";
import { LocalFileStorage } from "../../../infra/storage/local-file-storage";
import { db } from "../../../lib/db/connection";

const publicDownloadRouter = Router();

// Infrastructure dependencies (reused from download.routes.ts)
const documentRepository = new DrizzleDocumentRepository(db);
const permissionRepository = new DrizzlePermissionRepository(db);
const downloadTokenRepository = new DrizzleDownloadTokenRepository(db);
const fileStorage = new LocalFileStorage('./storage');

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

// Routes

/**
 * GET /downloads/:token
 * Download a document using a secure token.
 * No authentication required - security is handled by the token itself.
 */
publicDownloadRouter.get(
  "/:token",
  downloadController.downloadDocument
);

export { publicDownloadRouter };
