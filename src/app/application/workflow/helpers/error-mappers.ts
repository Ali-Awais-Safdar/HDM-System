import { ParseResult } from "effect"
import { DocumentValidationError, DocumentNotFoundError } from "@domain/document/document.error"
import { DocumentVersionNotFoundError } from "@domain/documentVersion/document-version.error"
import { DownloadTokenValidationError, DownloadTokenNotFoundError, DownloadTokenAlreadyUsedError } from "@domain/downloadToken/download-token.error"
import { AccessPolicyValidationError, AccessPolicyNotFoundError, AccessPolicyConflictError } from "@domain/accessPolicy/access-policy.error"
import { ValidationError, DatabaseError, BusinessRuleViolationError } from "@domain/utils/base.errors"
import { 
  PermissionCheckError, 
  WorkflowError, 
  WorkflowDependencyError, 
  AccessPolicyCreationError,
  UploadInitiationError,
  UploadConfirmationError,
  ChecksumValidationError,
  FileNotFoundError
} from "@application/errors/application.errors"
import { FileStorageError } from "@application/services/ports/file-storage.port"

// ===== PERSISTENCE ERROR MAPPERS =====

export const mapDocumentPersistenceError = (
  source: "save" | "search" | "findById"
) => {
  return (error: unknown): WorkflowDependencyError => {
    if (error instanceof ValidationError) {
      return new WorkflowDependencyError(
        `Document persistence failed: ${error.message}`,
        "DocumentRepository",
        source,
        { originalError: error }
      )
    }
    if (error instanceof DatabaseError) {
      return new WorkflowDependencyError(
        `Database error during document ${source}: ${error.message}`,
        "Database",
        source,
        { originalError: error }
      )
    }
    // If it's already a WorkflowError, return as-is
    if (error instanceof PermissionCheckError || error instanceof WorkflowDependencyError) {
      return error as WorkflowDependencyError
    }
    return new WorkflowDependencyError(
      `Document ${source} failed: ${error instanceof Error ? error.message : String(error)}`,
      "DocumentRepository",
      source,
      { originalError: error }
    )
  }
}

export const mapDocumentVersionPersistenceError = (
  source: "save" | "findById" | "findByDocumentId" | "findLatestByDocumentId" | "findByDocumentIdAndChecksum"
) => {
  return (error: unknown): WorkflowDependencyError => {
    if (error instanceof ValidationError) {
      return new WorkflowDependencyError(
        `Document version persistence failed: ${error.message}`,
        "DocumentVersionRepository",
        source,
        { originalError: error }
      )
    }
    if (error instanceof DatabaseError) {
      return new WorkflowDependencyError(
        `Database error during document version ${source}: ${error.message}`,
        "Database",
        source,
        { originalError: error }
      )
    }
    if (error instanceof PermissionCheckError || error instanceof WorkflowDependencyError) {
      return error as WorkflowDependencyError
    }
    return new WorkflowDependencyError(
      `Document version ${source} failed: ${error instanceof Error ? error.message : String(error)}`,
      "DocumentVersionRepository",
      source,
      { originalError: error }
    )
  }
}

export const mapDocumentVersionError = (
  source: "findById" | "findByDocumentId" | "findLatestByDocumentId" | "getVersion"
) => {
  return (error: unknown): WorkflowDependencyError | PermissionCheckError => {
    // Handle domain errors
    if (error instanceof DocumentVersionNotFoundError) {
      return new WorkflowDependencyError(
        `Document version not found: ${error.message}`,
        "DocumentVersionRepository",
        source,
        { originalError: error }
      )
    }
    
    // Handle permission errors
    if (error instanceof PermissionCheckError) {
      return error
    }
    
    // Handle database errors
    if (error instanceof DatabaseError) {
      return new WorkflowDependencyError(
        `Database error during document version ${source}: ${error.message}`,
        "Database",
        source,
        { originalError: error }
      )
    }
    
    // Handle validation errors
    if (error instanceof ValidationError) {
      return new WorkflowDependencyError(
        `Document version validation failed: ${error.message}`,
        "DocumentVersionRepository",
        source,
        { originalError: error }
      )
    }
    
    // Already a workflow error
    if (error instanceof WorkflowDependencyError) {
      return error
    }
    
    // Generic error mapping
    return new WorkflowDependencyError(
      `Document version ${source} failed: ${error instanceof Error ? error.message : String(error)}`,
      "DocumentVersionRepository",
      source,
      { originalError: error }
    )
  }
}

// ===== DOMAIN ERROR MAPPERS =====

export const mapDocumentDomainError = (context: string) => {
  return (error: unknown): WorkflowError => {
    if (error instanceof DocumentValidationError) {
      return new WorkflowDependencyError(
        `Document ${context} failed: ${error.message}`,
        "DocumentEntity",
        context,
        { originalError: error }
      )
    }
    if (error instanceof BusinessRuleViolationError) {
      return new WorkflowDependencyError(
        `Document ${context} failed: ${error.message}`,
        "DocumentEntity",
        context,
        { originalError: error }
      )
    }
    if (error instanceof DocumentNotFoundError) {
      return new WorkflowDependencyError(
        `Document not found: ${error.message}`,
        "DocumentRepository",
        "findById",
        { originalError: error }
      )
    }
    if (error instanceof PermissionCheckError) {
      return error // Already a WorkflowError
    }
    if (error instanceof WorkflowDependencyError) {
      return error
    }
    return error as unknown as WorkflowError
  }
}

// ===== GENERIC ERROR MAPPERS =====

export const mapToWorkflowDependencyError = (
  component: string,
  operation: string
) => {
  return (error: unknown): WorkflowDependencyError => {
    if (error instanceof WorkflowDependencyError) {
      return error
    }
    return new WorkflowDependencyError(
      `${operation} failed: ${error instanceof Error ? error.message : String(error)}`,
      component,
      operation,
      { originalError: error }
    )
  }
}

// ===== DOWNLOAD TOKEN ERROR MAPPERS =====

export const mapDownloadTokenPersistenceError = (
  source: "save" | "findById" | "findByToken" | "findByDocumentId" | "markAsUsed" | "delete"
) => {
  return (error: unknown): WorkflowDependencyError => {
    if (error instanceof ValidationError) {
      return new WorkflowDependencyError(
        `Download token persistence failed: ${error.message}`,
        "DownloadTokenRepository",
        source,
        { originalError: error }
      )
    }
    if (error instanceof DatabaseError) {
      return new WorkflowDependencyError(
        `Database error during download token ${source}: ${error.message}`,
        "Database",
        source,
        { originalError: error }
      )
    }
    if (error instanceof PermissionCheckError || error instanceof WorkflowDependencyError) {
      return error as WorkflowDependencyError
    }
    return new WorkflowDependencyError(
      `Download token ${source} failed: ${error instanceof Error ? error.message : String(error)}`,
      "DownloadTokenRepository",
      source,
      { originalError: error }
    )
  }
}

export const mapDownloadTokenDomainError = (
  context: string,
  tokenValue: string
) => {
  return (error: unknown): DownloadTokenValidationError | WorkflowError => {
    // Handle already-used error
    if (error instanceof DownloadTokenAlreadyUsedError) {
      return new DownloadTokenValidationError(
        `Token already used: ${error.message}`,
        "token",
        tokenValue,
        { reason: "ALREADY_USED", originalError: error }
      )
    }
    
    // Handle business rule violations (expiry, user mismatch)
    if (error instanceof BusinessRuleViolationError) {
      // Detect expiry errors
      const isExpiryError = error.details?.rule === "TOKEN_EXPIRED" || 
                           (error.details && 'expiresAt' in error.details)
      if (isExpiryError) {
        return new DownloadTokenValidationError(
          `Token expired: ${error.message}`,
          "token",
          tokenValue,
          { reason: "EXPIRED", originalError: error }
        )
      }
      
      // Other business rule violations (e.g., user mismatch)
      return new DownloadTokenValidationError(
        `Token validation failed: ${error.message}`,
        "token",
        tokenValue,
        { reason: "INVALID", originalError: error }
      )
    }
    
    // Handle validation errors
    if (error instanceof DownloadTokenValidationError) {
      return error // Already has reason captured
    }
    
    // Handle not found errors
    if (error instanceof DownloadTokenNotFoundError) {
      return new DownloadTokenValidationError(
        `Token not found: ${error.message}`,
        "token",
        tokenValue,
        { reason: "NOT_FOUND", originalError: error }
      )
    }
    
    // Pass through permission errors
    if (error instanceof PermissionCheckError) {
      return error
    }
    
    // Pass through workflow errors
    if (error instanceof WorkflowDependencyError) {
      return error
    }
    
    // Generic error mapping
    return new WorkflowDependencyError(
      `Download token ${context} failed: ${error instanceof Error ? error.message : String(error)}`,
      "DownloadTokenEntity",
      context,
      { originalError: error }
    )
  }
}

// ===== ACCESS POLICY ERROR MAPPERS =====

export const mapAccessPolicyPersistenceError = (
  policy?: { resourceId: string; subjectId?: string | null; role?: string | null }
) => {
  return (error: unknown): AccessPolicyCreationError | WorkflowDependencyError => {
    // Handle conflict errors (duplicate policy)
    if (error instanceof AccessPolicyConflictError) {
      return new AccessPolicyCreationError(
        `Access policy already exists: ${error.message}`,
        policy?.resourceId || "unknown",
        policy?.subjectId || "unknown",
        policy?.role || "unknown",
        { originalError: error }
      )
    }
    
    // Handle validation errors
    if (error instanceof AccessPolicyValidationError) {
      return new AccessPolicyCreationError(
        `Access policy validation failed: ${error.message}`,
        policy?.resourceId || "unknown",
        policy?.subjectId || "unknown",
        policy?.role || "unknown",
        { originalError: error }
      )
    }
    
    if (error instanceof ValidationError) {
      return new AccessPolicyCreationError(
        `Access policy validation failed: ${error.message}`,
        policy?.resourceId || "unknown",
        policy?.subjectId || "unknown",
        policy?.role || "unknown",
        { originalError: error }
      )
    }
    
    // Handle database errors
    if (error instanceof DatabaseError) {
      return new WorkflowDependencyError(
        `Database error during access policy save: ${error.message}`,
        "AccessPolicyRepository",
        "save",
        { originalError: error }
      )
    }
    
    // Pass through workflow errors
    if (error instanceof WorkflowDependencyError) {
      return error
    }
    
    // Generic error
    return new AccessPolicyCreationError(
      `Failed to save access policy: ${error instanceof Error ? error.message : String(error)}`,
      policy?.resourceId || "unknown",
      policy?.subjectId || "unknown",
      policy?.role || "unknown",
      { originalError: error }
    )
  }
}

export const mapAccessPolicyDomainError = (context: string) => {
  return (error: unknown): WorkflowError => {
    // Handle validation errors
    if (error instanceof AccessPolicyValidationError) {
      return new WorkflowDependencyError(
        `Access policy ${context} failed: ${error.message}`,
        "AccessPolicyEntity",
        context,
        { originalError: error }
      )
    }
    
    if (error instanceof ValidationError) {
      return new WorkflowDependencyError(
        `Access policy ${context} failed: ${error.message}`,
        "AccessPolicyEntity",
        context,
        { originalError: error }
      )
    }
    
    // Handle business rule violations
    if (error instanceof BusinessRuleViolationError) {
      return new WorkflowDependencyError(
        `Access policy ${context} failed: ${error.message}`,
        "AccessPolicyEntity",
        context,
        { originalError: error }
      )
    }
    
    // Pass through permission errors
    if (error instanceof PermissionCheckError) {
      return error
    }
    
    // Pass through workflow errors
    if (error instanceof WorkflowDependencyError) {
      return error
    }
    
    // Generic error mapping
    return error as unknown as WorkflowError
  }
}

export const mapAccessPolicyDeletionError = (error: unknown): WorkflowError => {
  // Handle not found errors
  if (error instanceof AccessPolicyNotFoundError) {
    return new WorkflowDependencyError(
      `Access policy not found for deletion: ${error.message}`,
      "AccessPolicyRepository",
      "delete",
      { originalError: error }
    )
  }
  
  // Handle database errors
  if (error instanceof DatabaseError) {
    return new WorkflowDependencyError(
      `Database error during policy deletion: ${error.message}`,
      "AccessPolicyRepository",
      "delete",
      { originalError: error }
    )
  }
  
  // Pass through permission errors
  if (error instanceof PermissionCheckError) {
    return error
  }
  
  // Pass through workflow errors
  if (error instanceof WorkflowDependencyError) {
    return error
  }
  
  // Generic error
  return error as unknown as WorkflowError
}

// ===== UPLOAD WORKFLOW ERROR MAPPERS =====

export const mapUploadInitiationError = (
  context: { documentId: string }
) => {
  return (error: unknown): WorkflowError | ParseResult.ParseError => {
    // Pass through ParseResult.ParseError for schema validation failures
    if (error && typeof error === 'object' && '_tag' in error && error._tag === 'ParseError') {
      return error as ParseResult.ParseError
    }

    // Pass through existing workflow errors
    if (error instanceof UploadInitiationError) {
      return error
    }
    if (error instanceof PermissionCheckError) {
      return error
    }
    if (error instanceof WorkflowDependencyError) {
      return error
    }

    // Map FileStorageError to UploadInitiationError
    if (error instanceof FileStorageError) {
      return new UploadInitiationError(
        `Upload initiation failed: ${error.message}`,
        context.documentId,
        'unknown',
        { originalError: error, storageError: error.code }
      )
    }

    // Map DocumentNotFoundError to WorkflowDependencyError
    if (error instanceof DocumentNotFoundError) {
      return new WorkflowDependencyError(
        `Document not found: ${error.message}`,
        "DocumentRepository",
        "findById",
        { originalError: error }
      )
    }

    // Generic error mapping
    return new UploadInitiationError(
      `Upload initiation failed: ${error instanceof Error ? error.message : String(error)}`,
      context.documentId,
      'unknown',
      { originalError: error }
    )
  }
}

export const mapUploadConfirmationError = (
  context: { documentId: string }
) => {
  return (error: unknown): WorkflowError | ParseResult.ParseError => {
    // Pass through ParseResult.ParseError for schema validation failures
    if (error && typeof error === 'object' && '_tag' in error && error._tag === 'ParseError') {
      return error as ParseResult.ParseError
    }

    // Pass through existing upload errors
    if (error instanceof UploadConfirmationError) {
      return error
    }
    if (error instanceof ChecksumValidationError) {
      return error
    }
    if (error instanceof FileNotFoundError) {
      return error
    }
    if (error instanceof PermissionCheckError) {
      return error
    }
    if (error instanceof WorkflowDependencyError) {
      return error
    }

    // Map FileStorageError to UploadConfirmationError
    if (error instanceof FileStorageError) {
      const reason = error.code === "NOT_FOUND" ? "FILE_NOT_FOUND" : "CHECKSUM_MISMATCH"
      return new UploadConfirmationError(
        `Upload confirmation failed: ${error.message}`,
        context.documentId,
        '',
        reason,
        { originalError: error, storageError: error.code }
      )
    }

    // Map DocumentNotFoundError to WorkflowDependencyError
    if (error instanceof DocumentNotFoundError) {
      return new WorkflowDependencyError(
        `Document not found: ${error.message}`,
        "DocumentRepository",
        "findById",
        { originalError: error }
      )
    }

    // Generic error mapping
    return new UploadConfirmationError(
      `Upload confirmation failed: ${error instanceof Error ? error.message : String(error)}`,
      context.documentId,
      '',
      "FILE_NOT_FOUND",
      { originalError: error }
    )
  }
}

