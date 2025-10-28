import { Effect, Option } from "effect"
import type { Context as HonoContext } from "hono"
import { verify } from "hono/jwt"
import { ORPCError } from "@orpc/server"
import { 
  JWT_CONFIG,
  type JWTPayload as AppJWTPayload,
  decodeJWTPayload,
  getUserIdFromPayload,
  getWorkspaceId
} from "@infra/config"
import type { UserId, WorkspaceId } from "@domain/refined/ids"
import { makeWorkspaceId } from "@domain/refined/ids"
import type { Role } from "@domain/accessPolicy/access-policy.schema"
import type { LoggerPort } from "@application/services/ports/logger.port"
import { resolveService } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"

/**
 * Request Context
 * 
 * Correlation and observability metadata for each request:
 * - requestId: Unique identifier for request tracing
 * - timestamp: Request initiation time
 * - ipAddress: Client IP address
 * - userAgent: Client user agent string
 */
export interface RequestContext {
  readonly requestId: string
  readonly timestamp: Date
  readonly ipAddress: string | undefined
  readonly userAgent: string | undefined
}

/**
 * Sanitized Actor Information
 * 
 * Safe subset of authentication data that can be logged/traced.
 * Excludes sensitive JWT claims to prevent token leakage.
 */
export interface ActorInfo {
  readonly userId: UserId
  readonly roles: readonly Role[]
  readonly workspaceId: Option.Option<WorkspaceId>
}

/**
 * RPC Context
 * 
 * Context object passed to all oRPC procedures, containing:
 * - actorId: The authenticated user ID
 * - workspaceId: Optional workspace context
 * - roles: User roles for authorization
 * - requestContext: Request correlation metadata
 * - actor: Sanitized actor information for logging
 * - hono: Hono context for accessing request/response
 * - logger: Request-scoped logger for correlation
 */
export interface RPCContext {
  readonly actorId: UserId
  
  readonly workspaceId: Option.Option<WorkspaceId>
  
  readonly roles: readonly Role[]
  
  readonly requestContext: RequestContext
  
  readonly actor: ActorInfo
  
  readonly hono: HonoContext
  
  readonly logger: LoggerPort
}

/**
 * Chain-of-Responsibility Step 1: Extract Authorization Header
 * 
 * Ensures the Authorization header exists and has the correct format.
 * Throws ORPCError with UNAUTHORIZED if missing or malformed.
 */
function extractAuthHeader(c: HonoContext): Effect.Effect<string, ORPCError<string, unknown>> {
  return Effect.sync(() => {
    const authHeader = c.req.header(JWT_CONFIG.HEADER_NAME)
    
    // Header must exist
    if (!authHeader) {
      throw new ORPCError("UNAUTHORIZED", {
        message: "Missing Authorization header",
        status: 401,
        data: {
          code: "MISSING_AUTH_HEADER",
          details: "Authorization header is required for authenticated requests"
        }
      })
    }
    
    // Must start with "Bearer " prefix
    if (!authHeader.startsWith(JWT_CONFIG.TOKEN_PREFIX)) {
      throw new ORPCError("UNAUTHORIZED", {
        message: `Authorization header must start with "${JWT_CONFIG.TOKEN_PREFIX}"`,
        status: 401,
        data: {
          code: "INVALID_AUTH_HEADER_FORMAT",
          details: `Expected format: "${JWT_CONFIG.TOKEN_PREFIX}<token>"`
        }
      })
    }
    
    // Extract token after "Bearer " prefix
    const token = authHeader.slice(JWT_CONFIG.TOKEN_PREFIX.length)
    
    // Token must not be empty
    if (!token || token.trim() === "") {
      throw new ORPCError("UNAUTHORIZED", {
        message: "Empty token after Bearer prefix",
        status: 401,
        data: {
          code: "EMPTY_TOKEN",
          details: "JWT token is required"
        }
      })
    }
    
    return token
  })
}

/**
 * Chain-of-Responsibility Step 2: Verify JWT Token
 * 
 * Verifies the JWT signature and decodes the payload.
 * Throws ORPCError with UNAUTHORIZED if verification fails.
 */
function verifyJWT(token: string): Effect.Effect<AppJWTPayload, ORPCError<string, unknown>> {
  return Effect.gen(function* () {
    // Step 1: Verify JWT signature using configured secret and algorithm
    const rawPayload = yield* Effect.tryPromise({
      try: () => verify(token, JWT_CONFIG.SECRET, JWT_CONFIG.ALGORITHM),
      catch: (error) => {
        // Handle ORPCError from payload validation
        if (error instanceof ORPCError) {
          return error
        }
        
        const errorMessage = error instanceof Error ? error.message : String(error)
        
        // Check for expired token
        if (errorMessage.includes("expired") || errorMessage.includes("exp")) {
          return new ORPCError("UNAUTHORIZED", {
            message: "JWT token has expired",
            status: 401,
            data: {
              code: "EXPIRED_TOKEN",
              details: "Please obtain a new token"
            }
          })
        }
        
        // Invalid token (signature verification failed)
        return new ORPCError("UNAUTHORIZED", {
          message: "JWT token verification failed",
          status: 401,
          data: {
            code: "INVALID_TOKEN",
            details: errorMessage
          }
        })
      }
    })
    
    // Step 2: Validate payload structure using Effect Schema
    const payload = yield* decodeJWTPayload(rawPayload).pipe(
      Effect.mapError((error) => 
        new ORPCError("UNAUTHORIZED", {
          message: "JWT payload validation failed",
          status: 401,
          data: {
            code: "INVALID_JWT_PAYLOAD",
            details: error.message
          }
        })
      )
    )
    
    return payload
  })
}

/**
 * Chain-of-Responsibility Step 3: Derive Workspace Context
 * 
 * Extracts workspace information from the JWT payload and x-workspace-id header.
 * 1. Prefer header if present and validate with makeWorkspaceId
 * 2. If JWT workspace exists and header exists, ensure equality; else error
 * 3. If no header, use JWT Option directly
 * 4. If both absent, error "FORBIDDEN"
 * 
 * Returns Option<WorkspaceId> - workspace may be present or absent.
 */
function deriveWorkspace(
  payload: AppJWTPayload,
  honoContext: HonoContext
): Effect.Effect<Option.Option<WorkspaceId>, ORPCError<string, unknown>> {
  return Effect.gen(function* () {
    // Get workspace from JWT
    const jwtWorkspace = getWorkspaceId(payload)
    
    // Read x-workspace-id header (case-insensitive)
    const headerValue = honoContext.req.header("x-workspace-id")
    
    // If no header, use JWT workspace or fail if absent
    if (!headerValue) {
      if (Option.isNone(jwtWorkspace)) {
        return yield* Effect.fail(new ORPCError("FORBIDDEN", {
          message: "Workspace context is required for this operation",
          status: 403,
          data: {
            code: "MISSING_WORKSPACE",
            details: "This operation requires either an x-workspace-id header or a workspace-scoped JWT token"
          }
        }))
      }
      return jwtWorkspace
    }
    
    // Header exists - validate it
    const headerWorkspace = yield* makeWorkspaceId(headerValue).pipe(
      Effect.mapError((error) => {
        return new ORPCError("BAD_REQUEST", {
          message: "Invalid workspace ID in x-workspace-id header",
          status: 400,
          data: {
            code: "INVALID_WORKSPACE_ID",
            details: error.message
          }
        })
      })
    )
    
    // If JWT also has workspace, ensure they match
    if (Option.isSome(jwtWorkspace) && headerWorkspace !== jwtWorkspace.value) {
      return yield* Effect.fail(new ORPCError("FORBIDDEN", {
        message: "Workspace mismatch: x-workspace-id header does not match JWT workspace",
        status: 403,
        data: {
          code: "WORKSPACE_MISMATCH",
          headerWorkspace: headerWorkspace,
          jwtWorkspace: jwtWorkspace.value
        }
      }))
    }
    
    // Header validated (and matched JWT if present) - return it
    return Option.some(headerWorkspace)
  })
}

function getOrGenerateRequestId(honoContext: HonoContext): string {
  const headerRequestId = honoContext.req.header("x-request-id")
  if (headerRequestId && headerRequestId.trim() !== "") {
    return headerRequestId.trim()
  }
  return crypto.randomUUID()
}

function extractClientIp(honoContext: HonoContext): string | undefined {
  // Check X-Forwarded-For (most common proxy header)
  const xForwardedFor = honoContext.req.header("x-forwarded-for")
  if (xForwardedFor && xForwardedFor.length > 0) {
    // Take the first IP in the chain (client IP)
    const parts = xForwardedFor.split(",")
    const firstIp = parts.length > 0 ? parts[0] : undefined
    return firstIp && firstIp.trim().length > 0 ? firstIp.trim() : undefined
  }
  
  // Check X-Real-IP (nginx)
  const xRealIp = honoContext.req.header("x-real-ip")
  if (xRealIp && xRealIp.trim().length > 0) {
    return xRealIp.trim()
  }
  
  // No proxy headers found - return undefined
  // In production, this would come from the connection
  return undefined
}

function buildRequestContext(honoContext: HonoContext): RequestContext {
  return {
    requestId: getOrGenerateRequestId(honoContext),
    timestamp: new Date(),
    ipAddress: extractClientIp(honoContext),
    userAgent: honoContext.req.header("user-agent")
  }
}

function buildActorInfo(
  payload: AppJWTPayload,
  workspaceId: Option.Option<WorkspaceId>
): ActorInfo {
  return {
    userId: getUserIdFromPayload(payload),
    roles: payload.roles,
    workspaceId
  }
}

/**
 * Chain-of-Responsibility Step 4: Build Context
 * 
 * Constructs the final RPC context from the validated JWT payload.
 * Includes request correlation metadata and sanitized actor info.
 * Resolves and caches logger for request-scoped usage.
 */
function buildContext(
  payload: AppJWTPayload,
  workspaceId: Option.Option<WorkspaceId>,
  honoContext: HonoContext
): Effect.Effect<RPCContext, never> {
  return Effect.gen(function* () {
    const requestContext = buildRequestContext(honoContext)
    const actor = buildActorInfo(payload, workspaceId)
    
    // Resolve singleton logger once (lifted into Effect chain)
    const logger = yield* Effect.sync(() => resolveService<LoggerPort>(TOKENS.LOGGER_PORT))
    
    // Create request-scoped logger with correlation metadata
    const requestLogger = logger.child({
      requestId: requestContext.requestId,
      actorId: getUserIdFromPayload(payload),
      workspaceId: workspaceId ? Option.getOrNull(workspaceId) : undefined
    })
    
    return {
      actorId: getUserIdFromPayload(payload),
      workspaceId,
      roles: payload.roles,
      requestContext,
      actor,
      hono: honoContext,
      logger: requestLogger
    }
  })
}

/**
 * Create RPC Context - Chain of Responsibility Orchestrator
 */
export function createContext(c: HonoContext): Effect.Effect<RPCContext, ORPCError<string, unknown>> {
  return Effect.gen(function* () {
    // Step 1: Extract and validate Authorization header
    const token = yield* extractAuthHeader(c)
    
    // Step 2: Verify JWT signature and decode payload
    const payload = yield* verifyJWT(token)
    
    // Step 3: Derive workspace context from header and JWT payload
    const workspaceId = yield* deriveWorkspace(payload, c)
    
    // Step 4: Build final RPC context
    const context = yield* buildContext(payload, workspaceId, c)
    
    return context
  })
}

export function withActorAndWorkspace<T extends Record<string, unknown>>(
  input: T,
  context: RPCContext
): T & { actorId: UserId; workspaceId: WorkspaceId } {
  return Option.match(context.workspaceId, {
    onNone: () => {
      throw new ORPCError("FORBIDDEN", {
        message: "Workspace context is required for this operation",
        status: 403,
        data: {
          code: "MISSING_WORKSPACE",
          details: "This operation requires a workspace-scoped JWT token or x-workspace-id header",
          requestId: context.requestContext.requestId
        }
      })
    },
    onSome: (workspaceId) => ({
      ...input,
      actorId: context.actorId,
      workspaceId
    })
  })
}

export function withActorWorkspaceAndOwner<T extends Record<string, unknown>>(
  input: T,
  context: RPCContext
): T & { actorId: UserId; workspaceId: WorkspaceId; ownerId: UserId } {
  return Option.match(context.workspaceId, {
    onNone: () => {
      throw new ORPCError("FORBIDDEN", {
        message: "Workspace context is required for this operation",
        status: 403,
        data: {
          code: "MISSING_WORKSPACE",
          details: "This operation requires a workspace-scoped JWT token or x-workspace-id header",
          requestId: context.requestContext.requestId
        }
      })
    },
    onSome: (workspaceId) => ({
      ...input,
      actorId: context.actorId,
      workspaceId,
      ownerId: context.actorId // Owner is always the authenticated user
    })
  })
}