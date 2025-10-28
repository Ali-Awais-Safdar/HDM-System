import { Effect, Clock, Option } from "effect"
import { mapToORPCError, type ErrorMappingOptions } from "./error-map"
import { resolveService } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"
import { AuditPort } from "@application/services/ports/audit.port"
import type { RPCContext } from "./context"

/**
 * Effect Adapter for oRPC Handlers
 * 
 * Centralizes Effect execution and error handling with structured logging:
 * 1. Provides Clock service automatically
 * 2. Logs RPC call start with correlation metadata
 * 3. Maps errors in the Effect channel using Effect.mapError
 * 4. Logs RPC call completion with duration and error classification
 * 5. Records audit events for significant errors
 * 6. Executes the Effect and returns a Promise
 */
export const executeEffect = async <A>(
  effect: Effect.Effect<A, unknown, Clock.Clock>,
  context: {
    procedureName: string
    rpcContext: RPCContext
  }
): Promise<A> => {
  const logger = context.rpcContext.logger
  const audit = resolveService<AuditPort>(TOKENS.AUDIT_PORT)
  const startTime = Date.now()
  
  const requestId = context.rpcContext.requestContext.requestId
  const actorId = context.rpcContext.actorId
  const workspaceIdOption = context.rpcContext.workspaceId
  const workspaceId = workspaceIdOption ? Option.getOrNull(workspaceIdOption) : undefined
  const procedureName = context.procedureName

  logger.debug(`RPC call started: ${procedureName}`, {
    procedureName,
    timestamp: new Date().toISOString()
  })

  try {
    const errorOptions: ErrorMappingOptions = {
      requestId,
      actorId,
      logDetails: true
    }
    
    const runnable = effect.pipe(
      Effect.provideService(Clock.Clock, Clock.make()),
      Effect.mapError((error) => mapToORPCError(error, errorOptions))
    )

    const result = await Effect.runPromise(runnable)
    
    const duration = Date.now() - startTime
    logger.info(`RPC call completed: ${procedureName}`, {
      procedureName,
      duration,
      success: true,
      timestamp: new Date().toISOString()
    })
    
    return result
  } catch (error) {
    const duration = Date.now() - startTime
    const errorCode = (error as any)?.code || "UNKNOWN_ERROR"
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    // Record audit event for authenticated requests with significant errors
    const workspaceIdString = workspaceId ? String(workspaceId) : undefined
    const shouldAudit = actorId && 
                       workspaceIdString && 
                       errorCode !== "VALIDATION_ERROR" &&
                       errorCode !== "UNAUTHORIZED" &&
                       errorCode !== "FORBIDDEN" &&
                       errorCode !== "PARSE_ERROR"
    
    if (shouldAudit && workspaceIdString) {
      const auditEvent: any = {
        actorId: actorId,
        workspaceId: workspaceIdString,
        resourceType: "rpc_operation",
        resourceId: procedureName,
        action: procedureName,
        outcome: "failure" as const,
        reason: errorMessage,
        metadata: {
          errorCode,
          errorMessage,
          procedure: procedureName,
          duration
        }
      }
      
      auditEvent.correlationId = requestId
      
      Effect.runPromiseExit(audit.record(auditEvent)).catch(() => {
      })
    }
    
    throw error
  }
}