import { Hono, type Context as HonoContext } from "hono"
import { cors } from "hono/cors"
import { Effect } from "effect"
import { RPCHandler } from "@orpc/server/fetch"
import { HTTP_CONFIG, JWT_CONFIG } from "@infra/config"
import { 
  createContext, 
  createAnonymousContext,
  isAnonymousProcedure,
  type RPCContextLike 
} from "./orpc/context"
import { mapToORPCError } from "./orpc/error-map"
import { procedures } from "./orpc/procedures"
import type { MiddlewareHandler } from "hono"
import { resolveService } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"
import { LoggerPort } from "@application/services/ports/logger.port"

type Variables = {
  rpcContext: RPCContextLike
}

function extractProcedurePath(path: string, prefix: string): string | undefined {
  if (!path.startsWith(prefix + "/")) {
    return undefined
  }
  return path.slice(prefix.length + 1)
}

function hasAuthHeader(c: HonoContext): boolean {
  const authHeader = c.req.header(JWT_CONFIG.HEADER_NAME)
  return authHeader !== undefined && authHeader.trim() !== ""
}

/**
 * Context Middleware
 * 
 * Implements context-aware Chain of Responsibility pattern:
 * 1. Extract procedure path from request URL
 * 2. Determine if procedure is anonymous (signUp, login)
 * 3. For anonymous procedures without auth header:
 *    - Create AnonymousRPCContext (no JWT required)
 * 4. For all other cases (authenticated procedures or anonymous with auth):
 *    - Create authenticated RPCContext (JWT required)
 * 5. Attach context to Hono context via c.set('rpcContext')
 * 6. Set x-request-id header on response for correlation
 */
const contextMiddleware: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const procedurePath = extractProcedurePath(c.req.path, HTTP_CONFIG.RPC_PREFIX)
  const isAnonymous = procedurePath ? isAnonymousProcedure(procedurePath) : false
  const hasAuth = hasAuthHeader(c)

  const rpcContext = (isAnonymous && !hasAuth)
    ? await Effect.runPromise(createAnonymousContext(c))
    : await Effect.runPromise(createContext(c))
  
  c.set("rpcContext", rpcContext)
  
  c.header("x-request-id", rpcContext.requestContext.requestId)
  
  await next()
}

/**
 * Build Hono Server
 * 
 * Assembles the complete HTTP server with:
 * - CORS middleware (configured from env)
 * - Context middleware (JWT authentication)
 * - oRPC handler (RPC endpoint)
 */
export function buildServer(): Hono<{ Variables: Variables }> {
  const app = new Hono<{ Variables: Variables }>()

  const logger = resolveService<LoggerPort>(TOKENS.LOGGER_PORT)

  const corsOrigins = HTTP_CONFIG.CORS.ORIGINS
  
  app.use("*", cors({
    origin: corsOrigins === "*" 
      ? "*" 
      : Array.isArray(corsOrigins) 
        ? corsOrigins 
        : [corsOrigins],
    credentials: HTTP_CONFIG.CORS.CREDENTIALS,
    maxAge: HTTP_CONFIG.CORS.MAX_AGE,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type", 
      "Authorization", 
      JWT_CONFIG.HEADER_NAME,
      "Accept",
      "Origin",
      "X-Requested-With"
    ],
    exposeHeaders: [
      "X-Request-Id",
      "Content-Type"
    ]
  }))

  app.get("/health", (c) => {
    return c.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "dms-headless",
      version: "1.0.0"
    })
  })

  app.use(`${HTTP_CONFIG.RPC_PREFIX}/*`, contextMiddleware)

  const rpcHandler = new RPCHandler<RPCContextLike>(procedures as any)

  app.use(`${HTTP_CONFIG.RPC_PREFIX}/*`, async (c) => {
    const rpcContext = c.get("rpcContext")
    
    const { matched, response } = await rpcHandler.handle(c.req.raw, {
      prefix: HTTP_CONFIG.RPC_PREFIX,
      context: rpcContext
    })

    if (matched) {
      return c.newResponse(response.body, response)
    }

    return c.json(
      {
        code: "NOT_FOUND",
        message: "RPC procedure not found",
        data: {
          path: c.req.path,
          method: c.req.method
        }
      },
      404
    )
  })

  app.notFound((c) => {
    return c.json(
      {
        code: "NOT_FOUND",
        message: "Endpoint not found",
        data: {
          path: c.req.path,
          method: c.req.method
        }
      },
      404
    )
  })

  app.onError((error, c) => {
    // Extract request context if available
    const rpcContext = c.get("rpcContext")
    const requestId = rpcContext?.requestContext?.requestId
    
    // Use request-scoped logger if available
    // For pre-context errors (like middleware failures before auth), use singleton
    const requestLogger = rpcContext?.logger || logger
    
    requestLogger.error("Unhandled server error", {
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : "Unknown",
      stack: error instanceof Error ? error.stack : undefined,
      path: c.req.path,
      method: c.req.method,
      timestamp: new Date().toISOString()
    })
    
    if (requestId) {
      c.header("x-request-id", requestId)
    }
    
    const orpcError = mapToORPCError(error)
    const status = orpcError.status ?? 500
    
    return c.json(
      {
        code: orpcError.code,
        message: orpcError.message,
        data: {
          ...(typeof orpcError.data === "object" && orpcError.data !== null ? orpcError.data : {}),
          requestId
        }
      },
      status as any // Hono's type system requires explicit status codes
    )
  })

  logger.info("Hono server built successfully", {
    healthCheckPath: "/health",
    rpcEndpoint: `${HTTP_CONFIG.RPC_PREFIX}/*`,
    corsOrigins: corsOrigins === "*" ? "* (all)" : corsOrigins
  })
  
  return app
}