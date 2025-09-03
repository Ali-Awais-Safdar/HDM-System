import { Result, ok, err } from "../../shared/result/result";
// DocumentId is used in the interface types
import { Document } from "../../domain/entities/document.entity";
import { 
  DownloadTokenService, 
  DownloadTokenRepository 
} from "../../domain/services/download-token.service";
import { DocumentRepository, FileStorage } from "../../domain/services/document.service";

/**
 * Use case for downloading documents using secure tokens.
 * Handles token validation, consumption, and file retrieval.
 */
export class DownloadDocumentUseCase {
  private readonly downloadTokenService: DownloadTokenService;

  constructor(
    private readonly documentRepository: DocumentRepository,
    downloadTokenRepository: DownloadTokenRepository,
    private readonly fileStorage: FileStorage
  ) {
    this.downloadTokenService = new DownloadTokenService(downloadTokenRepository);
  }

  async execute(
    params: DownloadDocumentParams
  ): Promise<Result<DownloadDocumentResponse, DownloadDocumentError>> {
    try {
      // 1. Validate and consume the download token
      const tokenResult = await this.downloadTokenService.consumeDownloadToken(params.token);
      
      if (!tokenResult.ok) {
        return err(new DownloadDocumentError(
          tokenResult.error.message,
          this.mapTokenErrorCode(tokenResult.error.code),
          tokenResult.error
        ));
      }

      const token = tokenResult.value;

      // 2. Get the document
      const documentResult = await this.documentRepository.findById(token.documentId);
      if (!documentResult.ok) {
        return err(new DownloadDocumentError(
          "Failed to find document",
          "DOCUMENT_NOT_FOUND"
        ));
      }

      if (!documentResult.value) {
        return err(new DownloadDocumentError(
          "Document not found",
          "DOCUMENT_NOT_FOUND"
        ));
      }

      const document = documentResult.value;

      // 3. Retrieve the file from storage
      const fileResult = await this.fileStorage.retrieve(document.storageKey);
      if (!fileResult.ok) {
        return err(new DownloadDocumentError(
          "Failed to retrieve file from storage",
          "FILE_RETRIEVAL_FAILED",
          fileResult.error
        ));
      }

      const fileData = fileResult.value;

      return ok({
        document,
        fileData,
        token: token.token,
        downloadedAt: new Date(),
        message: "Document downloaded successfully",
      });

    } catch (error) {
      return err(new DownloadDocumentError(
        "Unexpected error during document download",
        "UNKNOWN_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  /**
   * Maps download token service error codes to download document error codes.
   */
  private mapTokenErrorCode(tokenErrorCode: string): DownloadDocumentErrorCode {
    switch (tokenErrorCode) {
      case "TOKEN_NOT_FOUND":
        return "INVALID_TOKEN";
      case "TOKEN_EXPIRED":
        return "TOKEN_EXPIRED";
      case "TOKEN_ALREADY_USED":
        return "TOKEN_ALREADY_USED";
      case "REPOSITORY_ERROR":
        return "TOKEN_VALIDATION_FAILED";
      default:
        return "TOKEN_VALIDATION_FAILED";
    }
  }
}

/**
 * Parameters for downloading a document.
 */
export interface DownloadDocumentParams {
  /** The secure download token */
  token: string;
}

/**
 * Response from downloading a document.
 */
export interface DownloadDocumentResponse {
  /** The document metadata */
  document: Document;
  /** The file data as a buffer */
  fileData: Buffer;
  /** The token that was used (for logging) */
  token: string;
  /** When the download occurred */
  downloadedAt: Date;
  /** Success message */
  message: string;
}

/**
 * Error class for document download operations.
 */
export class DownloadDocumentError extends Error {
  constructor(
    message: string,
    public readonly code: DownloadDocumentErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "DownloadDocumentError";
  }
}

export type DownloadDocumentErrorCode =
  | "INVALID_TOKEN"
  | "TOKEN_EXPIRED"
  | "TOKEN_ALREADY_USED"
  | "TOKEN_VALIDATION_FAILED"
  | "DOCUMENT_NOT_FOUND"
  | "FILE_RETRIEVAL_FAILED"
  | "UNKNOWN_ERROR";
