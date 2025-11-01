import { ParseResult } from "effect"
import { DocumentValidationError, DocumentNotFoundError } from "@domain/document/document.error"
import { DocumentVersionNotFoundError } from "@domain/documentVersion/document-version.error"
import { DownloadTokenValidationError, DownloadTokenNotFoundError, DownloadTokenAlreadyUsedError } from "@domain/downloadToken/download-token.error"
import { AccessPolicyValidationError, AccessPolicyNotFoundError, AccessPolicyConflictError } from "@domain/accessPolicy/access-policy.error"
import { UserValidationError, UserNotFoundError } from "@domain/user/user.error"
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
        "DocumentAggregateRepository",
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
      "DocumentAggregateRepository",
      source,
      { originalError: error }
    )
  }
}

export const mapDocumentVersionPersistenceError = (
  source: "save" | "findDocumentIdByVersionId"
) => {
  return (error: unknown): WorkflowDependencyError => {
    if (error instanceof ValidationError) {
      return new WorkflowDependencyError(
        `Document version persistence failed: ${error.message}`,
        "DocumentAggregateRepository",
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
      "DocumentAggregateRepository",
      source,
      { originalError: error }
    )
  }
}

export const mapDocumentVersionError = (
  source: "getVersion" | "findDocumentIdByVersionId" | "loadById"
) => {
  return (error: unknown): WorkflowDependencyError | PermissionCheckError => {
    // Handle domain errors
    if (error instanceof DocumentVersionNotFoundError) {
      return new WorkflowDependencyError(
        `Document version not found: ${error.message}`,
        "DocumentAggregateRepository",
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
        "DocumentAggregateRepository",
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
      "DocumentAggregateRepository",
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
        "DocumentAggregateRepository",
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
        "DocumentAggregateRepository",
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

    // Map FileStorageError to specific error types based on code
    if (error instanceof FileStorageError) {
      // FILE_NOT_FOUND is reserved strictly for NOT_FOUND storage errors
      if (error.code === "NOT_FOUND") {
        return new FileNotFoundError(
          `File not found in storage: ${error.message}`,
          context.documentId, // Use documentId as fileKey in this context
          { originalError: error }
        )
      }
      // Map other FileStorageError codes to CHECKSUM_MISMATCH as generic validation failure
      return new UploadConfirmationError(
        `Upload confirmation failed: ${error.message}`,
        context.documentId,
        '',
        "CHECKSUM_MISMATCH",
        { originalError: error, storageErrorCode: error.code }
      )
    }

    // Map DocumentNotFoundError to WorkflowDependencyError
    if (error instanceof DocumentNotFoundError) {
      return new WorkflowDependencyError(
        `Document not found: ${error.message}`,
        "DocumentAggregateRepository",
        "findById",
        { originalError: error }
      )
    }

    // Generic error mapping - use CHECKSUM_MISMATCH as generic validation failure
    return new UploadConfirmationError(
      `Upload confirmation failed: ${error instanceof Error ? error.message : String(error)}`,
      context.documentId,
      '',
      "CHECKSUM_MISMATCH",
      { originalError: error }
    )
  }
}

// ===== FILE STORAGE ERROR MAPPERS =====

export const mapFileStorageError = (
  context: { operation: string; fileKey?: string }
) => {
  return (error: unknown): FileNotFoundError | WorkflowDependencyError => {
    if (error instanceof FileStorageError) {
      if (error.code === "NOT_FOUND") {
        return new FileNotFoundError(
          `File not found in storage: ${error.message}`,
          context.fileKey || "unknown",
          { originalError: error }
        )
      }
      return new WorkflowDependencyError(
        `File storage ${context.operation} failed: ${error.message}`,
        "FileStoragePort",
        context.operation,
        { originalError: error, storageError: error.code }
      )
    }
    
    if (error instanceof FileNotFoundError) {
      return error
    }
    
    if (error instanceof WorkflowDependencyError) {
      return error
    }
    
    return new WorkflowDependencyError(
      `File storage ${context.operation} failed: ${error instanceof Error ? error.message : String(error)}`,
      "FileStoragePort",
      context.operation,
      { originalError: error }
    )
  }
}

// ===== USER ERROR MAPPERS =====

export const mapUserPersistenceError = (
  source: "save" | "findById" | "findByEmail"
) => {
  return (error: unknown): WorkflowDependencyError => {
    if (error instanceof ValidationError) {
      return new WorkflowDependencyError(
        `User persistence failed: ${error.message}`,
        "UserRepository",
        source,
        { originalError: error }
      )
    }
    if (error instanceof DatabaseError) {
      return new WorkflowDependencyError(
        `Database error during user ${source}: ${error.message}`,
        "Database",
        source,
        { originalError: error }
      )
    }
    if (error instanceof PermissionCheckError || error instanceof WorkflowDependencyError) {
      return error as WorkflowDependencyError
    }
    return new WorkflowDependencyError(
      `User ${source} failed: ${error instanceof Error ? error.message : String(error)}`,
      "UserRepository",
      source,
      { originalError: error }
    )
  }
}

export const mapUserDomainError = (context: string) => {
  return (error: unknown): WorkflowError => {
    if (error instanceof UserValidationError) {
      return new WorkflowDependencyError(
        `User ${context} failed: ${error.message}`,
        "UserEntity",
        context,
        { originalError: error }
      )
    }
    if (error instanceof BusinessRuleViolationError) {
      return new WorkflowDependencyError(
        `User ${context} failed: ${error.message}`,
        "UserEntity",
        context,
        { originalError: error }
      )
    }
    if (error instanceof UserNotFoundError) {
      return new WorkflowDependencyError(
        `User not found: ${error.message}`,
        "UserRepository",
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

