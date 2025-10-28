import { Effect } from "effect"

export interface AuditEvent {
  readonly actorId: string
  
  readonly workspaceId: string
  
  readonly resourceType: string
  
  readonly resourceId: string
  
  readonly action: string
  
  readonly correlationId?: string
  
  readonly outcome: "success" | "failure"
  
  readonly metadata?: Record<string, unknown>
  
  readonly reason?: string
}

export abstract class AuditPort {
  /**
   * Record an audit event
   * 
   * Implementations should ensure metadata is sanitized before storage
   * to prevent sensitive data from being persisted.
   */
  abstract record(event: AuditEvent): Effect.Effect<void, AuditError, never>
}

export class AuditError extends Error {
  readonly _tag = "AuditError"
  
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = "AuditError"
  }
}

export function sanitizeAuditMetadata(data: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = [
    "jwt",
    "token",
    "accessToken",
    "refreshToken",
    "authorization",
    "password",
    "secret",
    "apiKey",
    "storageUrl",
    "presignedUrl",
    "downloadUrl",
    "uploadUrl"
  ]
  
  const sanitized: Record<string, unknown> = {}
  
  for (const [key, value] of Object.entries(data)) {
    // Skip sensitive keys (case-insensitive)
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[key] = "[REDACTED]"
      continue
    }
    
    // Recursively sanitize nested objects
    if (value && typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = sanitizeAuditMetadata(value as Record<string, unknown>)
    } else {
      sanitized[key] = value
    }
  }
  
  return sanitized
}

