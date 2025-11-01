import { setupSharedTestDatabase, cleanupSharedTestDatabase, clearTestDatabase } from "../../infra/setup/test-database"
import type { DatabaseInterface } from "@infra/db/interfaces"

// Repositories
import { DocumentAggregateDrizzleRepository } from "@infra/repositories/document-aggregate.repository"
import { AccessPolicyDrizzleRepository } from "@infra/repositories/access-policy.repository"
import { DownloadTokenDrizzleRepository } from "@infra/repositories/download-token.repository"
import { UserDrizzleRepository } from "@infra/repositories/user.repository"

// Domain services (all static, no construction needed)
import { DocumentAccessService } from "@domain/accessPolicy/document-access.service"

// Application services
import { DocumentPolicySyncService } from "@application/services/document-policy-sync.service"

// Application workflows
import { DocumentWorkflow } from "@application/workflow/document.workflow"
import { UploadWorkflow } from "@application/workflow/upload.workflow"
import { AccessPolicyWorkflow } from "@application/workflow/access-policy.workflow"
import { DownloadTokenWorkflow } from "@application/workflow/download-token.workflow"
import { DocumentVersionWorkflow } from "@application/workflow/document-version.workflow"

// Port interfaces
import { FileStoragePort, FileStorageError, type UploadFileRequest, type UploadFileResponse, type DownloadFileResponse, type DownloadFileMetadata } from "@application/services/ports/file-storage.port"
import { PasswordHasherPort, PasswordHashError } from "@application/services/ports/password-hasher.port"
import { AuthTokenPort, AuthTokenError, type TokenPayload, type GeneratedToken } from "@application/services/ports/auth-token.port"
import { ConfigPort } from "@application/services/ports/config.port"
import { LoggerPort, type LogContext } from "@application/services/ports/logger.port"
import { AuditPort, type AuditEvent } from "@application/services/ports/audit.port"

// Effect and types
import { Effect, pipe } from "effect"
import { Sha256 } from "@domain/refined/checksum"
import { FileKey } from "@domain/refined/file-reference"
import crypto from "crypto"

// ===== InMemoryFileStoragePort =====

export class InMemoryFileStoragePort extends FileStoragePort {
  private storedFiles = new Map<FileKey, { content: Uint8Array; mimeType: string; checksum: Sha256 }>()
  
  constructor(
    private readonly responseOverrides?: {
      uploadFile?: (fileKey: FileKey) => Sha256
    }
  ) {
    super()
  }

  uploadFile(
    request: UploadFileRequest
  ): Effect.Effect<UploadFileResponse, FileStorageError> {
    return pipe(
      // Read stream to buffer
      Effect.tryPromise({
        try: async () => {
          const chunks: Uint8Array[] = []
          const reader = request.stream.getReader()
          
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              if (value) chunks.push(value)
            }
          } finally {
            reader.releaseLock()
          }
          
          // Combine chunks into single buffer
          const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
          const content = new Uint8Array(totalLength)
          let offset = 0
          for (const chunk of chunks) {
            content.set(chunk, offset)
            offset += chunk.length
          }
          
          return content
        },
        catch: (error) => new FileStorageError(
          `Failed to read stream: ${error instanceof Error ? error.message : String(error)}`,
          "UPLOAD_FAILED",
          error
        )
      }),
      
      // Calculate checksum
      Effect.flatMap((content) =>
        pipe(
          Effect.tryPromise({
            try: async () => {
              const crypto = await import("crypto")
              const hash = crypto.createHash("sha256")
              hash.update(Buffer.from(content))
              return hash.digest("hex") as Sha256
            },
            catch: (error) => new FileStorageError(
              `Failed to calculate checksum: ${error instanceof Error ? error.message : String(error)}`,
              "STORAGE_ERROR",
              error
            )
          }),
          Effect.map((checksum) => ({ content, checksum }))
        )
      ),
      
      // Generate deterministic file key
      Effect.flatMap(({ content, checksum }) =>
        pipe(
          Effect.sync(() => {
            // Generate deterministic file key from contentRef
            const hash = crypto.createHash("sha256").update(request.metadata.contentRef).digest("hex")
            const shortHash = hash.substring(0, 16)
            return `files/${shortHash}` as FileKey
          }),
          Effect.map((fileKey) => ({ fileKey, content, checksum }))
        )
      ),
      
      // Validate size
      Effect.flatMap(({ fileKey, content, checksum }) => {
        const actualSize = content.length
        if (actualSize !== request.metadata.expectedSize) {
          return Effect.fail(new FileStorageError(
            `File size mismatch: expected ${request.metadata.expectedSize}, got ${actualSize}`,
            "INVALID_REQUEST"
          ))
        }
        
        // Override checksum if provided
        const finalChecksum = this.responseOverrides?.uploadFile
          ? this.responseOverrides.uploadFile(fileKey)
          : checksum
        
        // Store file
        this.storedFiles.set(fileKey, {
          content,
          mimeType: request.metadata.mimeType,
          checksum: finalChecksum
        })
        
        return Effect.succeed({
          fileKey,
          checksum: finalChecksum,
          actualSize: actualSize as any,
          actualMimeType: request.metadata.mimeType
        })
      })
    )
  }

  downloadFile(
    fileKey: FileKey
  ): Effect.Effect<DownloadFileResponse, FileStorageError> {
    const stored = this.storedFiles.get(fileKey)
    
    if (!stored) {
      return Effect.fail(new FileStorageError(
        `File not found: ${fileKey}`,
        "NOT_FOUND"
      ))
    }
    
    // Create ReadableStream from stored content
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(stored.content)
        controller.close()
      }
    })
    
    const metadata: DownloadFileMetadata = {
      mimeType: stored.mimeType as any,
      size: stored.content.length as any,
      checksum: stored.checksum as any
    }
    
    return Effect.succeed({ stream, metadata })
  }

  // Test helpers
  getStoredFile(fileKey: FileKey) {
    return this.storedFiles.get(fileKey)
  }

  reset() {
    this.storedFiles.clear()
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

// ===== MockAuthTokenPort =====

export class MockAuthTokenPort extends AuthTokenPort {
  private tokenCount = 0
  private tokenExpirationMinutes = 15

  generateToken(payload: TokenPayload): Effect.Effect<GeneratedToken, AuthTokenError> {
    this.tokenCount++
    const token = `mock-jwt-token-${this.tokenCount}-${payload.userId}`
    const expiresAt = new Date(Date.now() + this.tokenExpirationMinutes * 60 * 1000)
    
    return Effect.succeed({
      token,
      expiresAt
    })
  }

  setTokenExpirationMinutes(minutes: number): void {
    this.tokenExpirationMinutes = minutes
  }

  reset() {
    this.tokenCount = 0
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
  documentAggregateRepository: DocumentAggregateDrizzleRepository
  accessPolicyRepository: AccessPolicyDrizzleRepository
  downloadTokenRepository: DownloadTokenDrizzleRepository
  userRepository: UserDrizzleRepository

  // Domain services
  documentAccessService: typeof DocumentAccessService

  // Ports
  fileStoragePort: InMemoryFileStoragePort
  passwordHasherPort: MockPasswordHasherPort
  authTokenPort: MockAuthTokenPort
  configPort: ConfigPort
  loggerPort: MockLoggerPort
  auditPort: MockAuditPort

  // Workflows
  documentWorkflow: DocumentWorkflow
  uploadWorkflow: UploadWorkflow
  accessPolicyWorkflow: AccessPolicyWorkflow
  downloadTokenWorkflow: DownloadTokenWorkflow
  documentVersionWorkflow: DocumentVersionWorkflow
  userWorkflow: import("@application/workflow/user.workflow").UserWorkflow

  // Lifecycle
  cleanup: () => Promise<void>
}

export async function createWorkflowTestHarness(): Promise<WorkflowTestHarness> {
  // Setup database
  const { db, cleanup: dbCleanup } = await setupSharedTestDatabase()

  // Create repositories
  const documentAggregateRepository = new DocumentAggregateDrizzleRepository(db)
  const accessPolicyRepository = new AccessPolicyDrizzleRepository(db)
  const downloadTokenRepository = new DownloadTokenDrizzleRepository(db)
  const userRepository = new UserDrizzleRepository(db)

  // Create ports
  const fileStoragePort = new InMemoryFileStoragePort()
  const passwordHasherPort = new MockPasswordHasherPort()
  const authTokenPort = new MockAuthTokenPort()
  const loggerPort = new MockLoggerPort()
  const auditPort = new MockAuditPort()
  
  // AccessPolicyWorkflow dependencies  
  const accessPolicyWorkflow = new AccessPolicyWorkflow(
    accessPolicyRepository,
    documentAggregateRepository,
    userRepository,
    auditPort
  )

  // DocumentPolicySyncService
  const documentPolicySyncService = new DocumentPolicySyncService(
    accessPolicyRepository
  )

  // DocumentWorkflow dependencies
  const documentWorkflow = new DocumentWorkflow(
    downloadTokenRepository,
    accessPolicyRepository,
    userRepository,
    documentAggregateRepository,
    accessPolicyWorkflow,
    documentPolicySyncService,
    auditPort
  )

  // UploadWorkflow dependencies
  const uploadWorkflow = new UploadWorkflow(
    documentAggregateRepository,
    accessPolicyRepository,
    userRepository,
    fileStoragePort,
    auditPort
  )

  // DownloadTokenWorkflow dependencies
  const downloadTokenWorkflow = new DownloadTokenWorkflow(
    downloadTokenRepository,
    documentAggregateRepository,
    userRepository,
    accessPolicyRepository,
    fileStoragePort,
    auditPort
  )

  // DocumentVersionWorkflow dependencies
  const documentVersionWorkflow = new DocumentVersionWorkflow(
    documentAggregateRepository,
    userRepository,
    accessPolicyRepository
  )

  // UserWorkflow dependencies
  const { UserWorkflow } = await import("@application/workflow/user.workflow")
  const userWorkflow = new UserWorkflow(
    userRepository,
    passwordHasherPort,
    authTokenPort,
    auditPort
  )

  return {
    db,
    documentAggregateRepository,
    accessPolicyRepository,
    downloadTokenRepository,
    userRepository,
    documentAccessService: DocumentAccessService,
    fileStoragePort,
    passwordHasherPort,
    authTokenPort,
    configPort: MockConfigPort,
    loggerPort,
    auditPort,
    documentWorkflow,
    uploadWorkflow,
    accessPolicyWorkflow,
    downloadTokenWorkflow,
    documentVersionWorkflow,
    userWorkflow,
    cleanup: async () => {
      fileStoragePort.reset()
      passwordHasherPort.reset()
      authTokenPort.reset()
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
    harness.authTokenPort.reset()
    harness.loggerPort.clear()
    harness.auditPort.clear()
  }
}

