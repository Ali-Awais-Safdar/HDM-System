import { Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../../shared/errors/app-error";
import { Result } from "../../shared/result/result";

/**
 * Centralized error handling utilities for HTTP layer.
 * Provides consistent error formatting and status code mapping across all controllers.
 */

/**
 * Error codes used throughout the application.
 * Prefer these over string-based error detection for better type safety.
 */
export type ErrorCode = 
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "BAD_REQUEST"
  | "INTERNAL_ERROR"
  | "DOCUMENT_NOT_FOUND"
  | "ACCESS_DENIED"
  | "PERMISSION_CHECK_FAILED"
  | "INVALID_TOKEN"
  | "TOKEN_EXPIRED"
  | "TOKEN_ALREADY_USED"
  | "TOKEN_VALIDATION_FAILED"
  | "FILE_RETRIEVAL_FAILED"
  | "PERMISSION_GRANT_FAILED"
  | "PERMISSION_REVOKE_FAILED"
  | "PERMISSION_RETRIEVAL_FAILED"
  | "PERMISSION_NOT_FOUND"
  | "CANNOT_REVOKE_OWNER_ACCESS"
  | "INVALID_PARAMS"
  | "MISSING_FILE"
  | "INVALID_FILE"
  | "SIGNUP_ERROR"
  | "LOGIN_ERROR"
  | "CREATE_DOCUMENT_ERROR"
  | "GET_DOCUMENT_ERROR"
  | "UPDATE_METADATA_ERROR"
  | "DELETE_DOCUMENT_ERROR";

/**
 * Maps error codes to appropriate HTTP status codes.
 * Centralizes status code logic to avoid duplication across controllers.
 */
export function toHttpStatus(errorCode: ErrorCode | string): number {
  switch (errorCode) {
    // 4xx Client Errors
    case "BAD_REQUEST":
    case "INVALID_PARAMS":
    case "INVALID_FILE":
    case "CANNOT_REVOKE_OWNER_ACCESS":
      return 400;
    
    case "UNAUTHORIZED":
      return 401;
    
    case "FORBIDDEN":
    case "ACCESS_DENIED":
      return 403;
    
    case "NOT_FOUND":
    case "DOCUMENT_NOT_FOUND":
    case "PERMISSION_NOT_FOUND":
    case "INVALID_TOKEN":
      return 404;
    
    case "CONFLICT":
      return 409;
    
    case "TOKEN_EXPIRED":
    case "TOKEN_ALREADY_USED":
      return 410;
    
    case "VALIDATION_ERROR":
      return 422;
    
    case "MISSING_FILE":
      return 400;
    
    // 5xx Server Errors
    case "INTERNAL_ERROR":
    case "PERMISSION_CHECK_FAILED":
    case "TOKEN_VALIDATION_FAILED":
    case "FILE_RETRIEVAL_FAILED":
    case "PERMISSION_GRANT_FAILED":
    case "PERMISSION_REVOKE_FAILED":
    case "PERMISSION_RETRIEVAL_FAILED":
    case "SIGNUP_ERROR":
    case "LOGIN_ERROR":
    case "CREATE_DOCUMENT_ERROR":
    case "GET_DOCUMENT_ERROR":
    case "UPDATE_METADATA_ERROR":
    case "DELETE_DOCUMENT_ERROR":
    default:
      return 500;
  }
}

/**
 * Formats Zod validation errors into a consistent structure.
 * Used across all controllers for validation error responses.
 */
export function formatZodError(zodError: ZodError): {
  error: string;
  code: string;
  details: Array<{ field: string; message: string }>;
} {
  return {
    error: "Validation failed",
    code: "VALIDATION_ERROR",
    details: zodError.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message
    }))
  };
}

/**
 * Extracts error code from various error types.
 * Handles AppError instances, Result errors, and fallback string-based detection.
 */
export function extractErrorCode(error: unknown): ErrorCode {
  // Handle AppError instances
  if (error instanceof AppError) {
    return error.code as ErrorCode;
  }
  
  // Handle Result error objects
  if (error && typeof error === 'object' && 'code' in error) {
    return error.code as ErrorCode;
  }
  
  // Handle Error instances with message-based detection (legacy support)
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes("already exists")) return "CONFLICT";
    if (message.includes("document not found")) return "DOCUMENT_NOT_FOUND";
    if (message.includes("not found")) return "NOT_FOUND";
    if (message.includes("insufficient permissions") || message.includes("permissions")) return "FORBIDDEN";
    if (message.includes("invalid credentials")) return "UNAUTHORIZED";
    if (message.includes("invalid") || message.includes("must")) return "BAD_REQUEST";
    if (message.includes("unauthorized") || message.includes("authentication required")) return "UNAUTHORIZED";
  }
  
  // Default fallback
  return "INTERNAL_ERROR";
}

/**
 * Sends a successful response with consistent structure.
 * Provides a standard way to send success responses across controllers.
 */
export function sendOk<T>(res: Response, data: T, statusCode: number = 200): void {
  res.status(statusCode).json(data);
}

/**
 * Sends an error response with consistent structure.
 * Centralizes error response formatting across all controllers.
 */
export function sendErr(
  res: Response, 
  error: unknown, 
  message?: string, 
  errorCode?: string
): void {
  const code = errorCode || extractErrorCode(error);
  const statusCode = toHttpStatus(code);
  
  const response: {
    error: string;
    code: string;
    details?: unknown;
  } = {
    error: message || (error instanceof Error ? error.message : "Internal server error"),
    code: code
  };
  
  res.status(statusCode).json(response);
}

/**
 * Handles Result types and sends appropriate response.
 * Convenience function for controllers using Result pattern.
 */
export function handleResult<T>(
  res: Response,
  result: Result<T, Error>,
  successStatusCode: number = 200
): void {
  if (result.ok) {
    sendOk(res, result.value, successStatusCode);
  } else {
    sendErr(res, result.error);
  }
}

/**
 * Handles validation errors from Zod schemas.
 * Provides consistent validation error responses.
 */
export function handleValidationError(res: Response, zodError: ZodError): void {
  const errorResponse = formatZodError(zodError);
  res.status(toHttpStatus("VALIDATION_ERROR")).json(errorResponse);
}
