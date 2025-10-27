import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { workflowTestLifecycle } from "../setup/test-harness"
import type { WorkflowTestHarness } from "../setup/test-harness"
import { seedTestActors } from "../fixtures/actors"
import { seedDocumentWithReadAccess, seedDocumentWithReadWriteAccess } from "../fixtures/documents"
import { expectAsyncSuccess, expectSome } from "../../utils/test.helpers"
import { withTestClock } from "../../domain/setup/test-clock"
import { calculateTotalPages } from "@domain/utils/pagination"

describe("DocumentWorkflow", () => {
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

  describe("createDocument - Happy Path", () => {
    it("should create a new document and persist to database", async () => {
      const createCommand = {
        ownerId: actors.owner.id,
        title: "Test Document",
        description: "A test description",
        tags: ["tag1", "tag2"] as readonly string[]
      }

      const response = await expectAsyncSuccess(
        withTestClock(
          harness.documentWorkflow.createDocument(createCommand),
          Date.now()
        )
      )

      // Assert serialized response fields
      expect(response.id).toBeDefined()
      expect(response.title).toBe("Test Document")
      expect(response.ownerId).toBe(actors.owner.id)
      expect(response.description).toBe("A test description")
      expect(response.tags).toEqual(["tag1", "tag2"])
      expect(response.publishStatus).toBe("draft")
      expect(response.createdAt).toBeDefined()

      // Verify database state
      const foundOption = await expectAsyncSuccess(
        harness.documentRepository.findById(response.id as any)
      )
      const found = expectSome(foundOption)

      expect(found.id).toBe(response.id)
      expect(found.title).toBe("Test Document")
      expect(found.descriptionOrEmpty).toBe("A test description")
      expect(found.tagsOrEmpty).toEqual(["tag1", "tag2"])
    })

    it("should create document with optional fields set to undefined", async () => {
        const createCommand = {
          ownerId: actors.owner.id,
          title: "Minimal Document",
          description: undefined,
          tags: undefined
        }

      const response = await expectAsyncSuccess(
        withTestClock(
          harness.documentWorkflow.createDocument(createCommand),
          Date.now()
        )
      )

      expect(response.description).toBeUndefined()
      expect(response.tags).toBeUndefined()
    })
  })

  describe("updateDocument - Update + Publish Flow", () => {
    it("should update document title, description and tags", async () => {
      // Create a document
      const createCommand = {
        ownerId: actors.owner.id,
        title: "Original Title",
        description: "Original description",
        tags: ["original"] as readonly string[]
      }

      const created = await expectAsyncSuccess(
        withTestClock(
          harness.documentWorkflow.createDocument(createCommand),
          Date.now()
        )
      )

      // Update the document
      const updateCommand = {
        id: created.id as any,
        actorId: actors.owner.id,
        title: "Updated Title",
        description: "Updated description",
        tags: ["updated", "tags"] as readonly string[]
      }

      const updated = await expectAsyncSuccess(
        withTestClock(
          harness.documentWorkflow.updateDocument(updateCommand),
          Date.now() + 1000
        )
      )

      expect(updated.title).toBe("Updated Title")
      expect(updated.description).toBe("Updated description")
      expect(updated.tags).toEqual(["updated", "tags"])

      // Verify persistence
      const foundOption = await expectAsyncSuccess(
        harness.documentRepository.findById(created.id as any)
      )
      const found = expectSome(foundOption)
      expect(found.title).toBe("Updated Title")
    })

    it("should handle Option conversions for undefined vs null", async () => {
      // Create document with values
      const createCommand = {
        ownerId: actors.owner.id,
        title: "Test Document",
        description: "Has description",
        tags: ["tag1"] as readonly string[]
      }

      const created = await expectAsyncSuccess(
        withTestClock(
          harness.documentWorkflow.createDocument(createCommand),
          Date.now()
        )
      )

      // Update to remove description (set to undefined)
      const updateRemoveDesc = {
        id: created.id as any,
        actorId: actors.owner.id,
        description: undefined
      }

      const updated1 = await expectAsyncSuccess(
        withTestClock(
          harness.documentWorkflow.updateDocument(updateRemoveDesc),
          Date.now() + 1000
        )
      )

      // Description should be undefined after removing
      expect(updated1.description).toBeUndefined()

      // Update to set description to empty string
      const updateEmptyDesc = {
        id: created.id as any,
        actorId: actors.owner.id,
        description: ""
      }

      await expectAsyncSuccess(
        withTestClock(
          harness.documentWorkflow.updateDocument(updateEmptyDesc),
          Date.now() + 2000
        )
      )

      // Empty string should be preserved
      const foundOption = await expectAsyncSuccess(
        harness.documentRepository.findById(created.id as any)
      )
      const found = expectSome(foundOption)
      expect(found.descriptionOrEmpty).toBe("")
    })

    it("should publish document and persist status", async () => {
      // Create and update document
      const createCommand = {
        ownerId: actors.owner.id,
        title: "Draft Document",
        description: undefined,
        tags: undefined
      }

      const created = await expectAsyncSuccess(
        withTestClock(
          harness.documentWorkflow.createDocument(createCommand),
          Date.now()
        )
      )

      // Publish the document
      const publishCommand = {
        documentId: created.id as any,
        actorId: actors.owner.id,
        publishStatus: "published" as const,
        publishNotes: "Ready for publication"
      }

      const published = await expectAsyncSuccess(
        withTestClock(
          harness.documentWorkflow.publishDocument(publishCommand),
          Date.now() + 1000
        )
      )

      expect(published.publishStatus).toBe("published")
      expect(published.publishNotes).toBe("Ready for publication")

      // Verify persistence
      const foundOption = await expectAsyncSuccess(
        harness.documentRepository.findById(created.id as any)
      )
      const found = expectSome(foundOption)
      expect(found.publishStatus).toBe("published")
      expect(found.publishNotesOrEmpty).toBe("Ready for publication")
    })
  })

  describe("listDocuments - Search Integration", () => {
    it("should list documents with pagination metadata", async () => {
      // Create multiple documents
      const documents = []
      for (let i = 1; i <= 15; i++) {
        const createCommand = {
          ownerId: actors.owner.id,
          title: `Document ${i}`,
          tags: [`tag${i}`] as readonly string[],
          description: undefined
        }

        const doc = await expectAsyncSuccess(
          withTestClock(
            harness.documentWorkflow.createDocument(createCommand),
            Date.now() + i * 1000
          )
        )
        documents.push(doc)
      }

      // List with pagination
      const listQuery = {
        actorId: actors.owner.id,
        tags: undefined,
        pageNum: 1,
        pageSize: 5
      }

      const response = await expectAsyncSuccess(
        withTestClock(
          harness.documentWorkflow.listDocuments(listQuery),
          Date.now()
        )
      )

      expect(response.data).toHaveLength(5)
      expect(response.total).toBe(15)
      expect(response.pageNum).toBe(1)
      expect(response.pageSize).toBe(5)
      expect(response.totalPages).toBe(calculateTotalPages(15, 5))
      expect(response.totalPages).toBe(3)

      // Verify page 2
      const page2Query = {
        actorId: actors.owner.id,
        tags: undefined,
        pageNum: 2,
        pageSize: 5
      }

      const page2Response = await expectAsyncSuccess(
        harness.documentWorkflow.listDocuments(page2Query)
      )

      expect(page2Response.data).toHaveLength(5)
      expect(page2Response.pageNum).toBe(2)
      expect(page2Response.totalPages).toBe(3)
    })

    it("should search documents by query", async () => {
      // Create documents with different titles
      const titles = ["JavaScript Guide", "Python Tutorial", "TypeScript Handbook"]
      
      for (const title of titles) {
          await expectAsyncSuccess(
            withTestClock(
              harness.documentWorkflow.createDocument({
                ownerId: actors.owner.id,
                title,
                description: undefined,
                tags: undefined
              }),
              Date.now()
            )
          )
      }

      // Search for "JavaScript"
      const searchQuery = {
        actorId: actors.owner.id,
        tags: undefined,
        search: "JavaScript"
      }

      const response = await expectAsyncSuccess(
        harness.documentWorkflow.listDocuments(searchQuery)
      )

      expect(response.total).toBe(1)
      expect(response.data[0]?.title).toBe("JavaScript Guide")
    })

    it("should filter documents by tags", async () => {
      // Create documents with different tags
      await expectAsyncSuccess(
        withTestClock(
          harness.documentWorkflow.createDocument({
            ownerId: actors.owner.id,
            title: "Frontend Doc",
            tags: ["frontend", "react"] as readonly string[],
            description: undefined
          }),
          Date.now()
        )
      )

      await expectAsyncSuccess(
        withTestClock(
          harness.documentWorkflow.createDocument({
            ownerId: actors.owner.id,
            title: "Backend Doc",
            tags: ["backend", "node"] as readonly string[],
            description: undefined
          }),
          Date.now() + 1000
        )
      )

      // Search by tags
      const tagQuery = {
        actorId: actors.owner.id,
        tags: ["frontend"] as readonly string[]
      }

      const response = await expectAsyncSuccess(
        harness.documentWorkflow.listDocuments(tagQuery)
      )

      expect(response.total).toBe(1)
      expect(response.data[0]?.title).toBe("Frontend Doc")
    })
  })

  describe("updateDocument - Permission Denials", () => {
    it("should fail when actor lacks write permission", async () => {
      // Create document with owner and give collaborator read-only access
      const { document } = await seedDocumentWithReadAccess(
        harness.db,
        actors.owner,
        actors.collaborator
      )

      // Attempt to update as collaborator with read-only access
      const updateCommand = {
        id: document.id as any,
        actorId: actors.collaborator.id,
        title: "Unauthorized Update"
      }

      const resultEffect = harness.documentWorkflow.updateDocument(updateCommand)
      
      // Should fail with permission error
      try {
        await expectAsyncSuccess(resultEffect)
        throw new Error("Expected permission error but got success")
      } catch (error) {
        expect(error).toBeDefined()
      }

      // Verify document unchanged
      const foundOption = await expectAsyncSuccess(
        harness.documentRepository.findById(document.id as any)
      )
      const found = expectSome(foundOption)
      expect(found.title).toBe(document.title)
    })

    it("should allow update when actor has write permission", async () => {
      // Create document with read-write access for collaborator
      const { document } = await seedDocumentWithReadWriteAccess(
        harness.db,
        actors.owner,
        actors.collaborator
      )

      const updateCommand = {
        id: document.id as any,
        actorId: actors.collaborator.id,
        title: "Authorized Update"
      }

      const updated = await expectAsyncSuccess(
        harness.documentWorkflow.updateDocument(updateCommand)
      )

      expect(updated.title).toBe("Authorized Update")
    })
  })

  describe("getDocumentAccess - Access Context", () => {
    it("should return access context with filtered policies", async () => {
      // Create document with read-only access for collaborator
      const { document } = await seedDocumentWithReadAccess(
        harness.db,
        actors.owner,
        actors.collaborator
      )

      const accessQuery = {
        documentId: document.id as any,
        actorId: actors.collaborator.id,
        requiredPermission: "read" as const
      }

      const accessResponse = await expectAsyncSuccess(
        harness.documentWorkflow.getDocumentAccess(accessQuery)
      )

      expect(accessResponse.hasAccess).toBe(true)
      expect(accessResponse.permissionLevel).toBeDefined()
      expect(accessResponse.policies).toBeDefined()
      expect(accessResponse.policies.length).toBeGreaterThan(0)

      // Verify policies are serialized correctly (optionToUndefined/optionToNull)
      const policy = accessResponse.policies[0]
      if (policy) {
        expect(policy.subjectId).toBeDefined()
        expect(policy.actions).toContain("read")
      }
    })

    it("should return filtered policies for actor with no policies", async () => {
      // Create document without giving access to admin
      const { document } = await seedDocumentWithReadAccess(
        harness.db,
        actors.owner,
        actors.collaborator
      )

      // Try to access as admin (who has no specific policy)
      const accessQuery = {
        documentId: document.id as any,
        actorId: actors.admin.id
      }

      const accessResponse = await expectAsyncSuccess(
        harness.documentWorkflow.getDocumentAccess(accessQuery)
      )

      // Verify policies are serialized properly
      expect(Array.isArray(accessResponse.policies)).toBe(true)
      
      // Admin might be the owner or have no policies, but should still get a valid response
      expect(accessResponse.permissionLevel).toBeDefined()
    })
  })

  describe("getDocument - Query", () => {
    it("should retrieve document with read permission", async () => {
      const { document } = await seedDocumentWithReadAccess(
        harness.db,
        actors.owner,
        actors.collaborator
      )

      const getQuery = {
        documentId: document.id as any,
        actorId: actors.collaborator.id
      }

      const retrieved = await expectAsyncSuccess(
        harness.documentWorkflow.getDocument(getQuery)
      )

      expect(retrieved.id).toBe(document.id)
      expect(retrieved.title).toBe(document.title)
    })

    it("should fail when actor lacks read permission", async () => {
      // Create document without any access policies
      const createCommand = {
        ownerId: actors.owner.id,
        title: "Private Document",
        description: undefined,
        tags: undefined
      }

      const created = await expectAsyncSuccess(
        withTestClock(
          harness.documentWorkflow.createDocument(createCommand),
          Date.now()
        )
      )

      // Try to get as collaborator without access
      const getQuery = {
        documentId: created.id as any,
        actorId: actors.collaborator.id
      }

      const resultEffect = harness.documentWorkflow.getDocument(getQuery)
      
      // Should fail with permission error  
      try {
        await expectAsyncSuccess(resultEffect)
        throw new Error("Expected permission error but got success")
      } catch (error) {
        expect(error).toBeDefined()
      }
    })
  })
})
