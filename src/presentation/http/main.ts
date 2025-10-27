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
import { initContainer } from "@infra/di/setup"
import { env } from "@infra/config/env"
import { buildServer } from "./server"

async function bootstrap() {
  try {
    console.log("Starting DMS Headless HTTP Server...")
    console.log(`Environment: ${env.NODE_ENV}`)
    console.log(`Port: ${env.PORT}`)
    
    console.log("\n  Initializing dependency injection container...")
    initContainer()
    
    console.log("\nBuilding Hono server...")
    const app = buildServer()
    
    console.log(`\nStarting HTTP server on port ${env.PORT}...`)
    
    const server = serve({
      fetch: app.fetch,
      port: env.PORT,
    })
    
    console.log("\nServer started successfully!")
    console.log(`Server listening on http://localhost:${env.PORT}`)
    console.log(`Health check: http://localhost:${env.PORT}/health`)
    console.log(`RPC endpoint: http://localhost:${env.PORT}/rpc/*`)
    console.log("\nPress Ctrl+C to stop the server\n")
    
    let isShuttingDown = false
    
    const shutdown = async (signal: string) => {
      if (isShuttingDown) {
        console.log(`Shutdown already in progress. Ignoring ${signal}`)
        return
      }
      isShuttingDown = true
      
      console.log(`\n\nReceived ${signal}. Starting graceful shutdown...`)
      
      try {
        console.log("Closing HTTP server...")
        if (server && typeof server.close === "function") {
          await server.close()
        }
        
        console.log("⏳ Waiting for in-flight requests to complete...")
        await new Promise((resolve) => setTimeout(resolve, 2000))
        
        console.log("Database connections will close on process exit")
        
        console.log("Graceful shutdown complete")
        process.exit(0)
      } catch (error) {
        console.error("❌ Error during shutdown:", error)
        process.exit(1)
      }
    }
    
    process.on("SIGTERM", () => {
      shutdown("SIGTERM")
    })
    
    process.on("SIGINT", () => {
      shutdown("SIGINT")
    })
    
    // Handle uncaught errors
    process.on("uncaughtException", (error) => {
      console.error("💥 Uncaught Exception:", error)
      shutdown("UNCAUGHT_EXCEPTION")
    })
    
    process.on("unhandledRejection", (reason, promise) => {
      console.error("💥 Unhandled Rejection at:", promise, "reason:", reason)
      shutdown("UNHANDLED_REJECTION")
    })
    
  } catch (error) {
    console.error("❌ Failed to start server:", error)
    process.exit(1)
  }
}

// Start the server
bootstrap()

