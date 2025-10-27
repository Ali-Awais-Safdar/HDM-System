import { env } from "@infra/config/env"

/**
 * HTTP/RPC Server Configuration
 * 
 * This configuration centralizes all HTTP and oRPC related settings for the application.
 * Following the Chain of Responsibility pattern, requests flow through:
 * 1. CORS middleware (cross-origin handling)
 * 2. JWT authentication middleware (validates tokens)
 * 3. oRPC handlers (processes RPC calls)
 */

export const RPC_ROUTE_PREFIX = "/rpc" as const


export const HTTP_CONFIG = {

  PORT: env.PORT,

  RPC_PREFIX: RPC_ROUTE_PREFIX,
  
  CORS: {
    ORIGINS: env.CORS_ORIGINS,
    CREDENTIALS: true,
    MAX_AGE: 600, // 10 minutes
  },
  
  LIMITS: {
    MAX_JSON_SIZE: "10mb",
    MAX_FILE_SIZE: env.MAX_FILE_SIZE || 10 * 1024 * 1024, // 10MB default
  },
} as const

export const JWT_CONFIG = {

  SECRET: env.JWT_SECRET,
  
  EXPIRES_IN: env.JWT_EXPIRES_IN,
  
  REFRESH_EXPIRES_IN: env.JWT_REFRESH_EXPIRES_IN,
  
  HEADER_NAME: "Authorization" as const,
  
  TOKEN_PREFIX: "Bearer " as const,
  
  ALGORITHM: "HS256" as const,
} as const

export type HttpConfig = typeof HTTP_CONFIG
export type JwtConfig = typeof JWT_CONFIG

