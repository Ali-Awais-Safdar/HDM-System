import { Hono } from "hono"
import { cors } from "hono/cors"
import { Effect } from "effect"
import { RPCHandler } from "@orpc/server/fetch"
import { onError } from "@orpc/server"
import { HTTP_CONFIG, JWT_CONFIG } from "@infra/config"
import { createContext, type RPCContext } from "./orpc/context"
import { mapToORPCError } from "./orpc/error-map"
import { procedures } from "./orpc/procedures"
import type { MiddlewareHandler } from "hono"

type Variables = {
  rpcContext: RPCContext
}

/**
 * Context Middleware
 * 
 * Implements Chain of Responsibility pattern:
 * 1. Extract Authorization header
 * 2. Verify JWT token
 * 3. Derive workspace context
 * 4. Build RPC context
 * 5. Attach to Hono context via c.set('rpcContext')
 * 
 * On failure, errors bubble up to app.onError for centralized handling
 */
const contextMiddleware: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {

  const rpcContext = await Effect.runPromise(createContext(c))
  
  c.set("rpcContext", rpcContext)
  
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

  const rpcHandler = new RPCHandler(procedures, {
    adapterInterceptors: [
      onError((error) => {
        // Log errors at the adapter level for diagnostics
        console.error("RPC adapter error:", error)
      })
    ]
  })

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
    // Always log error details for diagnostics
    console.error("Unhandled server error:", {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      path: c.req.path,
      method: c.req.method,
      timestamp: new Date().toISOString()
    })
    
    // Map errors to ORPCError format for consistent error responses
    const orpcError = mapToORPCError(error)
    const status = orpcError.status ?? 500
    return c.json(
      {
        code: orpcError.code,
        message: orpcError.message,
        data: orpcError.data
      },
      status as any // Hono's type system requires explicit status codes
    )
  })

  console.log("Hono server built successfully")
  console.log(`Health check: /health`)
  console.log(`RPC endpoint: ${HTTP_CONFIG.RPC_PREFIX}/*`)
  console.log(`CORS origins: ${corsOrigins === "*" ? "* (all)" : JSON.stringify(corsOrigins)}`)
  
  return app
}

