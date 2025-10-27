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
    
    // Step 3: Derive workspace context from header and JWT payload
    const workspaceId = yield* deriveWorkspace(payload, c)
    
    // Step 4: Build final RPC context
    const context = yield* buildContext(payload, workspaceId, c)
    
    return context
  })
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
