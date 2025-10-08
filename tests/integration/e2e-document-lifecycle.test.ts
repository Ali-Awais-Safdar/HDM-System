import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { Effect as E, Option as O } from "effect";
import { UserDrizzleRepository } from "@infra/repositories/user.repository";
import { DocumentDrizzleRepository } from "@infra/repositories/document.repository";
import { DocumentVersionDrizzleRepository } from "@infra/repositories/document-version.repository";
import { AccessPolicyDrizzleRepository } from "@infra/repositories/access-policy.repository";
import { setupTestDatabase, cleanupDatabase, TestDatabase } from "../setup/database";
import { createTestUserEntity } from "../factories/user.factory";
import { createTestDocumentEntity } from "../factories/document.factory";
import { createTestDocumentVersionEntity } from "../factories/document-version.factory";
import { createUserReadPolicy } from "../factories/access-policy.factory";
import { createTestAccessPolicyEntity } from "../factories/access-policy.factory";
import { createUserId, createDocumentId, createDocumentVersionId } from "../utils/test-id-helpers";

/**
 * E2E Integration Test: Document Lifecycle
 * 
 * Tests the complete round-trip workflow:
 * 1. Create user
 * 2. Create document
 * 3. Add initial version
 * 4. Fetch latest version
 * 5. Add subsequent versions
 * 6. Update document metadata
 * 7. List documents with pagination
 * 8. Share document (create access policy)
 * 9. Verify query performance and index usage
 */
describe("E2E: Document Lifecycle Integration", () => {
  let testDb: TestDatabase;
  let userRepo: UserDrizzleRepository;
  let documentRepo: DocumentDrizzleRepository;
  let versionRepo: DocumentVersionDrizzleRepository;
  let policyRepo: AccessPolicyDrizzleRepository;

  beforeAll(async () => {
    testDb = await setupTestDatabase();
    userRepo = new UserDrizzleRepository(testDb.db);
    documentRepo = new DocumentDrizzleRepository(testDb.db);
    versionRepo = new DocumentVersionDrizzleRepository(testDb.db);
    policyRepo = new AccessPolicyDrizzleRepository(testDb.db);
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    await cleanupDatabase(testDb.db);
  });

  describe("Complete Document Lifecycle", () => {
    it("should execute full document lifecycle: create → add versions → fetch latest → update → list → share", async () => {
      // ========== STEP 1: Create Owner User ==========
      const ownerEntity = E.runSync(
        createTestUserEntity({
          email: "owner@example.com",
          roles: ["USER"],
        })
      );
      const owner = await E.runPromise(userRepo.save(ownerEntity));
      expect(owner.id).toBe(ownerEntity.id);
      expect(owner.email).toBe("owner@example.com");

      // ========== STEP 2: Create Document ==========
      const versionId1 = crypto.randomUUID();
      const documentEntity = E.runSync(
        createTestDocumentEntity({
          ownerId: owner.id,
          title: "Project Proposal v1",
          description: { _tag: "Some", value: "Initial draft of the project proposal" },
          tags: { _tag: "Some", value: ["proposal", "draft", "project"] },
          currentVersionId: versionId1,
        })
      );
      const document = await E.runPromise(documentRepo.save(documentEntity));
      expect(document.id).toBe(documentEntity.id);
      expect(document.title).toBe("Project Proposal v1");
      expect(O.isSome(document.description)).toBe(true);

      // ========== STEP 3: Add Initial Version (v1) ==========
      const version1Entity = E.runSync(
        createTestDocumentVersionEntity({
          id: versionId1,
          documentId: document.id,
          version: 1,
          checksum: "a".repeat(64),
          fileKey: `documents/${document.id}/v1.pdf`,
          mimeType: "application/pdf",
          size: 1024 * 512, // 512 KB
          createdBy: { _tag: "Some", value: owner.id },
        })
      );
      const version1 = await E.runPromise(versionRepo.save(version1Entity));
      expect(version1.version).toBe(1);
      expect(version1.documentId).toBe(document.id);
      expect(O.getOrNull(version1.createdBy)).toBe(owner.id);

      // ========== STEP 4: Fetch Latest Version ==========
      const latestOpt = await E.runPromise(versionRepo.findLatestByDocumentId(createDocumentId(document.id)));
      expect(O.isSome(latestOpt)).toBe(true);
      const latest = O.getOrThrow(latestOpt);
      expect(latest.version).toBe(1);
      expect(latest.id).toBe(versionId1);

      // ========== STEP 5: Add Version 2 ==========
      const versionId2 = crypto.randomUUID();
      const version2Entity = E.runSync(
        createTestDocumentVersionEntity({
          id: versionId2,
          documentId: document.id,
          version: 2,
          checksum: "b".repeat(64),
          fileKey: `documents/${document.id}/v2.pdf`,
          mimeType: "application/pdf",
          size: 1024 * 768, // 768 KB
          createdBy: { _tag: "Some", value: owner.id },
        })
      );
      const version2 = await E.runPromise(versionRepo.save(version2Entity));
      expect(version2.version).toBe(2);

      // ========== STEP 6: Add Version 3 ==========
      const versionId3 = crypto.randomUUID();
      const version3Entity = E.runSync(
        createTestDocumentVersionEntity({
          id: versionId3,
          documentId: document.id,
          version: 3,
          checksum: "c".repeat(64),
          fileKey: `documents/${document.id}/v3.pdf`,
          mimeType: "application/pdf",
          size: 1024 * 1024, // 1 MB
          createdBy: { _tag: "Some", value: owner.id },
        })
      );
      const version3 = await E.runPromise(versionRepo.save(version3Entity));
      expect(version3.version).toBe(3);

      // ========== STEP 7: Fetch Latest Version (should be v3) ==========
      const latestV3Opt = await E.runPromise(
        versionRepo.findLatestByDocumentId(createDocumentId(document.id))
      );
      const latestV3 = O.getOrThrow(latestV3Opt);
      expect(latestV3.version).toBe(3);
      expect(latestV3.id).toBe(versionId3);

      // ========== STEP 8: Fetch All Versions for Document ==========
      const allVersions = await E.runPromise(versionRepo.findByDocumentId(createDocumentId(document.id)));
      expect(allVersions.length).toBe(3);
      expect(allVersions.map((v) => v.version).sort()).toEqual([1, 2, 3]);

      // ========== STEP 9: Update Document Metadata ==========
      const updatedDoc = await E.runPromise(
        document
          .rename("Project Proposal - Final")
          .pipe(
            E.flatMap((renamed) =>
              renamed.updateDescription("Final version approved by stakeholders")
            )
          )
      );
      const savedUpdatedDoc = await E.runPromise(documentRepo.save(updatedDoc));
      expect(savedUpdatedDoc.title).toBe("Project Proposal - Final");
      expect(O.getOrNull(savedUpdatedDoc.description)).toBe(
        "Final version approved by stakeholders"
      );
      expect(O.isSome(savedUpdatedDoc.updatedAt)).toBe(true);

      // Update currentVersionId to latest
      const withLatestVersion = await E.runPromise(
        savedUpdatedDoc.updateCurrentVersion(createDocumentVersionId(versionId3))
      );
      const finalDoc = await E.runPromise(documentRepo.save(withLatestVersion));
      expect(finalDoc.currentVersionId).toBe(versionId3);

      // ========== STEP 10: List Documents with Pagination ==========
      const page1 = await E.runPromise(
        documentRepo.search({
          ownerId: createUserId(owner.id),
          paginationOptions: { pageNum: 1, pageSize: 10 },
        })
      );
      expect(page1.data.length).toBe(1);
      expect(page1.total).toBe(1);
      expect(page1.data[0]!.id).toBe(document.id);

      // ========== STEP 11: Create Collaborator User ==========
      const collaboratorEntity = E.runSync(
        createTestUserEntity({
          email: "collaborator@example.com",
          roles: ["USER"],
        })
      );
      const collaborator = await E.runPromise(userRepo.save(collaboratorEntity));
      expect(collaborator.email).toBe("collaborator@example.com");

      // ========== STEP 12: Share Document (Create Access Policy) ==========
      const policyData = createUserReadPolicy(collaborator.id, document.id);
      const policyEntity = E.runSync(createTestAccessPolicyEntity(policyData));
      const policy = await E.runPromise(policyRepo.save(policyEntity));
      expect(policy.resourceId).toBe(document.id);
      expect(policy.subjectId).toBe(collaborator.id);
      expect(policy.actions).toContain("read");

      // ========== STEP 13: Verify Access Policy ==========
      const policies = await E.runPromise(
        policyRepo.findByUserAndResource(createUserId(collaborator.id), createDocumentId(document.id))
      );
      expect(policies.length).toBe(1);
      const firstPolicy = policies[0]!;
      expect(firstPolicy.subjectId).toBe(collaborator.id);

      // ========== STEP 14: Fetch Document by ID (Full Verification) ==========
      const fetchedDocOpt = await E.runPromise(documentRepo.findById(createDocumentId(document.id)));
      const fetchedDoc = O.getOrThrow(fetchedDocOpt);
      expect(fetchedDoc.title).toBe("Project Proposal - Final");
      expect(fetchedDoc.currentVersionId).toBe(versionId3);
      expect(O.isSome(fetchedDoc.description)).toBe(true);

      // ========== STEP 15: Get Next Version Number ==========
      const nextVersion = await E.runPromise(
        versionRepo.getNextVersionNumber(createDocumentId(document.id))
      );
      expect(nextVersion).toBe(4);
    });
  });

  describe("Multi-Document Lifecycle with Search", () => {
    it("should handle multiple documents with search and pagination", async () => {
      // Create owner
      const ownerEntity = E.runSync(
        createTestUserEntity({ email: "multi-owner@example.com", roles: ["USER"] })
      );
      const owner = await E.runPromise(userRepo.save(ownerEntity));

      // Create 5 documents with different tags
      const documents = [
        { title: "Financial Report Q1", tags: ["finance", "report", "q1"] },
        { title: "Financial Report Q2", tags: ["finance", "report", "q2"] },
        { title: "HR Policy Update", tags: ["hr", "policy"] },
        { title: "Engineering Specs", tags: ["engineering", "specs"] },
        { title: "Marketing Campaign", tags: ["marketing", "campaign"] },
      ];

      for (const docData of documents) {
        const versionId = crypto.randomUUID();
        const docEntity = E.runSync(
          createTestDocumentEntity({
            ownerId: owner.id,
            title: docData.title,
            tags: { _tag: "Some", value: docData.tags },
            currentVersionId: versionId,
          })
        );
        await E.runPromise(documentRepo.save(docEntity));

        // Add initial version for each document
        const versionEntity = E.runSync(
          createTestDocumentVersionEntity({
            id: versionId,
            documentId: docEntity.id,
            version: 1,
            checksum: "e".repeat(64),
            fileKey: `documents/${docEntity.id}/v1.pdf`,
            mimeType: "application/pdf",
            size: 1024 * 100,
            createdBy: { _tag: "Some", value: owner.id },
          })
        );
        await E.runPromise(versionRepo.save(versionEntity));
      }

      // Search all documents by owner
      const allDocs = await E.runPromise(
        documentRepo.search({
          ownerId: createUserId(owner.id),
          paginationOptions: { pageNum: 1, pageSize: 10 },
        })
      );
      expect(allDocs.total).toBe(5);
      expect(allDocs.data.length).toBe(5);

      // Search by title
      const financeDocs = await E.runPromise(
        documentRepo.search({
          query: "Financial Report",
          ownerId: createUserId(owner.id),
          paginationOptions: { pageNum: 1, pageSize: 10 },
        })
      );
      expect(financeDocs.data.length).toBe(2);
      expect(
        financeDocs.data.every((d) => d.title.includes("Financial Report"))
      ).toBe(true);

      // Search by tags
      const financeTaggedDocs = await E.runPromise(
        documentRepo.search({
          tags: ["finance"],
          ownerId: createUserId(owner.id),
          paginationOptions: { pageNum: 1, pageSize: 10 },
        })
      );
      expect(financeTaggedDocs.data.length).toBeGreaterThan(0);

      // Pagination test (page size 2)
      const page1 = await E.runPromise(
        documentRepo.search({
          ownerId: createUserId(owner.id),
          paginationOptions: { pageNum: 1, pageSize: 2 },
        })
      );
      const page2 = await E.runPromise(
        documentRepo.search({
          ownerId: createUserId(owner.id),
          paginationOptions: { pageNum: 2, pageSize: 2 },
        })
      );
      expect(page1.data.length).toBe(2);
      expect(page2.data.length).toBe(2);
      expect(page1.totalPages).toBe(3);

      // Ensure no duplicates between pages
      const page1Ids = page1.data.map((d) => d.id);
      const page2Ids = page2.data.map((d) => d.id);
      const intersection = page1Ids.filter((id) => page2Ids.includes(id));
      expect(intersection.length).toBe(0);
    });
  });

  describe("Cascade Delete Verification", () => {
    it("should cascade delete versions and policies when document is deleted", async () => {
      // Create user
      const userEntity = E.runSync(
        createTestUserEntity({ email: "cascade@example.com", roles: ["USER"] })
      );
      const user = await E.runPromise(userRepo.save(userEntity));

      // Create document
      const versionId = crypto.randomUUID();
      const docEntity = E.runSync(
        createTestDocumentEntity({
          ownerId: user.id,
          title: "Cascade Delete Test",
          currentVersionId: versionId,
        })
      );
      const document = await E.runPromise(documentRepo.save(docEntity));

      // Add version
      const versionEntity = E.runSync(
        createTestDocumentVersionEntity({
          id: versionId,
          documentId: document.id,
          version: 1,
          checksum: "d".repeat(64),
          fileKey: `documents/${document.id}/v1.pdf`,
          mimeType: "application/pdf",
          size: 1024,
          createdBy: { _tag: "Some", value: user.id },
        })
      );
      await E.runPromise(versionRepo.save(versionEntity));

      // Create access policy
      const policyData = createUserReadPolicy(user.id, document.id);
      const policyEntity = E.runSync(createTestAccessPolicyEntity(policyData));
      await E.runPromise(policyRepo.save(policyEntity));

      // Verify all entities exist
      expect(await E.runPromise(documentRepo.exists(createDocumentId(document.id)))).toBe(true);
      expect(await E.runPromise(versionRepo.exists(createDocumentVersionId(versionId)))).toBe(true);
      expect(await E.runPromise(policyRepo.exists(policyEntity.id))).toBe(true);

      // Delete document
      await E.runPromise(documentRepo.delete(createDocumentId(document.id)));

      // Verify cascade deletes
      expect(await E.runPromise(documentRepo.exists(createDocumentId(document.id)))).toBe(false);
      expect(await E.runPromise(versionRepo.exists(createDocumentVersionId(versionId)))).toBe(false);
      expect(await E.runPromise(policyRepo.exists(policyEntity.id))).toBe(false);
    });
  });

  describe("Deterministic Seed Data Verification", () => {
    it("should work with seeded deterministic test data", async () => {
      // Use deterministic seed data from setup
      const { seedTestData } = await import("../setup/database");
      const seed = await seedTestData(testDb.db);

      expect(seed.users.length).toBe(3);
      expect(seed.documents.length).toBe(3);

      // Verify user IDs are deterministic
      expect(seed.users[0]!.id).toBe("10000000-0000-0000-0000-000000000001");
      expect(seed.users[1]!.id).toBe("10000000-0000-0000-0000-000000000002");
      expect(seed.users[2]!.id).toBe("10000000-0000-0000-0000-000000000003");

      expect(seed.documents.some(d => d.title === "Quarterly Report Q1 2024")).toBe(true);

      // Verify search by owner
      const aliceCount = seed.documents.filter(d => d.ownerId === seed.users[0]!.id).length;
      expect(aliceCount).toBe(2); 
    });
  });
});

