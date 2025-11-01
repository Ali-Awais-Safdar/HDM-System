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

