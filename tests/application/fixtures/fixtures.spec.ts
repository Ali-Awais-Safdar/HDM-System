import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { seedTestActors, getActorId } from "./actors"
import { seedDocumentWithReadAccess, seedDocumentWithReadWriteAccess } from "./documents"
import { makeInitiateUploadRequest, makeConfirmUploadRequest, makeMatchedUploadRequests } from "./uploads"
import { workflowTestLifecycle } from "../setup/test-harness"
import type { WorkflowTestHarness } from "../setup/test-harness"

describe("Application Fixtures", () => {
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
    // Re-seed actors after each test
    actors = await seedTestActors(harness.db)
  })

  describe("seedTestActors", () => {
    it("should create owner, admin, and collaborator users", () => {
      expect(actors.owner.id).toBeDefined()
      expect(actors.admin.id).toBeDefined()
      expect(actors.collaborator.id).toBeDefined()
    })

    it("should have correct email addresses", () => {
      expect(actors.owner.email).toBe("owner@test.com")
      expect(actors.admin.email).toBe("admin@test.com")
      expect(actors.collaborator.email).toBe("collaborator@test.com")
    })

    it("should have correct roles", () => {
      expect(actors.owner.roles).toEqual(["USER"])
      expect(actors.admin.roles).toEqual(["ADMIN", "USER"])
      expect(actors.collaborator.roles).toEqual(["USER"])
    })
  })

  describe("getActorId", () => {
    it("should return correct IDs for each actor", () => {
      expect(getActorId(actors, "owner")).toBe(actors.owner.id)
      expect(getActorId(actors, "admin")).toBe(actors.admin.id)
      expect(getActorId(actors, "collaborator")).toBe(actors.collaborator.id)
    })
  })

  describe("seedDocumentWithReadAccess", () => {
    it("should create document with read-only collaborator access", async () => {
      const result = await seedDocumentWithReadAccess(
        harness.db,
        actors.owner,
        actors.collaborator
      )

      expect(result.document).toBeDefined()
      expect(result.version).toBeDefined()
      expect(result.policies).toHaveLength(1)
      expect(result.policies[0]?.subjectId).toBeDefined()
    })
  })

  describe("seedDocumentWithReadWriteAccess", () => {
    it("should create document with read-write collaborator access", async () => {
      const result = await seedDocumentWithReadWriteAccess(
        harness.db,
        actors.owner,
        actors.collaborator
      )

      expect(result.document).toBeDefined()
      expect(result.version).toBeDefined()
      expect(result.policies).toHaveLength(1)
      // Verify write permissions are included
      const actions = result.policies[0]?.actions || []
      expect(actions).toContain("read")
      expect(actions).toContain("update")
    })
  })

  describe("makeInitiateUploadRequest", () => {
    it("should create a valid initiate upload request", () => {
      const request = makeInitiateUploadRequest(
        "doc-123" as any,
        "user-123" as any,
        { mimeType: "application/pdf" as any }
      )

      expect(request.documentId).toBe("doc-123")
      expect(request.actorId).toBe("user-123")
      expect(request.mimeType).toBe("application/pdf")
      expect(request.contentRef).toBeDefined()
    })
  })

  describe("makeConfirmUploadRequest", () => {
    it("should create a valid confirm upload request", () => {
      const request = makeConfirmUploadRequest(
        "doc-123" as any,
        "user-123" as any,
        "files/test.pdf" as any,
        "test-content-ref" as any
      )

      expect(request.documentId).toBe("doc-123")
      expect(request.actorId).toBe("user-123")
      expect(request.fileKey).toBe("files/test.pdf")
      expect(request.contentRef).toBe("test-content-ref")
      expect(request.checksum).toBeDefined()
    })
  })

  describe("makeMatchedUploadRequests", () => {
    it("should create matched initiate/confirm requests", () => {
      const { initiate, confirm } = makeMatchedUploadRequests(
        "doc-123" as any,
        "user-123" as any
      )

      expect(initiate.documentId).toBe("doc-123")
      expect(initiate.actorId).toBe("user-123")
      
      const confirmRequest = confirm("files/test.pdf" as any)
      expect(confirmRequest.documentId).toBe("doc-123")
      expect(confirmRequest.contentRef).toBe(initiate.contentRef)
    })
  })
})

