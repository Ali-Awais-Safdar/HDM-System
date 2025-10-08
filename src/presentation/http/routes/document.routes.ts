import { Router } from "express";
import multer from "multer";
import { DocumentController } from "../controllers/document.controller";
import { PermissionController } from "../controllers/permission.controller";
import { CreateDocumentUseCase } from "../../../app/application/workflow/create-document.use-case";
import { UpdateDocumentMetadataUseCase } from "../../../app/application/workflow/update-document-metadata.use-case";
import { DeleteDocumentUseCase } from "../../../app/application/workflow/delete-document.use-case";
import { GetDocumentUseCase } from "../../../app/application/workflow/get-document.use-case";
import { ShareDocumentUseCase } from "../../../app/application/workflow/share-document.use-case";
import { RevokeDocumentAccessUseCase } from "../../../app/application/workflow/revoke-document-access.use-case";
import { GetDocumentPermissionsUseCase } from "../../../app/application/workflow/get-document-permissions.use-case";
import { GenerateDownloadLinkUseCase } from "../../../app/application/workflow/generate-download-link.use-case";
import { DownloadController } from "../controllers/download.controller";
import { DocumentService } from "../../../app/domain/services/document.service";
import { LocalFileStorage } from "../../../app/infra/services/local-file-storage";
import { DrizzleDocumentRepository } from "../../../app/infra/repositories/document.repository";
import { DrizzlePermissionRepository } from "../../../app/infra/repositories/access-policy.repository";
import { DrizzleDownloadTokenRepository } from "../../../app/infra/repositories/download-token.repository";
import { RequireAuth } from "../middleware/jwt-mw";
import { requireAnyRole } from "../middleware/rbac-mw";
import { db } from "../../../app/infra/services/db/connection";

/**
 * Document routes factory with complete dependency injection.
 * Sets up file upload handling and authentication middleware.
 */
export function createDocumentRoutes(): Router {
  const router = Router();

  // Configure multer for file uploads
  const upload = multer({
    storage: multer.memoryStorage(), // Store files in memory for processing
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB limit
      files: 1 // Only one file per request
    },
    fileFilter: (_req, file, cb) => {
      // Basic MIME type validation (more validation in domain layer)
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg',
        'image/png',
        'image/gif',
        'text/plain',
        'text/csv',
        'application/json'
      ];

      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`File type ${file.mimetype} is not allowed`));
      }
    }
  });

  // Infrastructure dependencies
  const fileStorage = new LocalFileStorage();
  const documentRepository = new DrizzleDocumentRepository(db);
  const permissionRepository = new DrizzlePermissionRepository(db);
  const downloadTokenRepository = new DrizzleDownloadTokenRepository(db);

  // Domain services
  const documentService = new DocumentService(documentRepository, fileStorage);

  // Application use cases
  const createDocumentUseCase = new CreateDocumentUseCase(documentService);
  const updateDocumentMetadataUseCase = new UpdateDocumentMetadataUseCase(documentService);
  const deleteDocumentUseCase = new DeleteDocumentUseCase(documentService);
  const getDocumentUseCase = new GetDocumentUseCase(documentService);
  
  // Permission use cases
  const shareDocumentUseCase = new ShareDocumentUseCase(documentRepository, permissionRepository);
  const revokeDocumentAccessUseCase = new RevokeDocumentAccessUseCase(documentRepository, permissionRepository);
  const getDocumentPermissionsUseCase = new GetDocumentPermissionsUseCase(documentRepository, permissionRepository);
  
  // Download use cases
  const generateDownloadLinkUseCase = new GenerateDownloadLinkUseCase(documentRepository, permissionRepository, downloadTokenRepository);

  // Controllers
  const documentController = new DocumentController(
    createDocumentUseCase,
    updateDocumentMetadataUseCase,
    deleteDocumentUseCase,
    getDocumentUseCase,
    permissionRepository
  );

  const permissionController = new PermissionController(
    shareDocumentUseCase,
    revokeDocumentAccessUseCase,
    getDocumentPermissionsUseCase
  );

  const downloadController = new DownloadController(
    generateDownloadLinkUseCase,
    null as any // We don't need downloadDocumentUseCase here since it's in public routes
  );

  // Middleware chain for authentication
  const requireAuth = new RequireAuth();
  const requireUserRole = requireAnyRole();

  // Routes with authentication and authorization
  router.post(
    "/",
    requireAuth.handle.bind(requireAuth),
    requireUserRole.handle.bind(requireUserRole),
    upload.single('file'), // Expect file field named 'file'
    documentController.createDocument.bind(documentController)
  );

  router.get(
    "/:id",
    requireAuth.handle.bind(requireAuth),
    requireUserRole.handle.bind(requireUserRole),
    documentController.getDocument.bind(documentController)
  );

  router.patch(
    "/:id/metadata",
    requireAuth.handle.bind(requireAuth),
    requireUserRole.handle.bind(requireUserRole),
    documentController.updateMetadata.bind(documentController)
  );

  router.delete(
    "/:id",
    requireAuth.handle.bind(requireAuth),
    requireUserRole.handle.bind(requireUserRole),
    documentController.deleteDocument.bind(documentController)
  );

  // Permission routes
  router.post(
    "/:id/share",
    requireAuth.handle.bind(requireAuth),
    requireUserRole.handle.bind(requireUserRole),
    permissionController.shareDocument.bind(permissionController)
  );

  router.delete(
    "/:id/share",
    requireAuth.handle.bind(requireAuth),
    requireUserRole.handle.bind(requireUserRole),
    permissionController.revokeDocumentAccess.bind(permissionController)
  );

  router.get(
    "/:id/permissions",
    requireAuth.handle.bind(requireAuth),
    requireUserRole.handle.bind(requireUserRole),
    permissionController.getDocumentPermissions.bind(permissionController)
  );

  // Download routes
  router.post(
    "/:id/download-link",
    requireAuth.handle.bind(requireAuth),
    requireUserRole.handle.bind(requireUserRole),
    downloadController.generateDownloadLink.bind(downloadController)
  );

  // Error handling middleware for multer
  router.use((error: any, _req: any, res: any, next: any) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: 'File too large. Maximum size is 50MB.',
          code: 'FILE_TOO_LARGE'
        });
      }
      if (error.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          error: 'Too many files. Only one file is allowed.',
          code: 'TOO_MANY_FILES'
        });
      }
      return res.status(400).json({
        error: `File upload error: ${error.message}`,
        code: 'UPLOAD_ERROR'
      });
    }

    if (error.message && error.message.includes('File type')) {
      return res.status(415).json({
        error: error.message,
        code: 'UNSUPPORTED_FILE_TYPE'
      });
    }

    next(error);
  });

  return router;
}

export const documentRouter = createDocumentRoutes();
