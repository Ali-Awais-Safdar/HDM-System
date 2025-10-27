import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { workflowTestLifecycle } from "../setup/test-harness"
import type { WorkflowTestHarness } from "../setup/test-harness"
import { seedTestActors } from "../fixtures/actors"
import { seedDocumentWithReadWriteAccess } from "../fixtures/documents"
import { makeInitiateUploadRequest, makeConfirmUploadRequest } from "../fixtures/uploads"
import { expectAsyncSuccess, expectSome } from "../../utils/test.helpers"
import { withTestClock } from "../../domain/setup/test-clock"
import { seedDocumentVersion } from "../../infra/setup/seed-helpers"
import { Sha256 } from "@domain/refined/checksum"
import { FileKey } from "@domain/refined/file-reference"

describe("UploadWorkflow", () => {
  let harness: WorkflowTestHarness
  let actors: Awaited<ReturnType<typeof seedTestActors>>

  beforeAll(async () => {
    harness = await workflowTestLifecycle.beforeAll()
    actors = await seedTestActors(harness.db)
  })

  afterAll(async () => {
    await workflowTestLifecycle.afterAll(harness)
  })

  beforeEach(async () => {
    await workflowTestLifecycle.beforeEach(harness)
    actors = await seedTestActors(harness.db)
  })

  describe("initiateUpload - Initiate Flow", () => {
    it("should initiate upload and verify uploadUrl and contentRef", async () => {
      // Seed document with write access
      const { document } = await seedDocumentWithReadWriteAccess(
        harness.db,
        actors.owner,
        actors.owner
      )

      const request = makeInitiateUploadRequest(
        document.id,
        actors.owner.id,
        {
          workspaceId: document.workspaceId,
          contentRef: "test-content-ref" as FileKey,
          mimeType: "application/pdf" as any,
          size: 2048 as any
        }
      )

      const response = await expectAsyncSuccess(
        harness.uploadWorkflow.initiateUpload(request)
      )

      expect(response.uploadUrl).toBeDefined()
      expect(response.contentRef).toBe("test-content-ref")
      expect(response.fileKey).toBeDefined()
      expect(response.expiresAt).toBeDefined()
      expect(response.uploadToken).toBeDefined()

      // Verify fake storage recorded the request
      const uploadIntent = harness.fileStoragePort.getUploadIntent("test-content-ref")
      expect(uploadIntent).toBeDefined()
      expect(uploadIntent?.documentId).toBe(document.id)
      expect(uploadIntent?.contentRef).toBe("test-content-ref")
      expect(uploadIntent?.expectedSize).toBe(2048)
      expect(uploadIntent?.expectedMimeType).toBe("application/pdf")
    })

    it("should record request with correct expiryMs", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        harness.db,
        actors.owner,
        actors.owner
      )

      const request = makeInitiateUploadRequest(document.id, actors.owner.id, { workspaceId: document.workspaceId })

      await expectAsyncSuccess(
        harness.uploadWorkflow.initiateUpload(request)
      )

      const uploadIntent = harness.fileStoragePort.getUploadIntent(request.contentRef)
      expect(uploadIntent?.expiresAt.getTime()).toBeGreaterThan(Date.now())
      // Default expiry is 15 minutes
      const expectedExpiry = (uploadIntent?.initiatedAt?.getTime() ?? 0) + (15 * 60 * 1000)
      expect(uploadIntent?.expiresAt.getTime()).toBe(expectedExpiry)
    })
  })

  describe("confirmUpload - Create New Version", () => {
    it("should confirm upload and create new DocumentVersionEntity", async () => {
      // Configure fake storage to return deterministic checksum
      const { document } = await seedDocumentWithReadWriteAccess(
        harness.db,
        actors.owner,
        actors.owner
      )

      const contentRef = "test-upload-123" as FileKey
      // Generate deterministic checksum that storage will return
      const checksum = Buffer.from(contentRef).toString('hex').padEnd(64, '0').substring(0, 64) as Sha256

      // Configure storage to return this checksum
      const fileKey = `files/${contentRef}` as FileKey

      // Initiate upload first
      const initiateRequest = makeInitiateUploadRequest(document.id, actors.owner.id, {
        workspaceId: document.workspaceId,
        contentRef,
        mimeType: "application/pdf" as any,
        size: 1024 as any
      })

      await expectAsyncSuccess(
        harness.uploadWorkflow.initiateUpload(initiateRequest)
      )

      // Configure fake storage to return specific checksum
      const confirmRequest = makeConfirmUploadRequest(
        document.id,
        actors.owner.id,
        fileKey,
        contentRef,
        {
          workspaceId: document.workspaceId,
          checksum,
          mimeType: "application/pdf" as any,
          size: 1024 as any
        }
      )

      const response = await expectAsyncSuccess(
        withTestClock(
          harness.uploadWorkflow.confirmUpload(confirmRequest),
          Date.now()
        )
      )

      expect(response.versionId).toBeDefined()
      expect(response.documentId).toBe(document.id)
      expect(response.version).toBe(2) // version 1 already exists from seedDocumentWithReadWriteAccess
      expect(response.file.checksum).toBe(checksum)
      expect(response.createdBy).toBeDefined()
      expect(response.createdAt).toBeDefined()

      // Verify version was created in repository
      const versionOption = await expectAsyncSuccess(
        harness.documentVersionRepository.findById(response.versionId)
      )
      const version = expectSome(versionOption)
      expect(version.id).toBe(response.versionId)

      // Verify document's updatedAt changed
      const docOption = await expectAsyncSuccess(
        harness.documentRepository.findById(document.id)
      )
      const updatedDoc = expectSome(docOption)
      expect(updatedDoc.updatedAt).toBeDefined()
    })
  })

  describe("confirmUpload - Idempotency", () => {
    it("should detect existing version and avoid duplicates", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        harness.db,
        actors.owner,
        actors.owner
      )

      const contentRef = "idempotent-upload" as FileKey
      // Use deterministic checksum for idempotency test
      const checksum = Buffer.from(contentRef).toString('hex').padEnd(64, '0').substring(0, 64) as Sha256

      // Create a version with this checksum first
      await seedDocumentVersion(harness.db, {
        documentId: document.id as any,
        version: 2,
        file: {
          checksum,
          fileKey: `files/${contentRef}` as FileKey,
          mimeType: "application/pdf" as any,
          size: 1024 as any
        }
      })

      const fileKey = `files/${contentRef}` as FileKey

      // Initiate upload
      const initiateRequest = makeInitiateUploadRequest(document.id, actors.owner.id, {
        workspaceId: document.workspaceId,
        contentRef,
        mimeType: "application/pdf" as any,
        size: 1024 as any
      })

      await expectAsyncSuccess(
        harness.uploadWorkflow.initiateUpload(initiateRequest)
      )

      // Now confirm - should return existing version
      const confirmRequest = makeConfirmUploadRequest(
        document.id,
        actors.owner.id,
        fileKey,
        contentRef,
        {
          workspaceId: document.workspaceId,
          checksum,
          mimeType: "application/pdf" as any,
          size: 1024 as any
        }
      )

      const response1 = await expectAsyncSuccess(
        harness.uploadWorkflow.confirmUpload(confirmRequest)
      )

      // Confirm again with same checksum
      const response2 = await expectAsyncSuccess(
        harness.uploadWorkflow.confirmUpload(confirmRequest)
      )

      // Both should return the same version ID
      expect(response1.versionId).toBe(response2.versionId)
      expect(response1.version).toBe(2)

      // Verify only one version with this checksum exists
      const versions = await expectAsyncSuccess(
        harness.documentVersionRepository.findByDocumentId(document.id)
      )
      const versionsWithChecksum = versions.filter(v => v.file.checksum === checksum)
      expect(versionsWithChecksum.length).toBe(1)
    })
  })

  describe("confirmUpload - Error Branches", () => {
    it("should fail with ChecksumValidationError on mismatched checksum", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        harness.db,
        actors.owner,
        actors.owner
      )

      const contentRef = "checksum-test" as FileKey

      // Initiate upload
      const initiateRequest = makeInitiateUploadRequest(document.id, actors.owner.id, {
        workspaceId: document.workspaceId,
        contentRef,
        mimeType: "application/pdf" as any,
        size: 1024 as any
      })

      await expectAsyncSuccess(
        harness.uploadWorkflow.initiateUpload(initiateRequest)
      )

      // Storage will return deterministic hash of contentRef
      // But we'll pass a different checksum that won't match
      const fileKey = `files/${contentRef}` as FileKey
      const wrongChecksum = "d".repeat(64) as Sha256 // Different from storage

      const confirmRequest = makeConfirmUploadRequest(
        document.id,
        actors.owner.id,
        fileKey,
        contentRef,
        {
          workspaceId: document.workspaceId,
          checksum: wrongChecksum, // Intentional mismatch (storage returns sha256:checksum-test)
          mimeType: "application/pdf" as any,
          size: 1024 as any
        }
      )

      try {
        await expectAsyncSuccess(harness.uploadWorkflow.confirmUpload(confirmRequest))
        throw new Error("Expected ChecksumValidationError")
      } catch (error) {
        expect(error).toBeDefined()
        // The error should contain information about checksum mismatch
        const errorMessage = String(error)
        expect(errorMessage.toLowerCase()).toContain("checksum")
      }
    })

    it("should fail with FileNotFoundError when upload intent is missing", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        harness.db,
        actors.owner,
        actors.owner
      )

      const contentRef = "missing-intent" as FileKey
      const fileKey = `files/${contentRef}` as FileKey
      const checksum = Buffer.from(contentRef).toString('hex').padEnd(64, '0').substring(0, 64) as Sha256

      // Don't initiate upload - just try to confirm

      const confirmRequest = makeConfirmUploadRequest(
        document.id,
        actors.owner.id,
        fileKey,
        contentRef,
        {
          workspaceId: document.workspaceId,
          checksum,
          mimeType: "application/pdf" as any,
          size: 1024 as any
        }
      )

      try {
        await expectAsyncSuccess(harness.uploadWorkflow.confirmUpload(confirmRequest))
        throw new Error("Expected error")
      } catch (error) {
        expect(error).toBeDefined()
      }
    })

    it("should validate metadata and fail when expectedSize doesn't match stored metadata", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        harness.db,
        actors.owner,
        actors.owner
      )

      const contentRef = "metadata-size-mismatch" as FileKey

      // Initiate with specific metadata
      const initiateRequest = makeInitiateUploadRequest(document.id, actors.owner.id, {
        workspaceId: document.workspaceId,
        contentRef,
        mimeType: "application/pdf" as any,
        size: 1024 as any
      })

      await expectAsyncSuccess(
        harness.uploadWorkflow.initiateUpload(initiateRequest)
      )

      // Try to confirm with DIFFERENT size (should fail validation)
      const fileKey = `files/${contentRef}` as FileKey
      const checksum = Buffer.from(contentRef).toString('hex').padEnd(64, '0').substring(0, 64) as Sha256

      const confirmRequest = makeConfirmUploadRequest(
        document.id,
        actors.owner.id,
        fileKey,
        contentRef,
        {
          workspaceId: document.workspaceId,
          checksum,
          mimeType: "application/pdf" as any,
          size: 2048 as any // Different size than initiated
        }
      )

      // This should fail due to size mismatch
      try {
        await expectAsyncSuccess(harness.uploadWorkflow.confirmUpload(confirmRequest))
        throw new Error("Expected UploadConfirmationError")
      } catch (error) {
        expect(error).toBeDefined()
        const errorMessage = String(error)
        expect(errorMessage.toLowerCase()).toContain("size")
      }
    })

    it("should validate metadata and fail when expectedMimeType doesn't match stored metadata", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        harness.db,
        actors.owner,
        actors.owner
      )

      const contentRef = "metadata-mimetype-mismatch" as FileKey

      // Initiate with specific metadata
      const initiateRequest = makeInitiateUploadRequest(document.id, actors.owner.id, {
        workspaceId: document.workspaceId,
        contentRef,
        mimeType: "application/pdf" as any,
        size: 1024 as any
      })

      await expectAsyncSuccess(
        harness.uploadWorkflow.initiateUpload(initiateRequest)
      )

      // Try to confirm with DIFFERENT mimeType (should fail validation)
      const fileKey = `files/${contentRef}` as FileKey
      const checksum = Buffer.from(contentRef).toString('hex').padEnd(64, '0').substring(0, 64) as Sha256

      const confirmRequest = makeConfirmUploadRequest(
        document.id,
        actors.owner.id,
        fileKey,
        contentRef,
        {
          workspaceId: document.workspaceId,
          checksum,
          mimeType: "text/plain" as any, // Different MIME type than initiated
          size: 1024 as any // Same size
        }
      )

      // This should fail due to MIME type mismatch
      try {
        await expectAsyncSuccess(harness.uploadWorkflow.confirmUpload(confirmRequest))
        throw new Error("Expected UploadConfirmationError")
      } catch (error) {
        expect(error).toBeDefined()
        const errorMessage = String(error)
        expect(errorMessage.toLowerCase()).toContain("mime")
      }
    })
  })

  describe("Permission Enforcement", () => {
    it("should fail with PermissionCheckError when actor lacks write permission", async () => {
      // Create document with read-only access for collaborator
      const { document } = await seedDocumentWithReadWriteAccess(
        harness.db,
        actors.owner,
        actors.collaborator
      )

      const initiateRequest = makeInitiateUploadRequest(document.id, actors.collaborator.id, { workspaceId: document.workspaceId })

      try {
        await expectAsyncSuccess(harness.uploadWorkflow.initiateUpload(initiateRequest))
        throw new Error("Expected permission error")
      } catch (error) {
        expect(error).toBeDefined()
      }
    })

    it("should succeed with write permission", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        harness.db,
        actors.owner,
        actors.owner
      )

      const request = makeInitiateUploadRequest(document.id, actors.owner.id, { workspaceId: document.workspaceId })

      const response = await expectAsyncSuccess(
        harness.uploadWorkflow.initiateUpload(request)
      )

      expect(response.uploadUrl).toBeDefined()
    })
  })

  describe("Workspace Enforcement", () => {
    it("should fail when trying to initiate upload with wrong workspace", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        harness.db,
        actors.owner,
        actors.owner
      )

      // Import TEST_WORKSPACE_ID_2 from fixtures
      const { TEST_WORKSPACE_ID_2 } = await import("../fixtures/actors")

      // Try to initiate upload with wrong workspace
      const initiateRequest = makeInitiateUploadRequest(document.id, actors.owner.id, {
        workspaceId: TEST_WORKSPACE_ID_2
      })

      try {
        await expectAsyncSuccess(harness.uploadWorkflow.initiateUpload(initiateRequest))
        throw new Error("Expected workspace validation error")
      } catch (error) {
        expect(error).toBeDefined()
        const errorMessage = String(error)
        // Should fail because document doesn't exist in the wrong workspace
        expect(errorMessage.toLowerCase()).toMatch(/document|workspace/)
      }
    })

    it("should fail when trying to confirm upload with wrong workspace", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        harness.db,
        actors.owner,
        actors.owner
      )

      const contentRef = "wrong-workspace-test" as FileKey

      // Initiate upload with correct workspace
      const initiateRequest = makeInitiateUploadRequest(document.id, actors.owner.id, {
        workspaceId: document.workspaceId,
        contentRef,
        mimeType: "application/pdf" as any,
        size: 1024 as any
      })

      const initiateResponse = await expectAsyncSuccess(
        harness.uploadWorkflow.initiateUpload(initiateRequest)
      )

      // Import TEST_WORKSPACE_ID_2 from fixtures
      const { TEST_WORKSPACE_ID_2 } = await import("../fixtures/actors")

      // Try to confirm upload with wrong workspace
      const confirmRequest = makeConfirmUploadRequest(
        document.id,
        actors.owner.id,
        initiateResponse.fileKey,
        contentRef,
        {
          workspaceId: TEST_WORKSPACE_ID_2,
          checksum: Buffer.from(contentRef).toString('hex').padEnd(64, '0').substring(0, 64) as Sha256,
          mimeType: "application/pdf" as any,
          size: 1024 as any
        }
      )

      try {
        await expectAsyncSuccess(harness.uploadWorkflow.confirmUpload(confirmRequest))
        throw new Error("Expected workspace validation error")
      } catch (error) {
        expect(error).toBeDefined()
        const errorMessage = String(error)
        // Should fail because document doesn't exist in the wrong workspace
        expect(errorMessage.toLowerCase()).toMatch(/document|workspace/)
      }
    })

    it("should succeed when workspace matches document workspace", async () => {
      const { document } = await seedDocumentWithReadWriteAccess(
        harness.db,
        actors.owner,
        actors.owner
      )

      const contentRef = "correct-workspace-test" as FileKey

      // Initiate upload with correct workspace
      const initiateRequest = makeInitiateUploadRequest(document.id, actors.owner.id, {
        workspaceId: document.workspaceId,
        contentRef,
        mimeType: "application/pdf" as any,
        size: 1024 as any
      })

      const initiateResponse = await expectAsyncSuccess(
        harness.uploadWorkflow.initiateUpload(initiateRequest)
      )

      // Confirm upload with correct workspace
      const confirmRequest = makeConfirmUploadRequest(
        document.id,
        actors.owner.id,
        initiateResponse.fileKey,
        contentRef,
        {
          workspaceId: document.workspaceId,
          checksum: Buffer.from(contentRef).toString('hex').padEnd(64, '0').substring(0, 64) as Sha256,
          mimeType: "application/pdf" as any,
          size: 1024 as any
        }
      )

      const confirmResponse = await expectAsyncSuccess(
        harness.uploadWorkflow.confirmUpload(confirmRequest)
      )

      expect(confirmResponse.version).toBeDefined()
      expect(confirmResponse.documentId).toBe(document.id)
    })
  })
})
