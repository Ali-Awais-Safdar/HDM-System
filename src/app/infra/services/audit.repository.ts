import "reflect-metadata"
import { injectable, inject } from "tsyringe"
import { Effect, pipe } from "effect"
import { AuditPort, AuditEvent, AuditError, sanitizeAuditMetadata } from "@application/services/ports/audit.port"
import { TOKENS } from "@infra/di/container"
import type { DatabaseInterface } from "@infra/db/interfaces"
import { auditLogs, type NewAuditLogModel } from "@infra/db/models/audit-log.model"
import { LoggerPort } from "@application/services/ports/logger.port"

/**
 * Database-backed Audit Repository
 * 
 * Provides durable, append-only audit logging using PostgreSQL.
 * Features:
 * - Automatic data sanitization
 * - Correlation ID tracking
 * - Query optimization via indexes
 * - Error resilience (logs errors but doesn't block operations)
 */
@injectable()
export class AuditRepository implements AuditPort {
  constructor(
    @inject(TOKENS.DATABASE_CONNECTION) private readonly db: DatabaseInterface,
    @inject(TOKENS.LOGGER_PORT) private readonly logger: LoggerPort
  ) {}

  record(event: AuditEvent): Effect.Effect<void, AuditError, never> {
    return pipe(
      Effect.tryPromise({
        try: async () => {
          // Sanitize metadata before storing
          const sanitizedMetadata = event.metadata 
            ? sanitizeAuditMetadata(event.metadata)
            : undefined

          const auditLog: NewAuditLogModel = {
            actorId: event.actorId,
            workspaceId: event.workspaceId,
            resourceType: event.resourceType,
            resourceId: event.resourceId,
            action: event.action,
            outcome: event.outcome,
            correlationId: event.correlationId,
            reason: event.reason,
            metadata: sanitizedMetadata as any,
          }

          await this.db.insert(auditLogs).values(auditLog)
          
          // Log successful audit recording at trace level to reduce noise
          this.logger.trace("Audit event recorded", {
            resourceType: event.resourceType,
            resourceId: event.resourceId,
            action: event.action,
            outcome: event.outcome,
            correlationId: event.correlationId
          })
        },
        catch: (error) => {
          // Log the error but wrap in AuditError
          const message = error instanceof Error ? error.message : String(error)
          this.logger.error("Failed to record audit event", {
            error: message,
            resourceType: event.resourceType,
            resourceId: event.resourceId,
            action: event.action
          })
          return new AuditError(`Failed to record audit event: ${message}`, error)
        }
      })
    )
  }
}

