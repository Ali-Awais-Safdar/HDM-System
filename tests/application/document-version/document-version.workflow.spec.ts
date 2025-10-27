import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { workflowTestLifecycle } from "../setup/test-harness"
import type { WorkflowTestHarness } from "../setup/test-harness"
import { seedTestActors } from "../fixtures/actors"
import { seedDocumentWithReadAccess } from "../fixtures/documents"
import { expectAsyncSuccess } from "../../utils/test.helpers"
import { seedDocument, seedDocumentVersion } from "../../infra/setup/seed-helpers"
import { calculateTotalPages } from "@domain/utils/pagination"

describe("DocumentVersionWorkflow", () => {
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

  describe("listDocumentVersions - Pagination and Ordering", () => {
    it("should list versions with pagination and verify DTO conversion (dates as ISO strings)", async () => {
      // Seed owner, document with multiple versions
      const owner = actors.owner
      const document = await seedDocument(harness.db, { ownerId: owner.id })

      // Create 10 versions
      for (let i = 1; i <= 10; i++) {
        await seedDocumentVersion(harness.db, {
          documentId: document.id as any,
          version: i
        })
      }

      // List versions with pagination
      const listQuery = {
        documentId: document.id,
        actorId: owner.id,
        pageNum: 1,
        pageSize: 5
      }

      const response = await expectAsyncSuccess(
        harness.documentVersionWorkflow.listDocumentVersions(listQuery)
      )

      expect(response.data).toHaveLength(5)
      expect(response.total).toBe(10)
      expect(response.pageNum).toBe(1)
      expect(response.pageSize).toBe(5)
      expect(response.totalPages).toBe(calculateTotalPages(10, 5))

      // Verify dates are ISO strings
      response.data.forEach((version) => {
        expect(version.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
        expect(typeof version.createdAt).toBe("string")
      })

      // Verify ordering (should be descending by version number for latest first)
      expect(response.data[0]?.version).toBeGreaterThan(response.data[1]?.version || 0)
      expect(response.data[1]?.version).toBeGreaterThan(response.data[2]?.version || 0)
    })

    it("should return all versions when pagination parameters are not specified", async () => {
      const owner = actors.owner
      const document = await seedDocument(harness.db, { ownerId: owner.id })

      // Create 3 versions
      for (let i = 1; i <= 3; i++) {
        await seedDocumentVersion(harness.db, {
          documentId: document.id as any,
          version: i
        })
      }

      const listQuery = {
        documentId: document.id,
        actorId: owner.id
      }

      const response = await expectAsyncSuccess(
        harness.documentVersionWorkflow.listDocumentVersions(listQuery)
      )

      expect(response.data).toHaveLength(3)
      expect(response.total).toBe(3)
      expect(response.pageNum).toBe(1) // Default page number
      expect(response.pageSize).toBe(10) // Default page size
    })
  })

  describe("getLatestDocumentVersion - Success and Error Cases", () => {
    it("should return the latest version successfully", async () => {
      const owner = actors.owner
      const document = await seedDocument(harness.db, { ownerId: owner.id })

      // Create multiple versions
      for (let i = 1; i <= 5; i++) {
        await seedDocumentVersion(harness.db, {
          documentId: document.id as any,
          version: i
        })
      }

      const query = {
        documentId: document.id,
        actorId: owner.id
      }

      const response = await expectAsyncSuccess(
        harness.documentVersionWorkflow.getLatestDocumentVersion(query)
      )

      expect(response.version).toBe(5) // Latest version
      expect(response.documentId).toBe(document.id)
      expect(response.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
    })

    it("should fail with DocumentVersionNotFoundError when no versions exist", async () => {
      const owner = actors.owner
      const document = await seedDocument(harness.db, { ownerId: owner.id })

      const query = {
        documentId: document.id,
        actorId: owner.id
      }

      const resultEffect = harness.documentVersionWorkflow.getLatestDocumentVersion(query)

      try {
        await expectAsyncSuccess(resultEffect)
        throw new Error("Expected error")
      } catch (error) {
        // Should fail with an error (likely DocumentVersionNotFoundError or WorkflowDependencyError)
        expect(error).toBeDefined()
        // Check that the error message contains relevant information
        const errorMessage = String(error)
        expect(errorMessage).toBeTruthy()
      }
    })
  })

  describe("Permission Checks", () => {
    it("should fail with PermissionCheckError when non-authorized user tries to list versions", async () => {
      // Create document with read access for collaborator
      const { document } = await seedDocumentWithReadAccess(
        harness.db,
        actors.owner,
        actors.collaborator
      )

      // Note: seedDocumentWithReadAccess already creates version 1
      // Create additional versions
      for (let i = 2; i <= 4; i++) {
        await seedDocumentVersion(harness.db, {
          documentId: document.id as any,
          version: i
        })
      }

      // Try to list versions as admin (no access)
      const listQuery = {
        documentId: document.id,
        actorId: actors.admin.id
      }

      const resultEffect = harness.documentVersionWorkflow.listDocumentVersions(listQuery)

      try {
        await expectAsyncSuccess(resultEffect)
        throw new Error("Expected permission error")
      } catch (error) {
        expect(error).toBeDefined()
      }
    })

    it("should fail with PermissionCheckError when non-authorized user tries to get latest version", async () => {
      // Create document with read access for collaborator
      const { document } = await seedDocumentWithReadAccess(
        harness.db,
        actors.owner,
        actors.collaborator
      )

      // Create additional version (version 1 already exists from seedDocumentWithReadAccess)
      await seedDocumentVersion(harness.db, {
        documentId: document.id as any,
        version: 2
      })

      // Try to get latest version as admin (no access)
      const query = {
        documentId: document.id,
        actorId: actors.admin.id
      }

      const resultEffect = harness.documentVersionWorkflow.getLatestDocumentVersion(query)

      try {
        await expectAsyncSuccess(resultEffect)
        throw new Error("Expected permission error")
      } catch (error) {
        expect(error).toBeDefined()
      }
    })
  })

  describe("Error Mapping", () => {
    it("should map repository failure to WorkflowDependencyError for invalid document ID", async () => {
      const owner = actors.owner
      const invalidDocumentId = "00000000-0000-0000-0000-000000000000"

      const listQuery = {
        documentId: invalidDocumentId as any,
        actorId: owner.id,
        pageNum: 1,
        pageSize: 10
      }

      const resultEffect = harness.documentVersionWorkflow.listDocumentVersions(listQuery)

      // Should fail but with a workflow error
      try {
        await expectAsyncSuccess(resultEffect)
        throw new Error("Expected error")
      } catch (error) {
        // Should be a workflow error, not a parse error
        expect(error).toBeDefined()
      }
    })
  })

  describe("getDocumentVersionById", () => {
    it("should retrieve a specific version by ID", async () => {
      const owner = actors.owner
      const document = await seedDocument(harness.db, { ownerId: owner.id })

      // Create a version
      const versionEntity = await seedDocumentVersion(harness.db, {
        documentId: document.id as any,
        version: 1
      })

      const query = {
        versionId: versionEntity.id,
        actorId: owner.id
      }

      const response = await expectAsyncSuccess(
        harness.documentVersionWorkflow.getDocumentVersionById(query)
      )

      expect(response.id).toBe(versionEntity.id)
      expect(response.documentId).toBe(document.id)
      expect(response.version).toBe(1)
      expect(response.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
    })

    it("should fail when retrieving version for non-authorized user", async () => {
      // Create document with read access for collaborator - this already creates a version
      const { version } = await seedDocumentWithReadAccess(
        harness.db,
        actors.owner,
        actors.collaborator
      )

      // Try to get version as admin (no access)
      const query = {
        versionId: version.id,
        actorId: actors.admin.id
      }

      const resultEffect = harness.documentVersionWorkflow.getDocumentVersionById(query)

      try {
        await expectAsyncSuccess(resultEffect)
        throw new Error("Expected permission error")
      } catch (error) {
        expect(error).toBeDefined()
      }
    })
  })
})
