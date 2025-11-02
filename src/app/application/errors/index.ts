/**
 * Application Layer Errors Module
 * 
 * Centralized exports for application layer error types.
 */

export {
  // Base application errors
  ApplicationError,
  
  // Base workflow errors
  WorkflowError,
  WorkflowDependencyError,
  
  // Upload workflow errors
  UploadError,
  UploadInitiationError,
  UploadConfirmationError,
  FileNotFoundError,
  ChecksumValidationError,
  
  // Access control workflow errors
  AccessControlError,
  AccessPolicyCreationError,
  PermissionCheckError,
  
  // Download token workflow errors
  DownloadTokenWorkflowError,
  DownloadTokenGenerationError,
  DownloadTokenValidationError,
  
  // Infrastructure dependency errors
  PersistenceDependencyError,
  ExternalPortError,
  InteractionValidationError,
  
  // Error type unions
  type ApplicationErrorType,
  type UploadWorkflowError,
  type AccessControlWorkflowError,
  type DownloadTokenWorkflowErrorType
} from './application.errors'
