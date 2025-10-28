import { setupSharedTestDatabase, cleanupSharedTestDatabase, clearTestDatabase } from "../../infra/setup/test-database"
import type { DatabaseInterface } from "@infra/db/interfaces"

// Repositories
import { DocumentDrizzleRepository } from "@infra/repositories/document.repository"
import { DocumentVersionDrizzleRepository } from "@infra/repositories/document-version.repository"
import { AccessPolicyDrizzleRepository } from "@infra/repositories/access-policy.repository"
import { DownloadTokenDrizzleRepository } from "@infra/repositories/download-token.repository"
import { UserDrizzleRepository } from "@infra/repositories/user.repository"

// Domain services (all static, no construction needed)
import { DocumentAccessService } from "@domain/accessPolicy/document-access.service"

// Application workflows
import { DocumentWorkflow } from "@application/workflow/document.workflow"
import { UploadWorkflow } from "@application/workflow/upload.workflow"
import { AccessPolicyWorkflow } from "@application/workflow/access-policy.workflow"
import { DownloadTokenWorkflow } from "@application/workflow/download-token.workflow"
import { DocumentVersionWorkflow } from "@application/workflow/document-version.workflow"

// Port interfaces
import { FileStoragePort, FileStorageError, InitiateUploadStorageRequest, InitiateUploadStorageResponse, CompleteUploadRequest, CompleteUploadResponse, UploadMetadata } from "@application/services/ports/file-storage.port"
import { PasswordHasherPort, PasswordHashError } from "@application/services/ports/password-hasher.port"
import { ConfigPort } from "@application/services/ports/config.port"
import { LoggerPort, type LogContext } from "@application/services/ports/logger.port"
import { AuditPort, type AuditEvent } from "@application/services/ports/audit.port"

// Effect and types
import { Effect } from "effect"
import { Sha256 } from "@domain/refined/checksum"
import { FileKey } from "@domain/refined/file-reference"

// ===== InMemoryFileStoragePort =====

export class InMemoryFileStoragePort extends FileStoragePort {
  private uploadIntents = new Map<string, UploadMetadata>()
  private completedUploads = new Map<string, { checksum: Sha256; completedAt: Date }>()
  
  constructor(
    private readonly responseOverrides?: {
      createUploadUrl?: (contentRef: string) => string
      completeUpload?: (contentRef: string) => Sha256
    }
  ) {
    super()
  }

  createUploadUrl(
    request: InitiateUploadStorageRequest
  ): Effect.Effect<InitiateUploadStorageResponse, FileStorageError> {
    // Store upload intent
    const uploadMetadata = {
      documentId: request.documentId,
      userId: request.userId,
      contentRef: request.contentRef,
      expectedSize: request.fileSize,
      expectedMimeType: request.mimeType,
      initiatedAt: new Date(),
      expiresAt: new Date(Date.now() + request.expiryMs)
    }
    
    this.uploadIntents.set(request.contentRef, uploadMetadata)
    
    // Generate upload URL (can be overridden for testing)
    const uploadUrl = this.responseOverrides?.createUploadUrl
      ? this.responseOverrides.createUploadUrl(request.contentRef)
      : `http://test-storage.local/uploads/${request.contentRef}`
    
    const response: InitiateUploadStorageResponse = {
      uploadUrl,
      fileKey: `files/${request.contentRef}` as FileKey,
      contentRef: request.contentRef,
      expiresAt: uploadMetadata.expiresAt,
      uploadMetadata
    }
    
    return Effect.succeed(response)
  }

  completeUpload(
    request: CompleteUploadRequest
  ): Effect.Effect<CompleteUploadResponse, FileStorageError> {
    // Check if upload intent exists
    const uploadMetadata = this.uploadIntents.get(request.contentRef)
    
    if (!uploadMetadata) {
      return Effect.fail(new FileStorageError(
        `Upload not found for contentRef: ${request.contentRef}`,
        "NOT_FOUND"
      ))
    }
    
    // Validate metadata against request
    const contentRefMatch = uploadMetadata.contentRef === request.contentRef
    const sizeMatch = uploadMetadata.expectedSize === request.expectedSize
    const mimeTypeMatch = uploadMetadata.expectedMimeType === request.expectedMimeType
    
    // ContentRef mismatch is critical - fail immediately
    if (!contentRefMatch) {
      return Effect.fail(new FileStorageError(
        `ContentRef mismatch: expected ${request.contentRef}, got ${uploadMetadata.contentRef}`,
        "INVALID_REQUEST"
      ))
    }
    
    // Mark as completed
    // Use a deterministic hex checksum based on contentRef for testing
    const deterministicHash = (seed: string): Sha256 => {
      // Convert seed to hex and pad to 64 chars
      return Buffer.from(seed).toString('hex').padEnd(64, '0').substring(0, 64) as Sha256
    }
    
    const checksum = this.responseOverrides?.completeUpload
      ? this.responseOverrides.completeUpload(request.contentRef)
      : deterministicHash(request.contentRef)
    
    this.completedUploads.set(request.contentRef, {
      checksum,
      completedAt: new Date()
    })
    
    const response: CompleteUploadResponse = {
      fileKey: request.fileKey,
      actualSize: request.expectedSize,
      actualMimeType: request.expectedMimeType,
      checksum,
      completedAt: new Date(),
      verificationMetadata: {
        sizeValid: sizeMatch,
        mimeTypeValid: mimeTypeMatch,
        contentRefValid: contentRefMatch,
        warnings: []
      }
    }
    
    return Effect.succeed(response)
  }

  // Test helpers
  getUploadIntent(contentRef: string) {
    return this.uploadIntents.get(contentRef)
  }

  getCompletedUpload(contentRef: string) {
    return this.completedUploads.get(contentRef)
  }

  reset() {
    this.uploadIntents.clear()
    this.completedUploads.clear()
  }
}

// ===== MockPasswordHasherPort =====

export class MockPasswordHasherPort extends PasswordHasherPort {
  private knownHashes = new Map<string, string>()

  hash(password: string): Effect.Effect<string, PasswordHashError> {
    const hash = `$2b$10$${password}` // Simple mock hash
    this.knownHashes.set(hash, password)
    return Effect.succeed(hash)
  }

  verify(password: string, hash: string): Effect.Effect<boolean, PasswordHashError> {
    const storedPassword = this.knownHashes.get(hash)
    return Effect.succeed(storedPassword === password)
  }

  reset() {
    this.knownHashes.clear()
  }
}

// ===== MockLoggerPort =====

export class MockLoggerPort extends LoggerPort {
  private logs: Array<{ level: string; message: string; context?: LogContext }> = []
  private childContext?: LogContext

  constructor(private readonly captureLogs: boolean = true) {
    super()
  }

  trace(message: string, context?: LogContext): void {
    if (this.captureLogs) {
      this.logs.push({ level: "trace", message, context: { ...this.childContext, ...context } })
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.captureLogs) {
      this.logs.push({ level: "debug", message, context: { ...this.childContext, ...context } })
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.captureLogs) {
      this.logs.push({ level: "info", message, context: { ...this.childContext, ...context } })
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.captureLogs) {
      this.logs.push({ level: "warn", message, context: { ...this.childContext, ...context } })
    }
  }

  error(message: string, context?: LogContext): void {
    if (this.captureLogs) {
      this.logs.push({ level: "error", message, context: { ...this.childContext, ...context } })
    }
  }

  fatal(message: string, context?: LogContext): void {
    if (this.captureLogs) {
      this.logs.push({ level: "fatal", message, context: { ...this.childContext, ...context } })
    }
  }

  child(context: LogContext): LoggerPort {
    const childLogger = new MockLoggerPort(this.captureLogs)
    childLogger.childContext = { ...this.childContext, ...context }
    return childLogger
  }

  getLogs() {
    return [...this.logs]
  }

  getLogsByLevel(level: string) {
    return this.logs.filter(log => log.level === level)
  }

  clear() {
    this.logs = []
  }
}

// ===== MockAuditPort =====

export class MockAuditPort extends AuditPort {
  private events: AuditEvent[] = []

  record(event: AuditEvent): Effect.Effect<void, import("@application/services/ports/audit.port").AuditError, never> {
    this.events.push(event)
    return Effect.succeed(undefined)
  }

  queryByResource(
    resourceType: string,
    resourceId: string
  ): Effect.Effect<readonly AuditEvent[], import("@application/services/ports/audit.port").AuditError, never> {
    const filtered = this.events.filter(e => e.resourceType === resourceType && e.resourceId === resourceId)
    return Effect.succeed(filtered)
  }

  getEvents(): readonly AuditEvent[] {
    return [...this.events]
  }

  getEventsByResource(resourceType: string, resourceId: string): readonly AuditEvent[] {
    return this.events.filter(e => e.resourceType === resourceType && e.resourceId === resourceId)
  }

  getEventsByAction(action: string): readonly AuditEvent[] {
    return this.events.filter(e => e.action === action)
  }

  getEventsByActor(actorId: string): readonly AuditEvent[] {
    return this.events.filter(e => e.actorId === actorId)
  }

  clear(): void {
    this.events = []
  }
}

// ===== MockConfigPort =====

export const MockConfigPort: ConfigPort = {
  NODE_ENV: "test",
  PORT: 3000,
  DATABASE_URL: "postgresql://test:test@localhost:5432/test_db",
  DATABASE_POOL_SIZE: 10,
  DATABASE_TIMEOUT: 30000,
  JWT_SECRET: "test-jwt-secret-key",
  JWT_EXPIRES_IN: "15m",
  JWT_REFRESH_EXPIRES_IN: "7d",
  BCRYPT_SALT_ROUNDS: 10,
  STORAGE_PATH: "./storage",
  ALLOWED_MIME_TYPES: ["application/pdf", "text/plain", "image/jpeg", "image/png"],
  CORS_ORIGINS: "*",
  DOWNLOAD_TOKEN_CLOCK_SKEW_TOLERANCE_MS: 5000,
  LOG_LEVEL: "error",
  LOG_FORMAT: "json",
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_MAX_REQUESTS: 100,
  HEALTH_CHECK_TIMEOUT: 5000,
}

// ===== Test Harness =====

export interface WorkflowTestHarness {
  // Database
  db: DatabaseInterface

  // Repositories
  documentRepository: DocumentDrizzleRepository
  documentVersionRepository: DocumentVersionDrizzleRepository
  accessPolicyRepository: AccessPolicyDrizzleRepository
  downloadTokenRepository: DownloadTokenDrizzleRepository
  userRepository: UserDrizzleRepository

  // Domain services
  documentAccessService: typeof DocumentAccessService

  // Ports
  fileStoragePort: InMemoryFileStoragePort
  passwordHasherPort: MockPasswordHasherPort
  configPort: ConfigPort
  loggerPort: MockLoggerPort
  auditPort: MockAuditPort

  // Workflows
  documentWorkflow: DocumentWorkflow
  uploadWorkflow: UploadWorkflow
  accessPolicyWorkflow: AccessPolicyWorkflow
  downloadTokenWorkflow: DownloadTokenWorkflow
  documentVersionWorkflow: DocumentVersionWorkflow

  // Lifecycle
  cleanup: () => Promise<void>
}

export async function createWorkflowTestHarness(): Promise<WorkflowTestHarness> {
  // Setup database
  const { db, cleanup: dbCleanup } = await setupSharedTestDatabase()

  // Create repositories
  const documentRepository = new DocumentDrizzleRepository(db)
  const documentVersionRepository = new DocumentVersionDrizzleRepository(db)
  const accessPolicyRepository = new AccessPolicyDrizzleRepository(db)
  const downloadTokenRepository = new DownloadTokenDrizzleRepository(db)
  const userRepository = new UserDrizzleRepository(db)

  // Create ports
  const fileStoragePort = new InMemoryFileStoragePort()
  const passwordHasherPort = new MockPasswordHasherPort()
  const loggerPort = new MockLoggerPort()
  const auditPort = new MockAuditPort()
  
  // AccessPolicyWorkflow dependencies  
  const accessPolicyWorkflow = new AccessPolicyWorkflow(
    accessPolicyRepository,
    documentRepository,
    userRepository,
    auditPort
  )

  // DocumentWorkflow dependencies
  const documentWorkflow = new DocumentWorkflow(
    documentRepository,
    documentVersionRepository,
    downloadTokenRepository,
    accessPolicyRepository,
    userRepository,
    accessPolicyWorkflow,
    auditPort
  )

  // UploadWorkflow dependencies
  const uploadWorkflow = new UploadWorkflow(
    documentRepository,
    documentVersionRepository,
    accessPolicyRepository,
    userRepository,
    fileStoragePort,
    auditPort,
    loggerPort
  )

  // DownloadTokenWorkflow dependencies
  const downloadTokenWorkflow = new DownloadTokenWorkflow(
    downloadTokenRepository,
    documentRepository,
    userRepository,
    accessPolicyRepository,
    auditPort
  )

  // DocumentVersionWorkflow dependencies
  const documentVersionWorkflow = new DocumentVersionWorkflow(
    documentVersionRepository,
    documentRepository,
    userRepository,
    accessPolicyRepository
  )

  return {
    db,
    documentRepository,
    documentVersionRepository,
    accessPolicyRepository,
    downloadTokenRepository,
    userRepository,
    documentAccessService: DocumentAccessService,
    fileStoragePort,
    passwordHasherPort,
    configPort: MockConfigPort,
    loggerPort,
    auditPort,
    documentWorkflow,
    uploadWorkflow,
    accessPolicyWorkflow,
    downloadTokenWorkflow,
    documentVersionWorkflow,
    cleanup: async () => {
      fileStoragePort.reset()
      passwordHasherPort.reset()
      loggerPort.clear()
      auditPort.clear()
      await dbCleanup()
      await cleanupSharedTestDatabase()
    }
  }
}

// Lifecycle hooks helper
export interface WorkflowTestLifecycle {
  beforeAll: () => Promise<WorkflowTestHarness>
  afterAll: (harness: WorkflowTestHarness) => Promise<void>
  beforeEach: (harness: WorkflowTestHarness) => Promise<void>
}

export const workflowTestLifecycle: WorkflowTestLifecycle = {
  beforeAll: async () => {
    return await createWorkflowTestHarness()
  },

  afterAll: async (harness: WorkflowTestHarness) => {
    await harness.cleanup()
  },

  beforeEach: async (harness: WorkflowTestHarness) => {
    await clearTestDatabase(harness.db)
    harness.fileStoragePort.reset()
    harness.passwordHasherPort.reset()
    harness.loggerPort.clear()
    harness.auditPort.clear()
  }
}

