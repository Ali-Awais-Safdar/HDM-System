import { Option } from "effect"

/**
 * Presentation Layer Utilities
 */

export function normalizeUpdatedAt<T extends { updatedAt?: string | null | undefined }>(
  result: T
): T & { updatedAt?: string | undefined } {
  return {
    ...result,
    updatedAt: result.updatedAt ?? undefined
  }
}

export function normalizeUploadResponse<T extends { 
  createdBy?: Option.Option<string> | string | null | undefined;
  updatedAt?: string | null | undefined;
}>(
  result: T
): T & { 
  createdBy: string | null;
  updatedAt?: string | undefined;
} {
  const createdBy = result.createdBy 
    ? (Option.isOption(result.createdBy) 
        ? Option.match(result.createdBy, { onNone: () => null, onSome: (v) => v })
        : result.createdBy)
    : null
  
  return {
    ...result,
    createdBy,
    updatedAt: result.updatedAt ?? undefined
  }
}

export function mimeToExt(mimeType: string): string {
  const mimeToExtension: Record<string, string> = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "text/plain": ".txt",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx"
  }
  return mimeToExtension[mimeType] || ""
}

/**
 * OpenAPI meta helper for workspace header parameter
 */
const WORKSPACE_HEADER_PARAMETER = {
  name: "x-workspace-id",
  in: "header" as const,
  schema: { type: "string" as const, format: "uuid" as const },
  required: false,
  description: "If present, must match JWT's workspace. Otherwise JWT workspace applies."
}

/**
 * Adds workspace header parameter to OpenAPI meta
 * 
 * Use this helper when procedures require workspace context via
 * withActorAndWorkspace or withActorWorkspaceAndOwner.
 */
export function withWorkspaceHeader(meta: {
  summary: string
  description: string
  tags: string[]
  parameters?: unknown[]
  security?: unknown[]
}) {
  return {
    ...meta,
    parameters: [...(meta.parameters || []), WORKSPACE_HEADER_PARAMETER]
  }
}

