import { z } from "zod";
import { documentIdParamSchema } from "./common";

/**
 * Schema for generating a download link.
 */
export const generateDownloadLinkSchema = z.object({
  /** Optional custom expiration time in minutes (default: 5, max: 60) */
  expiresInMinutes: z.coerce.number().int().min(1).max(60).default(5).optional(),
});

export type GenerateDownloadLinkRequest = z.infer<typeof generateDownloadLinkSchema>;

/**
 * Schema for the successful download link generation response.
 */
export const generateDownloadLinkResponseSchema = z.object({
  url: z.string(),
  expiresAt: z.string(), // ISO date string
  documentId: z.string(),
  issuedTo: z.string(),
  message: z.string(),
});

export type GenerateDownloadLinkResponseDto = z.infer<typeof generateDownloadLinkResponseSchema>;

/**
 * Schema for download token parameter validation.
 */
export const downloadTokenParamSchema = z.object({
  token: z.string().min(1, "Download token is required"),
});

export type DownloadTokenParam = z.infer<typeof downloadTokenParamSchema>;

// Re-export common schemas for convenience
export { documentIdParamSchema } from "./common";
export type DocumentIdParam = z.infer<typeof documentIdParamSchema>;

/**
 * Common error response schema for download operations.
 */
export const downloadErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});

export type DownloadErrorResponseDto = z.infer<typeof downloadErrorResponseSchema>;
