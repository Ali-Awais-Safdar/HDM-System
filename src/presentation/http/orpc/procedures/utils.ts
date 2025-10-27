import { Option } from "effect"

/**
 * Presentation Layer Utilities
 * 
 * Shared helper functions for normalizing workflow responses to RPC format.
 * These utilities handle common transformations between application layer
 * (Effect with Options, branded types) and presentation layer (plain JSON).
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

