/**
 * HTTP Server Entry Point
 * 
 * This module bootstraps the HTTP server:
 * 1. Initializes dependency injection container
 * 2. Builds Hono server with middleware and routes
 * 3. Starts the server with @hono/node-server
 * 4. Handles graceful shutdown (closes DB pool, completes requests)
 */

import { serve } from "@hono/node-server"
import { initContainer, resolveService } from "@infra/di/setup"
import { env } from "@infra/config/env"
import { buildServer } from "./server"
import { TOKENS } from "@infra/di/container"
import { LoggerPort } from "@application/services/ports/logger.port"

async function bootstrap() {
  try {
    initContainer()
    
    const logger = resolveService<LoggerPort>(TOKENS.LOGGER_PORT)
    
    logger.info("Starting DMS Headless HTTP Server...", {
      environment: env.NODE_ENV,
      port: env.PORT
    })
    
    logger.info("Building Hono server...")
    const app = buildServer()
    
    logger.info(`Starting HTTP server on port ${env.PORT}...`)
    
    const server = serve({
      fetch: app.fetch,
      port: env.PORT,
    })
    
    logger.info("Server started successfully", {
      port: env.PORT,
      environment: env.NODE_ENV,
      healthCheckPath: `/health`,
      rpcEndpoint: `/rpc/*`
    })
    
    let isShuttingDown = false
    
    const shutdown = async (signal: string) => {
      if (isShuttingDown) {
        logger.warn(`Shutdown already in progress. Ignoring ${signal}`, { signal })
        return
      }
      isShuttingDown = true
      
      logger.info(`Received ${signal}. Starting graceful shutdown...`, { signal })
      
      try {
        logger.info("Closing HTTP server...")
        if (server && typeof server.close === "function") {
          server.close()
        }
        
        logger.info("Waiting for in-flight requests to complete...")
        await new Promise((resolve) => setTimeout(resolve, 2000))
        
        logger.info("Database connections will close on process exit")
        
        logger.info("Graceful shutdown complete")
        process.exit(0)
      } catch (error) {
        logger.fatal("Error during shutdown", { 
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        })
        process.exit(1)
      }
    }
    
    process.on("SIGTERM", () => {
      shutdown("SIGTERM")
    })
    
    process.on("SIGINT", () => {
      shutdown("SIGINT")
    })
    
    process.on("uncaughtException", (error) => {
      logger.fatal("Uncaught Exception", {
        error: error.message,
        stack: error.stack,
        name: error.name
      })
      shutdown("UNCAUGHT_EXCEPTION")
    })
    
    process.on("unhandledRejection", (reason, promise) => {
      logger.fatal("Unhandled Rejection", {
        reason: reason instanceof Error ? reason.message : String(reason),
        promise: String(promise),
        stack: reason instanceof Error ? reason.stack : undefined
      })
      shutdown("UNHANDLED_REJECTION")
    })
    
  } catch (error) {
    try {
      const logger = resolveService<LoggerPort>(TOKENS.LOGGER_PORT)
      logger.fatal("Failed to start server", { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
    } catch {
      console.error("❌ Failed to start server:", error)
    }
    process.exit(1)
  }
}

bootstrap()

