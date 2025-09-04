import { Request, Response } from "express";
import { CreateDocumentUseCase } from "../../../application/use-cases/create-document.use-case";
import { UpdateDocumentMetadataUseCase } from "../../../application/use-cases/update-document-metadata.use-case";
import { DeleteDocumentUseCase } from "../../../application/use-cases/delete-document.use-case";
import { GetDocumentUseCase } from "../../../application/use-cases/get-document.use-case";
import { FileUpload } from "../../../domain/value-objects/file-upload.vo";
import { 
  createDocumentSchema, 
  updateMetadataSchema, 
  documentParamsSchema
} from "../schemas/document.schema";
import { handleValidationError, sendErr, sendOk } from "../errors";

/**
 * Document controller handling CRUD operations.
 * Follows clean architecture principles with proper error handling and validation.
 */
export class DocumentController {
  constructor(
    private readonly createDocumentUseCase: CreateDocumentUseCase,
    private readonly updateDocumentMetadataUseCase: UpdateDocumentMetadataUseCase,
    private readonly deleteDocumentUseCase: DeleteDocumentUseCase,
    private readonly getDocumentUseCase: GetDocumentUseCase
  ) {}

  async createDocument(req: Request, res: Response): Promise<void> {
    try {
      // Ensure user is authenticated
      if (!req.user) {
        sendErr(res, new Error("Authentication required"), "Authentication required", "UNAUTHORIZED");
        return;
      }

      // Validate file upload
      if (!req.file) {
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
        sendErr(res, error, "Invalid file upload", "INVALID_FILE");
        return;
      }

      // Validate request body (handles JSON parsing automatically via transforms)
      const bodyValidation = createDocumentSchema.safeParse(req.body);
      if (!bodyValidation.success) {
        handleValidationError(res, bodyValidation.error);
        return;
      }

      const validatedData = bodyValidation.data;

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
        sendErr(res, result.error, result.error.message);
        return;
      }

      sendOk(res, result.value, 201);

    } catch (error) {
      sendErr(res, error);
    }
  }

  async getDocument(req: Request, res: Response): Promise<void> {
    try {
      // Ensure user is authenticated
      if (!req.user) {
        res.status(401).json({
          error: "Authentication required",
          code: "UNAUTHORIZED"
        });
        return;
      }

      // Validate parameters
      const paramsValidation = documentParamsSchema.safeParse(req.params);
      if (!paramsValidation.success) {
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

      // Execute use case
      const result = await this.getDocumentUseCase.execute({
        documentId: id,
        userId: req.user.id,
        userRole: req.user.role
        // TODO: Add directPermission from permission service
      });

      if (!result.ok) {
        sendErr(res, result.error, result.error.message);
        return;
      }

      sendOk(res, result.value, 200);

    } catch (error) {
      sendErr(res, error);
    }
  }

  async updateMetadata(req: Request, res: Response): Promise<void> {
    try {
      // Ensure user is authenticated
      if (!req.user) {
        res.status(401).json({
          error: "Authentication required",
          code: "UNAUTHORIZED"
        });
        return;
      }

      // Validate parameters
      const paramsValidation = documentParamsSchema.safeParse(req.params);
      if (!paramsValidation.success) {
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

      // Execute use case
      const result = await this.updateDocumentMetadataUseCase.execute({
        documentId: id,
        userId: req.user.id,
        userRole: req.user.role,
        metadata
        // TODO: Add directPermission from permission service
      });

      if (!result.ok) {
        sendErr(res, result.error, result.error.message);
        return;
      }

      sendOk(res, result.value, 200);

    } catch (error) {
      sendErr(res, error);
    }
  }

  async deleteDocument(req: Request, res: Response): Promise<void> {
    try {
      // Ensure user is authenticated
      if (!req.user) {
        res.status(401).json({
          error: "Authentication required",
          code: "UNAUTHORIZED"
        });
        return;
      }

      // Validate parameters
      const paramsValidation = documentParamsSchema.safeParse(req.params);
      if (!paramsValidation.success) {
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

      // Execute use case
      const result = await this.deleteDocumentUseCase.execute({
        documentId: id,
        userId: req.user.id,
        userRole: req.user.role
        // TODO: Add directPermission from permission service
      });

      if (!result.ok) {
        sendErr(res, result.error, result.error.message);
        return;
      }

      sendOk(res, result.value, 200);

    } catch (error) {
      sendErr(res, error);
    }
  }

}
