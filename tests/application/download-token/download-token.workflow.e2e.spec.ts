import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { promises as fs } from "fs"
import * as path from "path"
import { Effect } from "effect"
import { DownloadTokenWorkflow } from "@application/workflow/download-token.workflow"
import type { FileStoragePort } from "@application/services/ports/file-storage.port"
import { LocalFileStorage } from "@infra/services/local-file-storage"
import { MockConfigPort } from "../setup/test-harness"
import { seedTestActors } from "../fixtures/actors"
import { seedDocumentWithReadWriteAccess } from "../fixtures/documents"
import { expectAsyncSuccess } from "../../utils/test.helpers"
import { withTestClock } from "../../domain/setup/test-clock"
import type { DocumentId, UserId, WorkspaceId } from "@domain/refined/ids"
import type { CreateDownloadTokenCommandEncoded } from "@application/dto/downloadToken/commands.dto"
import { setupSharedTestDatabase, cleanupSharedTestDatabase, clearTestDatabase } from "../../infra/setup/test-database"
import type { DatabaseInterface } from "@infra/db/interfaces"
import { DocumentAggregateDrizzleRepository } from "@infra/repositories/document-aggregate.repository"
import { AccessPolicyDrizzleRepository } from "@infra/repositories/access-policy.repository"
import { UserDrizzleRepository } from "@infra/repositories/user.repository"
import { DownloadTokenDrizzleRepository } from "@infra/repositories/download-token.repository"
import type { AuditEvent } from "@application/services/ports/audit.port"
import { Option } from "effect"
import { UploadWorkflow } from "@application/workflow/upload.workflow"
import type { InitiateUploadCommandEncoded, ConfirmUploadCommandEncoded } from "@application/dto/document/commands.dto"
import { makeConfirmUploadRequest } from "../fixtures/uploads"
import type { FileKey, MimeType, FileSize } from "@domain/refined/file-reference"
import type { DownloadFileWithTokenCommandEncoded } from "@application/dto/downloadToken/commands.dto"

describe("DownloadTokenWorkflow - End to End Token Creation", () => {
  let downloadTokenWorkflow: DownloadTokenWorkflow
  let uploadWorkflow: UploadWorkflow
  let fileStoragePort: FileStoragePort
  let db: DatabaseInterface
  let storagePath: string
  let actors: Awaited<ReturnType<typeof seedTestActors>>
  let auditEvents: AuditEvent[]

  beforeAll(async () => {
    // Setup database
    const testDb = await setupSharedTestDatabase()
    db = testDb.db
    
    // Create test storage directory
    storagePath = path.join(process.cwd(), "test-storage")
    await fs.mkdir(storagePath, { recursive: true })
    
    // Override config port with test storage path
    const configPort = { ...MockConfigPort, STORAGE_PATH: storagePath }
    
    // Create LocalFileStorage with test config
    fileStoragePort = new LocalFileStorage(
      configPort as any,
      {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        trace: () => {},
        fatal: () => {},
        child: () => ({
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
          trace: () => {},
          fatal: () => {},
          child: () => {}
        })
      } as any
    )
    
    // Create repositories
    const documentAggregateRepository = new DocumentAggregateDrizzleRepository(db)
    const accessPolicyRepository = new AccessPolicyDrizzleRepository(db)
    const userRepository = new UserDrizzleRepository(db)
    const downloadTokenRepository = new DownloadTokenDrizzleRepository(db)
    
    // Create audit port mock that captures events
    auditEvents = []
    const auditPort = {
      record: (event: AuditEvent) => {
        auditEvents.push(event)
        return Effect.succeed(undefined)
      }
    } as any
    
    // Create download token workflow with LocalFileStorage
    downloadTokenWorkflow = new DownloadTokenWorkflow(
      downloadTokenRepository,
      documentAggregateRepository,
      userRepository,
      accessPolicyRepository,
      fileStoragePort,
      auditPort
    )
    
    // Create upload workflow for setting up files for download
    uploadWorkflow = new UploadWorkflow(
      documentAggregateRepository,
      accessPolicyRepository,
      userRepository,
      fileStoragePort,
      auditPort
    )
    
    // Seed actors
    actors = await seedTestActors(db)
  })

  afterAll(async () => {
    // Cleanup storage directory
    try {
      await fs.rm(storagePath, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
    
    // Cleanup database
    await cleanupSharedTestDatabase()
  })

  beforeEach(async () => {
    // Clear database
    await clearTestDatabase(db)
    
    // Clear storage directory
    try {
      const files = await fs.readdir(storagePath)
      for (const file of files) {
        await fs.rm(path.join(storagePath, file), { recursive: true, force: true })
      }
    } catch {
      // Ignore cleanup errors
    }
    
    // Clear audit events
    auditEvents = []
    
    // Re-seed actors
    actors = await seedTestActors(db)
  })

  describe("createDownloadToken - Token Creation", () => {
    it("should create download token and verify it is stored", async () => {
      // Seed document with read access
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      // Create token request
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes from now
      const request: CreateDownloadTokenCommandEncoded = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        issuedTo: actors.owner.id,
        expiresAt: expiresAt.toISOString()
      }

      // Create token
      const response = await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.createDownloadToken(request),
          Date.now()
        )
      )

      // Verify response includes token information
      expect(response.id).toBeDefined()
      expect(response.token).toBeDefined()
      expect(response.documentId).toBe(document.id)
      expect(response.issuedTo).toBe(actors.owner.id)
      expect(response.expiresAt).toBeDefined()
      expect(response.createdAt).toBeDefined()

      // Verify token can be retrieved from database
      const downloadTokenRepository = new DownloadTokenDrizzleRepository(db)
      const tokenOption = await Effect.runPromise(
        withTestClock(
          downloadTokenRepository.findByToken(response.token),
          Date.now()
        )
      )

      expect(tokenOption._tag).toBe("Some")
      if (tokenOption._tag === "Some") {
        const storedToken = tokenOption.value
        expect(storedToken.id).toBe(response.id)
        expect(storedToken.token).toBe(response.token)
        expect(storedToken.documentId).toBe(document.id)
        expect(storedToken.issuedTo).toBe(actors.owner.id)
        expect(storedToken.expiresAt).toBeDefined()
        expect(Option.isNone(storedToken.usedAt)).toBe(true) // Should not be used yet
      }
    })

    it("should verify token includes correct metadata", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      // Create token with specific expiry
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes from now
      const request: CreateDownloadTokenCommandEncoded = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        issuedTo: actors.collaborator.id,
        expiresAt: expiresAt.toISOString()
      }

      const response = await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.createDownloadToken(request),
          Date.now()
        )
      )

      // Verify token metadata
      expect(response.documentId).toBe(document.id)
      expect(response.issuedTo).toBe(actors.collaborator.id)
      
      // Verify expiry time matches (within 1 second tolerance)
      const responseExpiresAt = new Date(response.expiresAt)
      const timeDiff = Math.abs(responseExpiresAt.getTime() - expiresAt.getTime())
      expect(timeDiff).toBeLessThan(1000) // Within 1 second

      // Verify token is unique
      expect(response.token.length).toBeGreaterThan(0)
      expect(typeof response.token).toBe("string")

      // Verify token has URL-safe base64 format (base64url)
      // Should not contain + or / characters (replaced with - and _ in base64url)
      expect(response.token).not.toContain("+")
      expect(response.token).not.toContain("/")
      expect(response.token).not.toContain("=") // Usually no padding in base64url
    })

    it("should record audit log when creating token", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      // Clear audit events before creation
      auditEvents = []

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
      const request: CreateDownloadTokenCommandEncoded = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        issuedTo: actors.owner.id,
        expiresAt: expiresAt.toISOString()
      }

      const response = await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.createDownloadToken(request),
          Date.now()
        )
      )

      // Verify audit log was recorded
      expect(auditEvents.length).toBeGreaterThan(0)

      // Find create audit event
      const createEvent = auditEvents.find(
        event => event.action === "create" && event.resourceType === "download_token"
      )

      expect(createEvent).toBeDefined()
      if (createEvent) {
        expect(createEvent.actorId).toBe(actors.owner.id)
        expect(createEvent.workspaceId).toBe(document.workspaceId)
        expect(createEvent.resourceType).toBe("download_token")
        expect(createEvent.resourceId).toBe(response.id as any)
        expect(createEvent.action).toBe("create")
        expect(createEvent.outcome).toBe("success")
        expect(createEvent.metadata).toBeDefined()
        if (createEvent.metadata) {
          expect(createEvent.metadata.documentId).toBe(document.id)
          expect(createEvent.metadata.issuedTo).toBe(actors.owner.id)
          expect(createEvent.metadata.expiresAt).toBe(expiresAt.toISOString())
        }
      }
    })

    it("should verify token can be retrieved", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
      const request: CreateDownloadTokenCommandEncoded = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        issuedTo: actors.owner.id,
        expiresAt: expiresAt.toISOString()
      }

      const response = await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.createDownloadToken(request),
          Date.now()
        )
      )

      // Retrieve token by ID
      const downloadTokenRepository = new DownloadTokenDrizzleRepository(db)
      const tokenByIdOption = await Effect.runPromise(
        withTestClock(
          downloadTokenRepository.findById(response.id as any),
          Date.now()
        )
      )

      expect(tokenByIdOption._tag).toBe("Some")
      if (tokenByIdOption._tag === "Some") {
        const retrievedToken = tokenByIdOption.value
        expect(retrievedToken.id).toBe(response.id)
        expect(retrievedToken.token).toBe(response.token)
        expect(retrievedToken.documentId).toBe(document.id)
        expect(retrievedToken.issuedTo).toBe(actors.owner.id)
      }

      // Retrieve token by token string
      const tokenByStringOption = await Effect.runPromise(
        withTestClock(
          downloadTokenRepository.findByToken(response.token),
          Date.now()
        )
      )

      expect(tokenByStringOption._tag).toBe("Some")
      if (tokenByStringOption._tag === "Some") {
        const retrievedToken = tokenByStringOption.value
        expect(retrievedToken.id).toBe(response.id)
        expect(retrievedToken.token).toBe(response.token)
      }
    })

    it("should verify token validation works", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      // Create token
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
      const createRequest: CreateDownloadTokenCommandEncoded = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        issuedTo: actors.owner.id,
        expiresAt: expiresAt.toISOString()
      }

      const createResponse = await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.createDownloadToken(createRequest),
          Date.now()
        )
      )

      // Validate token
      const validateRequest = {
        token: createResponse.token,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId
      }

      const validateResponse = await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.validateDownloadToken(validateRequest),
          Date.now()
        )
      )

      // Verify validation succeeds
      expect(validateResponse.valid).toBe(true)
      expect(validateResponse.token).toBeDefined()
      if (validateResponse.token) {
        expect(validateResponse.token.id).toBe(createResponse.id)
        expect(validateResponse.token.token).toBe(createResponse.token)
        expect(validateResponse.token.documentId).toBe(document.id)
      }
      expect(validateResponse.reason).toBeUndefined()
    })

    it("should fail validation for non-existent token", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      // Try to validate non-existent token (use valid token format that doesn't exist in DB)
      const { faker } = await import("../../domain/factories/common")
      const validateRequest = {
        token: faker.string.alphanumeric({ length: { min: 32, max: 48 } }) as any,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId
      }

      const validateResponse = await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.validateDownloadToken(validateRequest),
          Date.now()
        )
      )

      // Verify validation fails
      expect(validateResponse.valid).toBe(false)
      expect(validateResponse.token).toBeUndefined()
      expect(validateResponse.reason).toBe("NOT_FOUND")
    })

    it("should require read permission to create token", async () => {
      // Create document without giving collaborator access
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      // Try to create token as collaborator (who doesn't have access)
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
      const request: CreateDownloadTokenCommandEncoded = {
        documentId: document.id,
        actorId: actors.collaborator.id,
        workspaceId: document.workspaceId,
        issuedTo: actors.collaborator.id,
        expiresAt: expiresAt.toISOString()
      }

      // Should fail with permission error
      try {
        await expectAsyncSuccess(
          withTestClock(
            downloadTokenWorkflow.createDownloadToken(request),
            Date.now()
          )
        )
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeDefined()
        if (error instanceof Error) {
          expect(error.message.toLowerCase()).toContain("access denied")
        }
      }
    })
  })

  describe("downloadFileWithToken - File Download", () => {
    /**
     * Helper function to create a ReadableStream from buffer
     */
    function bufferToStream(buffer: Buffer): ReadableStream<Uint8Array> {
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(buffer))
          controller.close()
        }
      })
    }

    /**
     * Helper function to read ReadableStream to buffer
     */
    async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
      const reader = stream.getReader()
      const chunks: Uint8Array[] = []
      
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
      const buffer = Buffer.allocUnsafe(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        buffer.set(chunk, offset)
        offset += chunk.length
      }
      
      return buffer
    }

    /**
     * Helper function to upload and confirm a file, returning fileKey and checksum
     */
    async function setupFileForDownload(
      documentId: DocumentId,
      actorId: UserId,
      workspaceId: WorkspaceId,
      content: Buffer
    ): Promise<{ fileKey: string; checksum: string; mimeType: string; size: number }> {
      const contentRef = `download-test-${Date.now()}` as FileKey
      
      // Upload file
      const initiateRequest: InitiateUploadCommandEncoded & { stream: ReadableStream<Uint8Array> } = {
        documentId,
        actorId,
        workspaceId,
        mimeType: "text/plain" as MimeType,
        size: content.length as FileSize,
        contentRef,
        checksum: undefined,
        stream: bufferToStream(content)
      }

      const uploadResponse = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.initiateUpload(initiateRequest),
          Date.now()
        )
      )

      // Confirm upload
      const confirmRequest: ConfirmUploadCommandEncoded = makeConfirmUploadRequest(
        documentId,
        actorId,
        uploadResponse.fileKey,
        contentRef,
        {
          workspaceId,
          checksum: uploadResponse.checksum,
          mimeType: "text/plain" as MimeType,
          size: content.length as FileSize
        }
      )

      await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.confirmUpload(confirmRequest),
          Date.now()
        )
      )

      return {
        fileKey: uploadResponse.fileKey,
        checksum: uploadResponse.checksum,
        mimeType: "text/plain",
        size: content.length
      }
    }

    it("should download file with token and verify stream", async () => {
      // Setup: Upload and confirm file
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      const testContent = Buffer.from("Test file content for download verification")
      const fileInfo = await setupFileForDownload(
        document.id,
        actors.owner.id,
        document.workspaceId,
        testContent
      )

      // Create download token
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
      const createRequest: CreateDownloadTokenCommandEncoded = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        issuedTo: actors.owner.id,
        expiresAt: expiresAt.toISOString()
      }

      const tokenResponse = await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.createDownloadToken(createRequest),
          Date.now()
        )
      )

      // Clear audit events before download
      auditEvents = []

      // Download file with token
      const downloadRequest: DownloadFileWithTokenCommandEncoded = {
        token: tokenResponse.token,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId
      }

      const downloadResponse = await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.downloadFileWithToken(downloadRequest),
          Date.now()
        )
      )

      // Verify file stream is returned
      expect(downloadResponse.stream).toBeDefined()
      expect(downloadResponse.stream.stream).toBeDefined()
      expect(downloadResponse.stream.metadata).toBeDefined()
      expect(downloadResponse.documentId).toBe(document.id)
      expect(downloadResponse.version).toBeDefined()

      // Verify metadata
      expect(downloadResponse.stream.metadata.mimeType).toBe(fileInfo.mimeType)
      expect(downloadResponse.stream.metadata.size).toBe(fileInfo.size)
      expect(downloadResponse.stream.metadata.size).toBe(testContent.length)

      // Verify file stream contains correct data
      const downloadedContent = await streamToBuffer(downloadResponse.stream.stream)
      expect(downloadedContent).toEqual(testContent)
    })

    it("should verify token is validated before download", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      const testContent = Buffer.from("Token validation test")
      await setupFileForDownload(
        document.id,
        actors.owner.id,
        document.workspaceId,
        testContent
      )

      // Try to download with invalid token
      const downloadRequest: DownloadFileWithTokenCommandEncoded = {
        token: "invalid-token-string",
        actorId: actors.owner.id,
        workspaceId: document.workspaceId
      }

      // Should fail with token not found
      try {
        await expectAsyncSuccess(
          withTestClock(
            downloadTokenWorkflow.downloadFileWithToken(downloadRequest),
            Date.now()
          )
        )
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeDefined()
        if (error instanceof Error) {
          expect(error.message.toLowerCase()).toContain("token")
        }
      }
    })

    it("should verify token is marked as used after download", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      const testContent = Buffer.from("Token usage test")
      await setupFileForDownload(
        document.id,
        actors.owner.id,
        document.workspaceId,
        testContent
      )

      // Create token
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
      const createRequest: CreateDownloadTokenCommandEncoded = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        issuedTo: actors.owner.id,
        expiresAt: expiresAt.toISOString()
      }

      const tokenResponse = await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.createDownloadToken(createRequest),
          Date.now()
        )
      )

      // Verify token is not used yet
      const downloadTokenRepository = new DownloadTokenDrizzleRepository(db)
      const tokenBeforeOption = await Effect.runPromise(
        withTestClock(
          downloadTokenRepository.findByToken(tokenResponse.token),
          Date.now()
        )
      )

      expect(tokenBeforeOption._tag).toBe("Some")
      if (tokenBeforeOption._tag === "Some") {
        expect(Option.isNone(tokenBeforeOption.value.usedAt)).toBe(true)
      }

      // Download file
      const downloadRequest: DownloadFileWithTokenCommandEncoded = {
        token: tokenResponse.token,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId
      }

      await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.downloadFileWithToken(downloadRequest),
          Date.now()
        )
      )

      // Verify token is marked as used
      const tokenAfterOption = await Effect.runPromise(
        withTestClock(
          downloadTokenRepository.findByToken(tokenResponse.token),
          Date.now()
        )
      )

      expect(tokenAfterOption._tag).toBe("Some")
      if (tokenAfterOption._tag === "Some") {
        const usedToken = tokenAfterOption.value
        expect(Option.isSome(usedToken.usedAt)).toBe(true)
        expect(usedToken.hasBeenUsed).toBe(true)
      }
    })

    it("should verify file size matches stored file", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      // Test small file
      const smallContent = Buffer.from("Small file")
      const smallFileInfo = await setupFileForDownload(
        document.id,
        actors.owner.id,
        document.workspaceId,
        smallContent
      )

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
      const createRequest: CreateDownloadTokenCommandEncoded = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        issuedTo: actors.owner.id,
        expiresAt: expiresAt.toISOString()
      }

      const tokenResponse = await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.createDownloadToken(createRequest),
          Date.now()
        )
      )

      const downloadRequest: DownloadFileWithTokenCommandEncoded = {
        token: tokenResponse.token,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId
      }

      const downloadResponse = await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.downloadFileWithToken(downloadRequest),
          Date.now()
        )
      )

      // Verify file size matches
      expect(downloadResponse.stream.metadata.size).toBe(smallContent.length)
      expect(downloadResponse.stream.metadata.size).toBe(smallFileInfo.size)

      // Verify stream size matches
      const downloadedContent = await streamToBuffer(downloadResponse.stream.stream)
      expect(downloadedContent.length).toBe(smallContent.length)
      expect(downloadedContent.length).toBe(downloadResponse.stream.metadata.size)
    })

    it("should verify Content-Type header metadata is correct", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      // Upload file with specific MIME type
      const pdfContent = Buffer.from("%PDF-1.4 fake pdf content")
      const contentRef = `mime-test-${Date.now()}` as FileKey

      const initiateRequest: InitiateUploadCommandEncoded & { stream: ReadableStream<Uint8Array> } = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        mimeType: "application/pdf" as MimeType,
        size: pdfContent.length as FileSize,
        contentRef,
        checksum: undefined,
        stream: bufferToStream(pdfContent)
      }

      const uploadResponse = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.initiateUpload(initiateRequest),
          Date.now()
        )
      )

      const confirmRequest: ConfirmUploadCommandEncoded = makeConfirmUploadRequest(
        document.id,
        actors.owner.id,
        uploadResponse.fileKey,
        contentRef,
        {
          workspaceId: document.workspaceId,
          checksum: uploadResponse.checksum,
          mimeType: "application/pdf" as MimeType,
          size: pdfContent.length as FileSize
        }
      )

      await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.confirmUpload(confirmRequest),
          Date.now()
        )
      )

      // Create token and download
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
      const createRequest: CreateDownloadTokenCommandEncoded = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        issuedTo: actors.owner.id,
        expiresAt: expiresAt.toISOString()
      }

      const tokenResponse = await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.createDownloadToken(createRequest),
          Date.now()
        )
      )

      const downloadRequest: DownloadFileWithTokenCommandEncoded = {
        token: tokenResponse.token,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId
      }

      const downloadResponse = await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.downloadFileWithToken(downloadRequest),
          Date.now()
        )
      )

      // Verify Content-Type metadata is correct
      expect(downloadResponse.stream.metadata.mimeType).toBe("application/pdf")
    })

    it("should record audit log when downloading file", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      const testContent = Buffer.from("Audit log download test")
      await setupFileForDownload(
        document.id,
        actors.owner.id,
        document.workspaceId,
        testContent
      )

      // Create token
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
      const createRequest: CreateDownloadTokenCommandEncoded = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        issuedTo: actors.owner.id,
        expiresAt: expiresAt.toISOString()
      }

      const tokenResponse = await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.createDownloadToken(createRequest),
          Date.now()
        )
      )

      // Clear audit events before download
      auditEvents = []

      // Download file
      const downloadRequest: DownloadFileWithTokenCommandEncoded = {
        token: tokenResponse.token,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId
      }

      const downloadResponse = await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.downloadFileWithToken(downloadRequest),
          Date.now()
        )
      )

      // Verify audit log was recorded
      expect(auditEvents.length).toBeGreaterThan(0)

      // Find download audit event
      const downloadEvent = auditEvents.find(
        event => event.action === "download" && event.resourceType === "download_token"
      )

      expect(downloadEvent).toBeDefined()
      if (downloadEvent) {
        expect(downloadEvent.actorId).toBe(actors.owner.id)
        expect(downloadEvent.workspaceId).toBe(document.workspaceId)
        expect(downloadEvent.resourceType).toBe("download_token")
        expect(downloadEvent.resourceId).toBe(tokenResponse.id as any)
        expect(downloadEvent.action).toBe("download")
        expect(downloadEvent.outcome).toBe("success")
        expect(downloadEvent.metadata).toBeDefined()
        if (downloadEvent.metadata) {
          expect(downloadEvent.metadata.documentId).toBe(document.id)
          expect(downloadEvent.metadata.version).toBe(downloadResponse.version)
          expect(downloadEvent.metadata.fileKey).toBeDefined()
          expect(downloadEvent.metadata.mimeType).toBeDefined()
          expect(downloadEvent.metadata.fileSize).toBe(testContent.length)
        }
      }
    })

    it("should return checksum in download metadata", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      const testContent = Buffer.from("Checksum metadata test")
      const fileInfo = await setupFileForDownload(
        document.id,
        actors.owner.id,
        document.workspaceId,
        testContent
      )

      // Create token
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
      const createRequest: CreateDownloadTokenCommandEncoded = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        issuedTo: actors.owner.id,
        expiresAt: expiresAt.toISOString()
      }

      const tokenResponse = await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.createDownloadToken(createRequest),
          Date.now()
        )
      )

      // Download file
      const downloadRequest: DownloadFileWithTokenCommandEncoded = {
        token: tokenResponse.token,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId
      }

      const downloadResponse = await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.downloadFileWithToken(downloadRequest),
          Date.now()
        )
      )

      // Verify checksum is included in metadata
      expect(downloadResponse.stream.metadata.checksum).toBeDefined()
      expect(downloadResponse.stream.metadata.checksum).toBe(fileInfo.checksum)
    })

    it("should fail when metadata file is missing", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      const testContent = Buffer.from("Missing metadata test")
      const fileInfo = await setupFileForDownload(
        document.id,
        actors.owner.id,
        document.workspaceId,
        testContent
      )

      // Delete the metadata file to simulate corruption
      const filePath = path.join(storagePath, fileInfo.fileKey)
      const metadataPath = `${filePath}.meta.json`
      await fs.unlink(metadataPath)

      // Create token
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
      const createRequest: CreateDownloadTokenCommandEncoded = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        issuedTo: actors.owner.id,
        expiresAt: expiresAt.toISOString()
      }

      const tokenResponse = await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.createDownloadToken(createRequest),
          Date.now()
        )
      )

      // Try to download file (should fail with storage error)
      const downloadRequest: DownloadFileWithTokenCommandEncoded = {
        token: tokenResponse.token,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId
      }

      try {
        await expectAsyncSuccess(
          withTestClock(
            downloadTokenWorkflow.downloadFileWithToken(downloadRequest),
            Date.now()
          )
        )
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeDefined()
        if (error instanceof Error) {
          expect(error.message.toLowerCase()).toContain("metadata")
        }
      }
    })

    it("should fail download if token is already used", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      const testContent = Buffer.from("Already used test")
      await setupFileForDownload(
        document.id,
        actors.owner.id,
        document.workspaceId,
        testContent
      )

      // Create token
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
      const createRequest: CreateDownloadTokenCommandEncoded = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        issuedTo: actors.owner.id,
        expiresAt: expiresAt.toISOString()
      }

      const tokenResponse = await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.createDownloadToken(createRequest),
          Date.now()
        )
      )

      // Download first time (should succeed)
      const downloadRequest: DownloadFileWithTokenCommandEncoded = {
        token: tokenResponse.token,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId
      }

      await expectAsyncSuccess(
        withTestClock(
          downloadTokenWorkflow.downloadFileWithToken(downloadRequest),
          Date.now()
        )
      )

      // Try to download again with same token (should fail)
      try {
        await expectAsyncSuccess(
          withTestClock(
            downloadTokenWorkflow.downloadFileWithToken(downloadRequest),
            Date.now()
          )
        )
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeDefined()
        if (error instanceof Error) {
          const message = error.message.toLowerCase()
          expect(message.includes("used") || message.includes("invalid")).toBe(true)
        }
      }
    })
  })
})

