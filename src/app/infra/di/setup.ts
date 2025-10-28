import "reflect-metadata"
import { container } from "tsyringe"
import type { DependencyContainer } from "tsyringe"

// Infrastructure
import { db } from "@infra/db/connection"
import type { DatabaseInterface } from "@infra/db/interfaces"
import { loadConfig } from "@infra/config/env-config"
import type { ConfigPort } from "@application/services/ports/config.port"

// Repositories
import { DocumentDrizzleRepository } from "@infra/repositories/document.repository"
import { DocumentVersionDrizzleRepository } from "@infra/repositories/document-version.repository"
import { AccessPolicyDrizzleRepository } from "@infra/repositories/access-policy.repository"
import { DownloadTokenDrizzleRepository } from "@infra/repositories/download-token.repository"
import { UserDrizzleRepository } from "@infra/repositories/user.repository"

// Domain Services
import { BcryptPasswordHasher } from "@infra/services/bcrypt-password-hasher"

// Infrastructure Services
import { LocalFileStorage } from "@infra/services/local-file-storage"
import { PinoLogger } from "@infra/services/logger.pino"
import { AuditRepository } from "@infra/services/audit.repository"

// Application Workflows
import { DocumentWorkflow } from "@application/workflow/document.workflow"
import { DocumentVersionWorkflow } from "@application/workflow/document-version.workflow"
import { AccessPolicyWorkflow } from "@application/workflow/access-policy.workflow"
import { UploadWorkflow } from "@application/workflow/upload.workflow"
import { DownloadTokenWorkflow } from "@application/workflow/download-token.workflow"

// DI Tokens
import { TOKENS } from "./container"

let isInitialized = false

/**
 * Initialize the dependency injection container
 * 
 * This function registers all dependencies following the Chain of Responsibility pattern:
 * 1. Configuration adapter (env → ConfigPort)
 * 2. Database connection (shared singleton)
 * 3. Repository implementations (Drizzle-based)
 * 4. Domain services (PasswordHasher)
 * 5. Application workflows (decorated with @injectable)
 */
export function initContainer(): void {
  if (isInitialized) {
    console.warn("⚠️  Container already initialized. Skipping duplicate initialization.")
    return
  }

  const config: ConfigPort = loadConfig()
  container.registerInstance(TOKENS.CONFIG_PORT, config)

  container.registerInstance<DatabaseInterface>(TOKENS.DATABASE_CONNECTION, db)

  container.registerSingleton(TOKENS.DOCUMENT_REPOSITORY, DocumentDrizzleRepository)
  container.registerSingleton(TOKENS.DOCUMENT_VERSION_REPOSITORY, DocumentVersionDrizzleRepository)
  container.registerSingleton(TOKENS.ACCESS_POLICY_REPOSITORY, AccessPolicyDrizzleRepository)
  container.registerSingleton(TOKENS.DOWNLOAD_TOKEN_REPOSITORY, DownloadTokenDrizzleRepository)
  container.registerSingleton(TOKENS.USER_REPOSITORY, UserDrizzleRepository)

  container.registerSingleton(TOKENS.PASSWORD_HASHER_PORT, BcryptPasswordHasher)

  container.registerSingleton(TOKENS.FILE_STORAGE_PORT, LocalFileStorage)
  
  container.registerSingleton(TOKENS.LOGGER_PORT, PinoLogger)
  
  container.registerSingleton(TOKENS.AUDIT_PORT, AuditRepository)

  container.registerSingleton(TOKENS.DOCUMENT_WORKFLOW, DocumentWorkflow)
  container.registerSingleton(TOKENS.DOCUMENT_VERSION_WORKFLOW, DocumentVersionWorkflow)
  container.registerSingleton(TOKENS.ACCESS_POLICY_WORKFLOW, AccessPolicyWorkflow)
  container.registerSingleton(TOKENS.UPLOAD_WORKFLOW, UploadWorkflow)
  container.registerSingleton(TOKENS.DOWNLOAD_TOKEN_WORKFLOW, DownloadTokenWorkflow)

  isInitialized = true
  console.log("✅ Dependency injection container initialized successfully")
}

export function resolveWorkflow<T>(token: symbol): T {
  if (!isInitialized) {
    throw new Error("Container not initialized. Call initContainer() first.")
  }
  
  const workflow = container.resolve<T>(token)
  if (!workflow) {
    throw new Error(`Failed to resolve workflow for token: ${token.toString()}`)
  }
  return workflow
}

export function resolveService<T>(token: symbol): T {
  if (!isInitialized) {
    throw new Error("Container not initialized. Call initContainer() first.")
  }
  
  const service = container.resolve<T>(token)
  if (!service) {
    throw new Error(`Failed to resolve service for token: ${token.toString()}`)
  }
  return service
}

export function getContainer(): DependencyContainer {
  return container
}

export function resetContainer(): void {
  container.clearInstances()
  isInitialized = false
}

export function isContainerInitialized(): boolean {
  return isInitialized
}

