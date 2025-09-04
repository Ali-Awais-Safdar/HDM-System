import { Request, Response } from "express";
import { CreateDocumentUseCase } from "../../../application/use-cases/create-document.use-case";
import { UpdateDocumentMetadataUseCase } from "../../../application/use-cases/update-document-metadata.use-case";
import { DeleteDocumentUseCase } from "../../../application/use-cases/delete-document.use-case";
import { GetDocumentUseCase } from "../../../application/use-cases/get-document.use-case";
import { FileUpload } from "../../../domain/value-objects/file-upload.vo";
import { PermissionRepository } from "../../../domain/services/permission.service";
import { 
  createDocumentSchema, 
  updateMetadataSchema, 
  documentParamsSchema
} from "../schemas/document.schema";
import { handleValidationError, sendErr, sendOk } from "../errors";
import { logger } from "../../../shared/logging/logger";
import { asDocumentId } from "../../../shared/types/brand";

/**
 * Document controller handling CRUD operations.
 * Follows clean architecture principles with proper error handling and validation.
 */
export class DocumentController {
  constructor(
    private readonly createDocumentUseCase: CreateDocumentUseCase,
    private readonly updateDocumentMetadataUseCase: UpdateDocumentMetadataUseCase,
    private readonly deleteDocumentUseCase: DeleteDocumentUseCase,
    private readonly getDocumentUseCase: GetDocumentUseCase,
    private readonly permissionRepository: PermissionRepository
  ) {}

  /**
   * Helper method to fetch user permissions for a document.
   * Returns empty array if no permissions found or on error.
   */
  private async getUserPermissions(documentId: string, userId: string) {
    try {
      const result = await this.permissionRepository.findByDocumentAndUser(
        asDocumentId(documentId),
        userId as any
      );
      return result.ok && result.value ? [result.value] : [];
    } catch (error) {
      logger.warn({
        documentId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, "Failed to fetch user permissions, defaulting to empty array");
      return [];
    }
  }

  async createDocument(req: Request, res: Response): Promise<void> {
    try {
      // Ensure user is authenticated
      if (!req.user) {
        logger.warn({
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          correlationId: req.correlationId
        }, "Document creation attempted without authentication");
        sendErr(res, new Error("Authentication required"), "Authentication required", "UNAUTHORIZED");
        return;
      }

      // Validate file upload
      if (!req.file) {
        logger.warn({
          userId: req.user.id,
          ip: req.ip,
          correlationId: req.correlationId
        }, "Document creation attempted without file");
        sendErr(res, new Error("File upload is required"), "File upload is required", "MISSING_FILE");
        return;
      }

      // Validate file data using FileUpload value object
      let fileUpload;
      try {
        fileUpload = FileUpload.create(
          req.file.originalname,
          req.file.mimetype,
          req.file.size,
          req.file.buffer
        );
      } catch (error) {
        logger.warn({
          userId: req.user.id,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          error: error instanceof Error ? error.message : 'Unknown error',
          correlationId: req.correlationId
        }, "Invalid file upload in document creation");
        sendErr(res, error, "Invalid file upload", "INVALID_FILE");
        return;
      }

      // Validate request body (handles JSON parsing automatically via transforms)
      const bodyValidation = createDocumentSchema.safeParse(req.body);
      if (!bodyValidation.success) {
        logger.warn({
          userId: req.user.id,
          errors: bodyValidation.error.issues,
          correlationId: req.correlationId
        }, "Document creation validation failed");
        handleValidationError(res, bodyValidation.error);
        return;
      }

      const validatedData = bodyValidation.data;

      logger.info({
        userId: req.user.id,
        title: validatedData.title,
        fileSize: fileUpload.size,
        mimeType: fileUpload.mimeType,
        tagCount: validatedData.tags?.length || 0,
        correlationId: req.correlationId
      }, "Starting document creation");

      // Execute use case
      const result = await this.createDocumentUseCase.execute({
        title: validatedData.title,
        file: {
          originalName: fileUpload.originalName,
          mimeType: fileUpload.mimeType,
          size: fileUpload.size,
          data: fileUpload.data
        },
        metadata: validatedData.metadata,
        tags: validatedData.tags,
        ownerId: req.user.id
      });

      if (!result.ok) {
        logger.warn({
          userId: req.user.id,
          title: validatedData.title,
          error: result.error.message,
          correlationId: req.correlationId
        }, "Document creation failed");
        sendErr(res, result.error, result.error.message);
        return;
      }

      logger.info({
        userId: req.user.id,
        documentId: result.value.id,
        title: result.value.title,
        fileSize: result.value.size,
        correlationId: req.correlationId
      }, "Document created successfully");

      sendOk(res, result.value, 201);

    } catch (error) {
      logger.error({
        userId: req.user?.id,
        error: error instanceof Error ? error.message : String(error),
        correlationId: req.correlationId
      }, "Unexpected error in document creation");
      sendErr(res, error);
    }
  }

  async getDocument(req: Request, res: Response): Promise<void> {
    try {
      // Ensure user is authenticated
      if (!req.user) {
        logger.warn({
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          correlationId: req.correlationId
        }, "Document retrieval attempted without authentication");
        res.status(401).json({
          error: "Authentication required",
          code: "UNAUTHORIZED"
        });
        return;
      }

      // Validate parameters
      const paramsValidation = documentParamsSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        logger.warn({
          userId: req.user.id,
          errors: paramsValidation.error.issues,
          correlationId: req.correlationId
        }, "Invalid document ID parameter in getDocument");
        res.status(422).json({
          error: "Invalid document ID",
          code: "INVALID_PARAMS",
          details: paramsValidation.error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message
          }))
        });
        return;
      }

      const { id } = paramsValidation.data;

      logger.info({
        userId: req.user.id,
        documentId: id,
        correlationId: req.correlationId
      }, "Starting document retrieval");

      // Fetch user permissions for the document
      const userPermissions = await this.getUserPermissions(id, req.user.id);

      // Execute use case
      const result = await this.getDocumentUseCase.execute({
        documentId: id,
        userId: req.user.id,
        userRole: req.user.role,
        userPermissions
      });

      if (!result.ok) {
        logger.warn({
          userId: req.user.id,
          documentId: id,
          error: result.error.message,
          correlationId: req.correlationId
        }, "Document retrieval failed");
        sendErr(res, result.error, result.error.message);
        return;
      }

      logger.info({
        userId: req.user.id,
        documentId: result.value.id,
        title: result.value.title,
        correlationId: req.correlationId
      }, "Document retrieved successfully");

      sendOk(res, result.value, 200);

    } catch (error) {
      logger.error({
        userId: req.user?.id,
        documentId: req.params.id,
        error: error instanceof Error ? error.message : String(error),
        correlationId: req.correlationId
      }, "Unexpected error in document retrieval");
      sendErr(res, error);
    }
  }

  async updateMetadata(req: Request, res: Response): Promise<void> {
    try {
      // Ensure user is authenticated
      if (!req.user) {
        logger.warn({
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          correlationId: req.correlationId
        }, "Document metadata update attempted without authentication");
        res.status(401).json({
          error: "Authentication required",
          code: "UNAUTHORIZED"
        });
        return;
      }

      // Validate parameters
      const paramsValidation = documentParamsSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        logger.warn({
          userId: req.user.id,
          errors: paramsValidation.error.issues,
          correlationId: req.correlationId
        }, "Invalid document ID parameter in updateMetadata");
        res.status(422).json({
          error: "Invalid document ID",
          code: "INVALID_PARAMS",
          details: paramsValidation.error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message
          }))
        });
        return;
      }

      // Validate request body
      const bodyValidation = updateMetadataSchema.safeParse(req.body);
      if (!bodyValidation.success) {
        logger.warn({
          userId: req.user.id,
          documentId: req.params.id,
          errors: bodyValidation.error.issues,
          correlationId: req.correlationId
        }, "Document metadata update validation failed");
        res.status(422).json({
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details: bodyValidation.error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message
          }))
        });
        return;
      }

      const { id } = paramsValidation.data;
      const { metadata } = bodyValidation.data;

      logger.info({
        userId: req.user.id,
        documentId: id,
        metadataKeys: Object.keys(metadata),
        correlationId: req.correlationId
      }, "Starting document metadata update");

      // Fetch user permissions for the document
      const userPermissions = await this.getUserPermissions(id, req.user.id);

      // Execute use case
      const result = await this.updateDocumentMetadataUseCase.execute({
        documentId: id,
        userId: req.user.id,
        userRole: req.user.role,
        metadata,
        userPermissions
      });

      if (!result.ok) {
        logger.warn({
          userId: req.user.id,
          documentId: id,
          error: result.error.message,
          correlationId: req.correlationId
        }, "Document metadata update failed");
        sendErr(res, result.error, result.error.message);
        return;
      }

      logger.info({
        userId: req.user.id,
        documentId: result.value.id,
        title: result.value.title,
        metadataKeys: Object.keys(result.value.metadata),
        correlationId: req.correlationId
      }, "Document metadata updated successfully");

      sendOk(res, result.value, 200);

    } catch (error) {
      logger.error({
        userId: req.user?.id,
        documentId: req.params.id,
        error: error instanceof Error ? error.message : String(error),
        correlationId: req.correlationId
      }, "Unexpected error in document metadata update");
      sendErr(res, error);
    }
  }

  async deleteDocument(req: Request, res: Response): Promise<void> {
    try {
      // Ensure user is authenticated
      if (!req.user) {
        logger.warn({
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          correlationId: req.correlationId
        }, "Document deletion attempted without authentication");
        res.status(401).json({
          error: "Authentication required",
          code: "UNAUTHORIZED"
        });
        return;
      }

      // Validate parameters
      const paramsValidation = documentParamsSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        logger.warn({
          userId: req.user.id,
          errors: paramsValidation.error.issues,
          correlationId: req.correlationId
        }, "Invalid document ID parameter in deleteDocument");
        res.status(422).json({
          error: "Invalid document ID",
          code: "INVALID_PARAMS",
          details: paramsValidation.error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message
          }))
        });
        return;
      }

      const { id } = paramsValidation.data;

      logger.info({
        userId: req.user.id,
        documentId: id,
        correlationId: req.correlationId
      }, "Starting document deletion");

      // Fetch user permissions for the document
      const userPermissions = await this.getUserPermissions(id, req.user.id);

      // Execute use case
      const result = await this.deleteDocumentUseCase.execute({
        documentId: id,
        userId: req.user.id,
        userRole: req.user.role,
        userPermissions
      });

      if (!result.ok) {
        logger.warn({
          userId: req.user.id,
          documentId: id,
          error: result.error.message,
          correlationId: req.correlationId
        }, "Document deletion failed");
        sendErr(res, result.error, result.error.message);
        return;
      }

      logger.info({
        userId: req.user.id,
        documentId: id,
        correlationId: req.correlationId
      }, "Document deleted successfully");

      sendOk(res, result.value, 200);

    } catch (error) {
      logger.error({
        userId: req.user?.id,
        documentId: req.params.id,
        error: error instanceof Error ? error.message : String(error),
        correlationId: req.correlationId
      }, "Unexpected error in document deletion");
      sendErr(res, error);
    }
  }

}
