import { Effect, Clock, Option, ParseResult } from "effect"
import { mapToORPCError, type ErrorMappingOptions } from "./error-map"
import { resolveService } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"
import { AuditPort } from "@application/services/ports/audit.port"
import type { ApplicationErrorType } from "@application/errors/application.errors"
import type { RPCContext, AnonymousRPCContext } from "./context"

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
  effect: Effect.Effect<A, ApplicationErrorType | ParseResult.ParseError, Clock.Clock>,
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
    
    logger.error(`RPC call failed: ${procedureName}`, {
      requestId,
      actorId,
      workspaceId: workspaceId || undefined,
      procedure: procedureName,
      duration,
      errorCode,
      errorMessage,
      timestamp: new Date().toISOString()
    })
    
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
      
      Effect.runPromiseExit(audit.record(auditEvent)).catch((auditError) => {
        logger.warn("Failed to record audit event", {
          requestId,
          actorId,
          workspaceId: workspaceIdString,
          procedure: procedureName,
          auditError: auditError instanceof Error ? auditError.message : String(auditError),
          timestamp: new Date().toISOString()
        })
      })
    }
    
    throw error
  }
}

/**
 * Effect Adapter for Anonymous (Unauthenticated) oRPC Handlers
 * 1. No actor ID or workspace ID in logging
 * 2. No audit events (unauthenticated operations)
 * 3. Still includes request correlation and structured logging
 */
export const executeEffectAnonymous = async <A>(
  effect: Effect.Effect<A, ApplicationErrorType | ParseResult.ParseError, Clock.Clock>,
  context: {
    procedureName: string
    rpcContext: AnonymousRPCContext
  }
): Promise<A> => {
  const logger = context.rpcContext.logger
  const startTime = Date.now()
  
  const requestId = context.rpcContext.requestContext.requestId
  const procedureName = context.procedureName

  logger.debug(`RPC call started (anonymous): ${procedureName}`, {
    procedureName,
    timestamp: new Date().toISOString()
  })

  try {
    const errorOptions: ErrorMappingOptions = {
      requestId,
      logDetails: true
    }
    
    const runnable = effect.pipe(
      Effect.provideService(Clock.Clock, Clock.make()),
      Effect.mapError((error) => mapToORPCError(error, errorOptions))
    )

    const result = await Effect.runPromise(runnable)
    
    const duration = Date.now() - startTime
    logger.info(`RPC call completed (anonymous): ${procedureName}`, {
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
    
    logger.error(`RPC call failed (anonymous): ${procedureName}`, {
      requestId,
      procedure: procedureName,
      duration,
      errorCode,
      errorMessage,
      timestamp: new Date().toISOString()
    })
    
    throw error
  }
}