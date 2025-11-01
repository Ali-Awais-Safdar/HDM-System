import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { promises as fs } from "fs"
import * as path from "path"
import crypto from "crypto"
import { Effect } from "effect"
import { UploadWorkflow } from "@application/workflow/upload.workflow"
import type { FileStoragePort } from "@application/services/ports/file-storage.port"
import { LocalFileStorage } from "@infra/services/local-file-storage"
import { MockConfigPort } from "../setup/test-harness"
import { seedTestActors } from "../fixtures/actors"
import { seedDocumentWithReadWriteAccess } from "../fixtures/documents"
import { expectAsyncSuccess } from "../../utils/test.helpers"
import { withTestClock } from "../../domain/setup/test-clock"
import type { FileKey, MimeType, FileSize } from "@domain/refined/file-reference"
import type { Sha256 } from "@domain/refined/checksum"
import type { InitiateUploadCommandEncoded, ConfirmUploadCommandEncoded } from "@application/dto/document/commands.dto"
import { setupSharedTestDatabase, cleanupSharedTestDatabase, clearTestDatabase } from "../../infra/setup/test-database"
import type { DatabaseInterface } from "@infra/db/interfaces"
import { DocumentAggregateDrizzleRepository } from "@infra/repositories/document-aggregate.repository"
import { AccessPolicyDrizzleRepository } from "@infra/repositories/access-policy.repository"
import { UserDrizzleRepository } from "@infra/repositories/user.repository"
import type { AuditEvent } from "@application/services/ports/audit.port"
import { makeConfirmUploadRequest } from "../fixtures/uploads"

describe("UploadWorkflow - End to End File Upload", () => {
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
    
    // Create audit port mock that captures events
    auditEvents = []
    const auditPort = {
      record: (event: AuditEvent) => {
        auditEvents.push(event)
        return Effect.succeed(undefined)
      }
    } as any
    
    // Create upload workflow with LocalFileStorage
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
   * Helper function to calculate SHA256 checksum of buffer
   */
  function calculateChecksum(buffer: Buffer): Sha256 {
    const hash = crypto.createHash("sha256")
    hash.update(buffer)
    return hash.digest("hex") as Sha256
  }

  describe("initiateUpload - Complete Upload Flow", () => {
    it("should handle File instances from multipart form data intake", async () => {
      // Seed document with write access
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      // Create test file content
      const testContent = Buffer.from("Multipart File instance test")
      const testSize = testContent.length as FileSize
      const testMimeType = "text/plain" as MimeType
      const contentRef = `multipart-test-${Date.now()}` as FileKey

      // Create a File instance (simulating what oRPC multipart parser provides)
      const file = new File([testContent], "test-file.txt", { type: testMimeType })
      
      // Verify File instance properties
      expect(file).toBeInstanceOf(File)
      expect(file.name).toBe("test-file.txt")
      expect(file.type).toBe(testMimeType)
      expect(file.size).toBe(testSize)

      // Create upload request with File instance (as oRPC would provide it)
      const request: InitiateUploadCommandEncoded & { stream: ReadableStream<Uint8Array> } = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        mimeType: testMimeType,
        size: testSize,
        contentRef,
        checksum: undefined,
        stream: file.stream() as ReadableStream<Uint8Array>
      }

      // Upload file
      const response = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.initiateUpload(request),
          Date.now()
        )
      )

      // Verify response
      expect(response.fileKey).toBeDefined()
      expect(response.checksum).toBeDefined()
      expect(response.contentRef).toBe(contentRef)

      // Verify file exists on filesystem
      const filePath = path.join(storagePath, response.fileKey)
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false)
      expect(fileExists).toBe(true)

      // Verify file content matches
      const storedContent = await fs.readFile(filePath)
      expect(storedContent.toString()).toBe(testContent.toString())
    })

    it("should upload file and verify it exists on filesystem", async () => {
      // Seed document with write access
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      // Create test file content
      const testContent = Buffer.from("This is test file content for upload verification")
      const testSize = testContent.length as FileSize
      const testMimeType = "text/plain" as MimeType
      const contentRef = `test-upload-${Date.now()}` as FileKey
      const expectedChecksum = calculateChecksum(testContent)

      // Create upload request
      const request: InitiateUploadCommandEncoded & { stream: ReadableStream<Uint8Array> } = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        mimeType: testMimeType,
        size: testSize,
        contentRef,
        checksum: undefined,
        stream: bufferToStream(testContent)
      }

      // Upload file
      const response = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.initiateUpload(request),
          Date.now()
        )
      )

      // Verify response
      expect(response.fileKey).toBeDefined()
      expect(response.checksum).toBe(expectedChecksum)
      expect(response.contentRef).toBe(contentRef)

      // Verify file exists on filesystem
      const filePath = path.join(storagePath, response.fileKey)
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false)
      expect(fileExists).toBe(true)

      // Verify file content matches
      const storedContent = await fs.readFile(filePath)
      expect(storedContent).toEqual(testContent)

      // Verify file size matches
      const fileStats = await fs.stat(filePath)
      expect(fileStats.size).toBe(testSize)
      expect(fileStats.size).toBe(testContent.length)
    })

    it("should calculate checksum during upload and verify it matches", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      // Create test file with known content
      const testContent = Buffer.from("Checksum verification test content")
      const testSize = testContent.length as FileSize
      const contentRef = `checksum-test-${Date.now()}` as FileKey
      
      // Pre-calculate expected checksum
      const expectedChecksum = calculateChecksum(testContent)

      const request: InitiateUploadCommandEncoded & { stream: ReadableStream<Uint8Array> } = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        mimeType: "text/plain" as MimeType,
        size: testSize,
        contentRef,
        checksum: undefined,
        stream: bufferToStream(testContent)
      }

      // Upload file
      const response = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.initiateUpload(request),
          Date.now()
        )
      )

      // Verify checksum matches
      expect(response.checksum).toBe(expectedChecksum)

      // Verify checksum of stored file matches
      const filePath = path.join(storagePath, response.fileKey)
      const storedContent = await fs.readFile(filePath)
      const storedChecksum = calculateChecksum(storedContent)
      expect(storedChecksum).toBe(expectedChecksum)
      expect(storedChecksum).toBe(response.checksum)
    })

    it("should validate file size during upload", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      const testContent = Buffer.from("Size validation test")
      const contentRef = `size-test-${Date.now()}` as FileKey

      // Request with wrong size
      const request: InitiateUploadCommandEncoded & { stream: ReadableStream<Uint8Array> } = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        mimeType: "text/plain" as MimeType,
        size: 9999 as FileSize, // Wrong size
        contentRef,
        checksum: undefined,
        stream: bufferToStream(testContent)
      }

      // Should fail with size mismatch
      try {
        await expectAsyncSuccess(
          withTestClock(
            uploadWorkflow.initiateUpload(request),
            Date.now()
          )
        )
        // Should not reach here
        expect(true).toBe(false)
      } catch (error) {
        // Should fail with size mismatch error
        expect(error).toBeDefined()
        if (error instanceof Error) {
          expect(error.message.toLowerCase()).toContain("size")
        }
      }
    })

    it("should store file at deterministic location based on contentRef", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      const testContent = Buffer.from("Deterministic location test")
      const contentRef = "deterministic-test-ref" as FileKey

      const request1: InitiateUploadCommandEncoded & { stream: ReadableStream<Uint8Array> } = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        mimeType: "text/plain" as MimeType,
        size: testContent.length as FileSize,
        contentRef,
        checksum: undefined,
        stream: bufferToStream(testContent)
      }

      // Upload file twice with same contentRef (create new stream for second upload)
      const response1 = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.initiateUpload(request1),
          Date.now()
        )
      )

      const request2: InitiateUploadCommandEncoded & { stream: ReadableStream<Uint8Array> } = {
        ...request1,
        stream: bufferToStream(testContent) // Create new stream for second upload
      }

      const response2 = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.initiateUpload(request2),
          Date.now()
        )
      )

      // File keys should be the same (deterministic)
      expect(response1.fileKey).toBe(response2.fileKey)

      // File should exist at that location
      const filePath = path.join(storagePath, response1.fileKey)
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false)
      expect(fileExists).toBe(true)
    })

    it("should persist metadata sidecar alongside the file", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      // Create test file content
      const testContent = Buffer.from("Metadata sidecar test content")
      const testSize = testContent.length as FileSize
      const testMimeType = "text/plain" as MimeType
      const contentRef = `metadata-test-${Date.now()}` as FileKey
      const expectedChecksum = calculateChecksum(testContent)

      const request: InitiateUploadCommandEncoded & { stream: ReadableStream<Uint8Array> } = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        mimeType: testMimeType,
        size: testSize,
        contentRef,
        checksum: undefined,
        stream: bufferToStream(testContent)
      }

      // Upload file
      const response = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.initiateUpload(request),
          Date.now()
        )
      )

      // Verify metadata file exists
      const filePath = path.join(storagePath, response.fileKey)
      const metadataPath = `${filePath}.meta.json`

      const metadataExists = await fs.access(metadataPath).then(() => true).catch(() => false)
      expect(metadataExists).toBe(true)

      // Read and verify metadata contents
      const metadataContent = await fs.readFile(metadataPath, "utf8")
      const stored = JSON.parse(metadataContent)

      expect(stored.checksum).toBe(response.checksum)
      expect(stored.checksum).toBe(expectedChecksum)
      expect(stored.size).toBe(testSize)
      expect(stored.mimeType).toBe(testMimeType)
    })

    it("should handle large file uploads with streaming", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      // Create larger file (1MB)
      const largeContent = Buffer.alloc(1024 * 1024, "x")
      const contentRef = `large-file-${Date.now()}` as FileKey
      const expectedChecksum = calculateChecksum(largeContent)

      // Create stream that chunks the data
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          // Send in chunks to simulate real streaming
          const chunkSize = 64 * 1024 // 64KB chunks
          let offset = 0
          
          const pushChunk = () => {
            if (offset >= largeContent.length) {
              controller.close()
              return
            }
            
            const chunk = largeContent.slice(offset, offset + chunkSize)
            controller.enqueue(new Uint8Array(chunk))
            offset += chunkSize
            
            // Use setTimeout to simulate async streaming
            setTimeout(pushChunk, 0)
          }
          
          pushChunk()
        }
      })

      const request: InitiateUploadCommandEncoded & { stream: ReadableStream<Uint8Array> } = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        mimeType: "text/plain" as MimeType, // Use supported MIME type
        size: largeContent.length as FileSize,
        contentRef,
        checksum: undefined,
        stream
      }

      // Upload large file
      const response = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.initiateUpload(request),
          Date.now()
        )
      )

      // Verify checksum
      expect(response.checksum).toBe(expectedChecksum)

      // Verify file size
      const filePath = path.join(storagePath, response.fileKey)
      const fileStats = await fs.stat(filePath)
      expect(fileStats.size).toBe(largeContent.length)
    })
  })

  describe("confirmUpload - Create Document Version", () => {
    it("should confirm upload and create document version", async () => {
      // Seed document with write access
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      // First, upload a file
      const testContent = Buffer.from("Test content for confirm upload")
      const testSize = testContent.length as FileSize
      const testMimeType = "text/plain" as MimeType
      const contentRef = `confirm-test-${Date.now()}` as FileKey
      const expectedChecksum = calculateChecksum(testContent)

      const initiateRequest: InitiateUploadCommandEncoded & { stream: ReadableStream<Uint8Array> } = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        mimeType: testMimeType,
        size: testSize,
        contentRef,
        checksum: undefined,
        stream: bufferToStream(testContent)
      }

      // Upload file
      const uploadResponse = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.initiateUpload(initiateRequest),
          Date.now()
        )
      )

      // Verify file exists before confirm
      const filePath = path.join(storagePath, uploadResponse.fileKey)
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false)
      expect(fileExists).toBe(true)

      // Now confirm the upload
      const confirmRequest: ConfirmUploadCommandEncoded = makeConfirmUploadRequest(
        document.id,
        actors.owner.id,
        uploadResponse.fileKey,
        contentRef,
        {
          workspaceId: document.workspaceId,
          checksum: uploadResponse.checksum,
          mimeType: testMimeType,
          size: testSize
        }
      )

      const confirmResponse = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.confirmUpload(confirmRequest),
          Date.now()
        )
      )

      // Verify response includes version information
      expect(confirmResponse.versionId).toBeDefined()
      expect(confirmResponse.documentId).toBe(document.id)
      expect(confirmResponse.version).toBeDefined()
      expect(confirmResponse.file).toBeDefined()
      expect(confirmResponse.createdBy).toBeDefined()
      expect(confirmResponse.createdAt).toBeDefined()

      // Verify version includes correct file metadata
      expect(confirmResponse.file.checksum).toBe(expectedChecksum)
      expect(confirmResponse.file.checksum).toBe(uploadResponse.checksum)
      expect(confirmResponse.file.fileKey).toBe(uploadResponse.fileKey)
      expect(confirmResponse.file.mimeType).toBe(testMimeType)
      expect(confirmResponse.file.size).toBe(testSize)
    })

    it("should verify file exists before creating version", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      // Try to confirm with non-existent file
      const nonExistentFileKey = "files/nonexistent" as FileKey
      const contentRef = "nonexistent-ref" as FileKey
      
      const confirmRequest: ConfirmUploadCommandEncoded = makeConfirmUploadRequest(
        document.id,
        actors.owner.id,
        nonExistentFileKey,
        contentRef,
        {
          workspaceId: document.workspaceId,
          checksum: undefined, // Checksum is optional and file doesn't exist anyway
          mimeType: "text/plain" as MimeType,
          size: 100 as FileSize
        }
      )

      // Should fail with file not found
      try {
        await expectAsyncSuccess(
          withTestClock(
            uploadWorkflow.confirmUpload(confirmRequest),
            Date.now()
          )
        )
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeDefined()
        if (error instanceof Error) {
          expect(error.message.toLowerCase()).toContain("not found")
        }
      }
    })

    it("should verify checksum matches before creating version", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      // Upload a file
      const testContent = Buffer.from("Checksum verification test")
      const contentRef = `checksum-verify-${Date.now()}` as FileKey

      const initiateRequest: InitiateUploadCommandEncoded & { stream: ReadableStream<Uint8Array> } = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        mimeType: "text/plain" as MimeType,
        size: testContent.length as FileSize,
        contentRef,
        checksum: undefined,
        stream: bufferToStream(testContent)
      }

      const uploadResponse = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.initiateUpload(initiateRequest),
          Date.now()
        )
      )

      // Try to confirm with wrong checksum (use valid SHA-256 format but wrong value)
      const { faker } = await import("../../domain/factories/common")
      const wrongChecksum = faker.string.hexadecimal({ length: 64, prefix: "", casing: "lower" }) as Sha256

      const confirmRequest: ConfirmUploadCommandEncoded = makeConfirmUploadRequest(
        document.id,
        actors.owner.id,
        uploadResponse.fileKey,
        contentRef,
        {
          workspaceId: document.workspaceId,
          checksum: wrongChecksum, // Wrong checksum (valid format but doesn't match actual file)
          mimeType: "text/plain" as MimeType,
          size: testContent.length as FileSize
        }
      )

      // verifyFileMetadata compares the client-supplied checksum with the stored checksum
      // from the metadata sidecar file and should fail if they don't match
      try {
        await expectAsyncSuccess(
          withTestClock(
            uploadWorkflow.confirmUpload(confirmRequest),
            Date.now()
          )
        )
        // Should not reach here - wrong checksum should cause failure
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeDefined()
        if (error instanceof Error) {
          expect(error.message.toLowerCase()).toContain("checksum")
        }
      }
    })

    it("should create document version in database", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      // Upload file
      const testContent = Buffer.from("Database version test")
      const contentRef = `db-version-${Date.now()}` as FileKey

      const initiateRequest: InitiateUploadCommandEncoded & { stream: ReadableStream<Uint8Array> } = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        mimeType: "text/plain" as MimeType,
        size: testContent.length as FileSize,
        contentRef,
        checksum: undefined,
        stream: bufferToStream(testContent)
      }

      const uploadResponse = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.initiateUpload(initiateRequest),
          Date.now()
        )
      )

      // Confirm upload
      const confirmRequest: ConfirmUploadCommandEncoded = makeConfirmUploadRequest(
        document.id,
        actors.owner.id,
        uploadResponse.fileKey,
        contentRef,
        {
          workspaceId: document.workspaceId,
          checksum: uploadResponse.checksum,
          mimeType: "text/plain" as MimeType,
          size: testContent.length as FileSize
        }
      )

      const confirmResponse = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.confirmUpload(confirmRequest),
          Date.now()
        )
      )

      // Verify version was created in database by loading aggregate
      const documentAggregateRepository = new DocumentAggregateDrizzleRepository(db)
      const aggregateResult = await Effect.runPromise(
        withTestClock(
          documentAggregateRepository.loadById(document.id),
          Date.now()
        )
      )

      expect(aggregateResult._tag).toBe("Some")
      if (aggregateResult._tag === "Some") {
        const aggregate = aggregateResult.value
        const latestVersion = aggregate.getLatestVersion()
        
        expect(latestVersion._tag).toBe("Some")
        if (latestVersion._tag === "Some") {
          const version = latestVersion.value
          expect(version.id).toBe(confirmResponse.versionId)
          expect(version.version).toBe(confirmResponse.version)
          expect(version.file.checksum).toBe(uploadResponse.checksum)
          expect(version.file.fileKey).toBe(uploadResponse.fileKey)
        }
      }
    })

    it("should record audit log when confirming upload", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      // Upload file
      const testContent = Buffer.from("Audit log test")
      const contentRef = `audit-test-${Date.now()}` as FileKey

      const initiateRequest: InitiateUploadCommandEncoded & { stream: ReadableStream<Uint8Array> } = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        mimeType: "text/plain" as MimeType,
        size: testContent.length as FileSize,
        contentRef,
        checksum: undefined,
        stream: bufferToStream(testContent)
      }

      const uploadResponse = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.initiateUpload(initiateRequest),
          Date.now()
        )
      )

      // Clear audit events before confirm
      auditEvents = []

      // Confirm upload
      const confirmRequest: ConfirmUploadCommandEncoded = makeConfirmUploadRequest(
        document.id,
        actors.owner.id,
        uploadResponse.fileKey,
        contentRef,
        {
          workspaceId: document.workspaceId,
          checksum: uploadResponse.checksum,
          mimeType: "text/plain" as MimeType,
          size: testContent.length as FileSize
        }
      )

      const confirmResponse = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.confirmUpload(confirmRequest),
          Date.now()
        )
      )

      // Verify audit log was recorded
      expect(auditEvents.length).toBeGreaterThan(0)

      // Find upload_confirm audit event
      const uploadConfirmEvent = auditEvents.find(
        event => event.action === "upload_confirm"
      )

      expect(uploadConfirmEvent).toBeDefined()
      if (uploadConfirmEvent) {
        expect(uploadConfirmEvent.actorId).toBe(actors.owner.id)
        expect(uploadConfirmEvent.workspaceId).toBe(document.workspaceId)
        expect(uploadConfirmEvent.resourceType).toBe("document_version")
        expect(uploadConfirmEvent.resourceId).toBe(confirmResponse.versionId)
        expect(uploadConfirmEvent.action).toBe("upload_confirm")
        expect(uploadConfirmEvent.outcome).toBe("success")
        expect(uploadConfirmEvent.metadata).toBeDefined()
        if (uploadConfirmEvent.metadata) {
          expect(uploadConfirmEvent.metadata.documentId).toBe(document.id)
          expect(uploadConfirmEvent.metadata.version).toBe(confirmResponse.version)
          expect(uploadConfirmEvent.metadata.checksum).toBe(uploadResponse.checksum)
          expect(uploadConfirmEvent.metadata.fileKey).toBe(uploadResponse.fileKey)
          expect(uploadConfirmEvent.metadata.size).toBe(testContent.length)
        }
      }
    })

    it("should use stored checksum from metadata during confirm", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      // Upload a file
      const testContent = Buffer.from("Stored checksum verification test")
      const contentRef = `stored-checksum-${Date.now()}` as FileKey

      const initiateRequest: InitiateUploadCommandEncoded & { stream: ReadableStream<Uint8Array> } = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        mimeType: "text/plain" as MimeType,
        size: testContent.length as FileSize,
        contentRef,
        checksum: undefined,
        stream: bufferToStream(testContent)
      }

      const uploadResponse = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.initiateUpload(initiateRequest),
          Date.now()
        )
      )

      // Verify metadata file contains correct checksum
      const filePath = path.join(storagePath, uploadResponse.fileKey)
      const metadataPath = `${filePath}.meta.json`
      const metadataContent = JSON.parse(await fs.readFile(metadataPath, "utf8"))
      expect(metadataContent.checksum).toBe(uploadResponse.checksum)

      // Confirm upload with the correct checksum
      const confirmRequest: ConfirmUploadCommandEncoded = makeConfirmUploadRequest(
        document.id,
        actors.owner.id,
        uploadResponse.fileKey,
        contentRef,
        {
          workspaceId: document.workspaceId,
          checksum: uploadResponse.checksum,
          mimeType: "text/plain" as MimeType,
          size: testContent.length as FileSize
        }
      )

      const confirmResponse = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.confirmUpload(confirmRequest),
          Date.now()
        )
      )

      // Verify version was created with the stored checksum
      expect(confirmResponse.file.checksum).toBe(uploadResponse.checksum)
      expect(confirmResponse.file.checksum).toBe(metadataContent.checksum)
    })

    it("should reject confirm when checksum doesn't match stored metadata", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      // Upload a file
      const testContent = Buffer.from("Checksum mismatch test")
      const contentRef = `mismatch-test-${Date.now()}` as FileKey

      const initiateRequest: InitiateUploadCommandEncoded & { stream: ReadableStream<Uint8Array> } = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        mimeType: "text/plain" as MimeType,
        size: testContent.length as FileSize,
        contentRef,
        checksum: undefined,
        stream: bufferToStream(testContent)
      }

      const uploadResponse = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.initiateUpload(initiateRequest),
          Date.now()
        )
      )

      // Try to confirm with wrong checksum
      const wrongChecksum = "0000000000000000000000000000000000000000000000000000000000000000" as Sha256

      const confirmRequest: ConfirmUploadCommandEncoded = makeConfirmUploadRequest(
        document.id,
        actors.owner.id,
        uploadResponse.fileKey,
        contentRef,
        {
          workspaceId: document.workspaceId,
          checksum: wrongChecksum,
          mimeType: "text/plain" as MimeType,
          size: testContent.length as FileSize
        }
      )

      // Should fail with checksum mismatch
      try {
        await expectAsyncSuccess(
          withTestClock(
            uploadWorkflow.confirmUpload(confirmRequest),
            Date.now()
          )
        )
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeDefined()
        if (error instanceof Error) {
          expect(error.message.toLowerCase()).toContain("checksum")
        }
      }
    })

    it("should be idempotent when confirming same upload twice", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        db,
        actors.owner,
        actors.owner
      )

      // Upload file
      const testContent = Buffer.from("Idempotency test")
      const contentRef = `idempotency-test-${Date.now()}` as FileKey

      const initiateRequest: InitiateUploadCommandEncoded & { stream: ReadableStream<Uint8Array> } = {
        documentId: document.id,
        actorId: actors.owner.id,
        workspaceId: document.workspaceId,
        mimeType: "text/plain" as MimeType,
        size: testContent.length as FileSize,
        contentRef,
        checksum: undefined,
        stream: bufferToStream(testContent)
      }

      const uploadResponse = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.initiateUpload(initiateRequest),
          Date.now()
        )
      )

      // Confirm upload first time
      const confirmRequest: ConfirmUploadCommandEncoded = makeConfirmUploadRequest(
        document.id,
        actors.owner.id,
        uploadResponse.fileKey,
        contentRef,
        {
          workspaceId: document.workspaceId,
          checksum: uploadResponse.checksum,
          mimeType: "text/plain" as MimeType,
          size: testContent.length as FileSize
        }
      )

      const firstConfirm = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.confirmUpload(confirmRequest),
          Date.now()
        )
      )

      // Confirm upload second time (should return existing version)
      const secondConfirm = await expectAsyncSuccess(
        withTestClock(
          uploadWorkflow.confirmUpload(confirmRequest),
          Date.now()
        )
      )

      // Should return the same version (idempotency)
      expect(firstConfirm.versionId).toBe(secondConfirm.versionId)
      expect(firstConfirm.version).toBe(secondConfirm.version)

      // Verify only one version exists in database
      const documentAggregateRepository = new DocumentAggregateDrizzleRepository(db)
      const aggregateResult = await Effect.runPromise(
        withTestClock(
          documentAggregateRepository.loadById(document.id),
          Date.now()
        )
      )

      expect(aggregateResult._tag).toBe("Some")
      if (aggregateResult._tag === "Some") {
        const aggregate = aggregateResult.value
        const versions = aggregate.getVersions()
        // Should have original version from seedDocumentWithReadWriteAccess + 1 new version
        expect(versions.length).toBeLessThanOrEqual(2)
      }
    })
  })
})

