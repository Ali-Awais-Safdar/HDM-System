import { z } from "zod";
import { documentIdParamSchema } from "./common";

/**
 * Schema for sharing a document (granting permissions).
 */
export const shareDocumentSchema = z.object({
  /** The user ID to share the document with */
  targetUserId: z.string().min(1, "Target user ID is required"),
  
  /** The permission level to grant */
  permissionLevel: z.enum(["read", "write", "admin"]).refine(
    (val) => ["read", "write", "admin"].includes(val),
    { message: "Permission level must be read, write, or admin" }
  ),
});

export type ShareDocumentRequest = z.infer<typeof shareDocumentSchema>;

/**
 * Schema for the successful share document response.
 */
export const shareDocumentResponseSchema = z.object({
  documentId: z.string(),
  targetUserId: z.string(),
  permissionLevel: z.enum(["read", "write", "admin"]),
  permissionId: z.string(),
  granted: z.boolean(),
  message: z.string(),
});

export type ShareDocumentResponseDto = z.infer<typeof shareDocumentResponseSchema>;

/**
 * Schema for revoking document access.
 */
export const revokeDocumentAccessSchema = z.object({
  /** The user ID to revoke access from */
  targetUserId: z.string().min(1, "Target user ID is required"),
});

export type RevokeDocumentAccessRequest = z.infer<typeof revokeDocumentAccessSchema>;

/**
 * Schema for the successful revoke access response.
 */
export const revokeDocumentAccessResponseSchema = z.object({
  documentId: z.string(),
  targetUserId: z.string(),
  revoked: z.boolean(),
  message: z.string(),
});

export type RevokeDocumentAccessResponseDto = z.infer<typeof revokeDocumentAccessResponseSchema>;

/**
 * Schema for document permissions response.
 */
export const documentPermissionsResponseSchema = z.object({
  documentId: z.string(),
  ownerId: z.string(),
  permissions: z.array(z.object({
    userId: z.string(),
    permissionLevel: z.enum(["read", "write", "admin"]),
    grantedAt: z.string(), // ISO date string
    permissionId: z.string(),
  })),
  totalCount: z.number(),
});

export type DocumentPermissionsResponseDto = z.infer<typeof documentPermissionsResponseSchema>;

// Re-export common schemas for convenience
export { documentIdParamSchema } from "./common";
export type DocumentIdParam = z.infer<typeof documentIdParamSchema>;

/**
 * Common error response schema for permission operations.
 */
export const permissionErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});

export type PermissionErrorResponseDto = z.infer<typeof permissionErrorResponseSchema>;
