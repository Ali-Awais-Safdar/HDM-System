import { Effect, Option } from "effect"
import type { Context as HonoContext } from "hono"
import { verify } from "hono/jwt"
import { ORPCError } from "@orpc/server"
import { 
  JWT_CONFIG,
  type JWTPayload as AppJWTPayload,
  decodeJWTPayload,
  getUserIdFromPayload,
  getWorkspaceId,
  hasWorkspace
} from "@infra/config"
import type { UserId, WorkspaceId } from "@domain/refined/ids"
import type { Role } from "@domain/accessPolicy/access-policy.schema"

/**
 * RPC Context
 * 
 * Context object passed to all oRPC procedures, containing:
 * - actorId: The authenticated user ID
 * - workspaceId: Optional workspace context
 * - roles: User roles for authorization
 * - rawPayload: Full JWT payload for advanced use cases
 * - hono: Hono context for accessing request/response
 */
export interface RPCContext {

  readonly actorId: UserId
  
  readonly workspaceId: Option.Option<WorkspaceId>
  
  readonly roles: readonly Role[]
  
  readonly rawPayload: AppJWTPayload
  
  readonly hono: HonoContext
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
  return Effect.tryPromise({
    try: async () => {
      // Verify JWT signature using configured secret and algorithm
      const rawPayload = await verify(token, JWT_CONFIG.SECRET, JWT_CONFIG.ALGORITHM)
      
      // Validate payload structure using Effect Schema
      return await Effect.runPromise(
        decodeJWTPayload(rawPayload).pipe(
          Effect.mapError((error) => {
            throw new ORPCError("UNAUTHORIZED", {
              message: "JWT payload validation failed",
              status: 401,
              data: {
                code: "INVALID_JWT_PAYLOAD",
                details: error.message
              }
            })
          })
        )
      )
    },
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
}

/**
 * Chain-of-Responsibility Step 3: Derive Workspace Context
 * 
 * Extracts workspace information from the JWT payload.
 * Returns Option<WorkspaceId> - workspace may be present or absent.
 */
function deriveWorkspace(
  payload: AppJWTPayload
): Effect.Effect<Option.Option<WorkspaceId>, never> {
  return Effect.succeed(getWorkspaceId(payload))
}

/**
 * Chain-of-Responsibility Step 4: Build Context
 * 
 * Constructs the final RPC context from the validated JWT payload.
 */
function buildContext(
  payload: AppJWTPayload,
  workspaceId: Option.Option<WorkspaceId>,
  honoContext: HonoContext
): Effect.Effect<RPCContext, never> {
  return Effect.succeed({
    actorId: getUserIdFromPayload(payload),
    workspaceId,
    roles: payload.roles,
    rawPayload: payload,
    hono: honoContext
  })
}

/**
 * Create RPC Context - Chain of Responsibility Orchestrator
 * Each step is a pure function that can fail independently.
 * The chain stops at the first failure.
 */
export function createContext(c: HonoContext): Effect.Effect<RPCContext, ORPCError<string, unknown>> {
  return Effect.gen(function* () {
    // Step 1: Extract and validate Authorization header
    const token = yield* extractAuthHeader(c)
    
    // Step 2: Verify JWT signature and decode payload
    const payload = yield* verifyJWT(token)
    
    // Step 3: Derive workspace context from payload
    const workspaceId = yield* deriveWorkspace(payload)
    
    // Step 4: Build final RPC context
    const context = yield* buildContext(payload, workspaceId, c)
    
    return context
  })
}

/**
 * Helper: Attach Actor ID to DTO
 */
export function withActor<T extends Record<string, unknown>>(
  input: T,
  context: RPCContext
): T & { actorId: UserId } {
  return {
    ...input,
    actorId: context.actorId
  }
}

/**
 * Helper: Attach Actor and Workspace to DTO
 */
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
          details: "This operation requires a workspace-scoped JWT token"
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

/**
 * Helper: Ensure Workspace Exists
 */
export function ensureWorkspace(context: RPCContext): WorkspaceId {
  return Option.match(context.workspaceId, {
    onNone: () => {
      throw new ORPCError("FORBIDDEN", {
        message: "Workspace context is required for this operation",
        status: 403,
        data: {
          code: "MISSING_WORKSPACE",
          details: "This operation requires a workspace-scoped JWT token"
        }
      })
    },
    onSome: (workspaceId) => workspaceId
  })
}

/**
 * Helper: Check if context has specific role
 */
export function contextHasRole(context: RPCContext, role: Role): boolean {
  return context.roles.includes(role)
}

/**
 * Helper: Check if context user is admin
 */
export function contextIsAdmin(context: RPCContext): boolean {
  return context.roles.includes("ADMIN")
}

/**
 * Helper: Ensure user has specific role
 */
export function ensureRole(context: RPCContext, role: Role): void {
  if (!contextHasRole(context, role)) {
    throw new ORPCError("FORBIDDEN", {
      message: `This operation requires the ${role} role`,
      status: 403,
      data: {
        code: "INSUFFICIENT_ROLE",
        required: role,
        actual: context.roles
      }
    })
  }
}

/**
 * Helper: Ensure user is admin
 */
export function ensureAdmin(context: RPCContext): void {
  if (!contextIsAdmin(context)) {
    throw new ORPCError("FORBIDDEN", {
      message: "This operation requires administrator privileges",
      status: 403,
      data: {
        code: "ADMIN_REQUIRED",
        actual: context.roles
      }
    })
  }
}

/**
 * Type guard: Check if context has workspace
 */
export function contextHasWorkspace(context: RPCContext): boolean {
  return hasWorkspace(context.rawPayload)
}

/**
 * Helper: Get workspace ID from context (returns Option)
 */
export function getContextWorkspaceId(context: RPCContext): Option.Option<WorkspaceId> {
  return context.workspaceId
}
