import { Router } from "express";
import multer from "multer";
import { DocumentController } from "../controllers/document.controller";
import { CreateDocumentUseCase } from "../../../application/use-cases/create-document.use-case";
import { UpdateDocumentMetadataUseCase } from "../../../application/use-cases/update-document-metadata.use-case";
import { DeleteDocumentUseCase } from "../../../application/use-cases/delete-document.use-case";
import { GetDocumentUseCase } from "../../../application/use-cases/get-document.use-case";
import { DocumentService } from "../../../domain/services/document.service";
import { LocalFileStorage } from "../../../infra/storage/local-file-storage";
import { DrizzleDocumentRepository } from "../../../infra/db/repositories/document.repository";
import { RequireAuth } from "../../../http/middleware/jwt-mw";
import { requireAnyRole } from "../../../http/middleware/rbac-mw";
import { db } from "../../../lib/db/connection";

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
  const fileStorage = new LocalFileStorage('./storage');
  const documentRepository = new DrizzleDocumentRepository(db);

  // Domain services
  const documentService = new DocumentService(documentRepository, fileStorage);

  // Application use cases
  const createDocumentUseCase = new CreateDocumentUseCase(documentService);
  const updateDocumentMetadataUseCase = new UpdateDocumentMetadataUseCase(documentService);
  const deleteDocumentUseCase = new DeleteDocumentUseCase(documentService);
  const getDocumentUseCase = new GetDocumentUseCase(documentService);

  // Controller
  const documentController = new DocumentController(
    createDocumentUseCase,
    updateDocumentMetadataUseCase,
    deleteDocumentUseCase,
    getDocumentUseCase
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
