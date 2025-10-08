import { Router } from "express";
import { DownloadController } from "../controllers/download.controller";
import { GenerateDownloadLinkUseCase } from "@application/workflow/generate-download-link.use-case";
import { DownloadDocumentUseCase } from "@application/workflow/download-document.use-case";
import { DocumentDrizzleRepository as DrizzleDocumentRepository } from "@infra/repositories/document.repository";
import { AccessPolicyDrizzleRepository as DrizzlePermissionRepository } from "@infra/repositories/access-policy.repository";
import { DownloadTokenDrizzleRepository as DrizzleDownloadTokenRepository } from "@infra/repositories/download-token.repository";
import { LocalFileStorage } from "@infra/services/local-file-storage";
import { db } from "@infra/services/db/connection";

const publicDownloadRouter = Router();

// Infrastructure dependencies (reused from download.routes.ts)
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
