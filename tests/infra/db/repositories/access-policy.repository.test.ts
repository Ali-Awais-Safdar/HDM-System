import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { Effect as E, Option as O } from "effect";
import { eq, sql } from "drizzle-orm";
import { AccessPolicyDrizzleRepository } from "@infra/repositories/access-policy.repository";
import { setupTestDatabase, cleanupDatabase, createTestUser, createTestDocument, TestDatabase } from "../../../setup/database";
import { createTestAccessPolicyEntity, createUserReadPolicy, createUserWritePolicy, createRolePolicy } from "../../../factories/access-policy.factory";
import { createDocumentId } from "../../../utils/test-id-helpers";

describe("AccessPolicyDrizzleRepository Integration Tests", () => {
  let testDb: TestDatabase;
  let policyRepository: AccessPolicyDrizzleRepository;
  let testUserId: string;
  let testDocumentId: string;

  beforeAll(async () => {
    testDb = await setupTestDatabase();
    policyRepository = new AccessPolicyDrizzleRepository(testDb.db);
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    await cleanupDatabase(testDb.db);

    // Create prerequisite test user and document
    const user = await createTestUser(testDb.db, { email: "policy-user@example.com" });
    testUserId = user.id;

    const versionId = crypto.randomUUID();
    const document = await createTestDocument(testDb.db, testUserId, {
      title: "Document for Policies",
      currentVersionId: versionId,
    });
    testDocumentId = document.id;
  });

  describe("save (CREATE)", () => {
    it("should save a new user-based access policy", async () => {
      const policyData = createUserReadPolicy(testUserId, testDocumentId);
      const policyEntity = E.runSync(createTestAccessPolicyEntity(policyData));

      const savedPolicy = await E.runPromise(policyRepository.save(policyEntity));

      expect(savedPolicy.id).toBe(policyEntity.id);
      expect(savedPolicy.resourceId).toBe(testDocumentId);
      expect(savedPolicy.subjectType).toBe("user");
      expect(savedPolicy.subjectId).toBe(testUserId);
      expect(savedPolicy.actions).toContain("read");
    });

    it("should save a role-based access policy", async () => {
      const policyData = createRolePolicy("ADMIN", testDocumentId, "admin");
      const policyEntity = E.runSync(createTestAccessPolicyEntity(policyData));

      const savedPolicy = await E.runPromise(policyRepository.save(policyEntity));

      expect(savedPolicy.subjectType).toBe("role");
      expect(savedPolicy.role).toBe("ADMIN");
      expect(savedPolicy.subjectId).toBeUndefined();
      expect(savedPolicy.actions).toContain("read");
      expect(savedPolicy.actions).toContain("delete");
    });

    it("should save policy with multiple actions", async () => {
      const policyData = createUserWritePolicy(testUserId, testDocumentId);
      const policyEntity = E.runSync(createTestAccessPolicyEntity(policyData));

      const savedPolicy = await E.runPromise(policyRepository.save(policyEntity));

      const actions = savedPolicy.actions;
      expect(actions).toContain("read");
      expect(actions).toContain("update");
      expect(actions).toContain("download");
    });
  });

  describe("findById (READ)", () => {
    it("should find policy by id", async () => {
      const policyData = createUserReadPolicy(testUserId, testDocumentId);
      const policyEntity = E.runSync(createTestAccessPolicyEntity(policyData));
      await E.runPromise(policyRepository.save(policyEntity));

      const foundOpt = await E.runPromise(policyRepository.findById(policyEntity.id));

      expect(O.isSome(foundOpt)).toBe(true);
      const found = O.getOrThrow(foundOpt);
      expect(found.id).toBe(policyEntity.id);
    });

    it("should return None for non-existent policy id", async () => {
      const nonExistentId = createDocumentId();

      const foundOpt = await E.runPromise(policyRepository.findById(nonExistentId as any));

      expect(O.isNone(foundOpt)).toBe(true);
    });
  });

  describe("findByResourceId (READ)", () => {
    it("should find all policies for a resource", async () => {
      const user2 = await createTestUser(testDb.db, { email: "user2@example.com" });

      const policy1Data = createUserReadPolicy(testUserId, testDocumentId);
      const policy2Data = createUserWritePolicy(user2.id, testDocumentId);

      const policy1 = E.runSync(createTestAccessPolicyEntity(policy1Data));
      const policy2 = E.runSync(createTestAccessPolicyEntity(policy2Data));

      await E.runPromise(policyRepository.save(policy1));
      await E.runPromise(policyRepository.save(policy2));

      const policies = await E.runPromise(
        policyRepository.findByResourceId(testDocumentId as any)
      );

      expect(policies.length).toBe(2);
      expect(policies.some((p) => p.subjectId === testUserId)).toBe(true);
      expect(policies.some((p) => p.subjectId === user2.id)).toBe(true);
    });

    it("should return empty array for resource with no policies", async () => {
      const versionId = crypto.randomUUID();
      const newDoc = await createTestDocument(testDb.db, testUserId as any, {
        title: "No Policies Doc",
        currentVersionId: versionId,
      });

      const policies = await E.runPromise(policyRepository.findByResourceId(newDoc.id as any));

      expect(policies.length).toBe(0);
    });
  });

  describe("findBySubject (READ)", () => {
    it("should find policies by user subject type", async () => {
      const policyData = createUserReadPolicy(testUserId, testDocumentId);
      const policyEntity = E.runSync(createTestAccessPolicyEntity(policyData));
      await E.runPromise(policyRepository.save(policyEntity));

      const policies = await E.runPromise(
        policyRepository.findBySubject("user", testUserId as any)
      );

      expect(policies.length).toBeGreaterThan(0);
      expect(policies.every((p) => p.subjectType === "user")).toBe(true);
      expect(policies.every((p) => p.subjectId === testUserId)).toBe(true);
    });

    it("should find policies by role subject type", async () => {
      const policyData = createRolePolicy("ADMIN", testDocumentId, "admin");
      const policyEntity = E.runSync(createTestAccessPolicyEntity(policyData));
      await E.runPromise(policyRepository.save(policyEntity));

      const policies = await E.runPromise(
        policyRepository.findBySubject("role", undefined, "ADMIN")
      );

      expect(policies.length).toBeGreaterThan(0);
      expect(policies.every((p) => p.subjectType === "role")).toBe(true);
      expect(policies.every((p) => p.role === "ADMIN")).toBe(true);
    });
  });

  describe("findByUserAndResource (READ)", () => {
    it("should find policies for specific user and resource", async () => {
      const policyData = createUserReadPolicy(testUserId, testDocumentId);
      const policyEntity = E.runSync(createTestAccessPolicyEntity(policyData));
      await E.runPromise(policyRepository.save(policyEntity));

      const policies = await E.runPromise(
        policyRepository.findByUserAndResource(testUserId as any, testDocumentId as any)
      );

      expect(policies.length).toBe(1);
      expect(policies[0]?.subjectId).toBe(testUserId);
      expect(policies[0]?.resourceId).toBe(testDocumentId);
    });

    it("should return empty array when no policies exist for user and resource", async () => {
      const otherUser = await createTestUser(testDb.db, { email: "other@example.com" });

      const policies = await E.runPromise(
        policyRepository.findByUserAndResource(otherUser.id as any, testDocumentId as any)
      );

      expect(policies.length).toBe(0);
    });
  });

  describe("exists (READ)", () => {
    it("should return true when policy exists", async () => {
      const policyData = createUserReadPolicy(testUserId, testDocumentId);
      const policyEntity = E.runSync(createTestAccessPolicyEntity(policyData));
      await E.runPromise(policyRepository.save(policyEntity));

      const exists = await E.runPromise(policyRepository.exists(policyEntity.id));

      expect(exists).toBe(true);
    });

    it("should return false when policy does not exist", async () => {
      const nonExistentId = crypto.randomUUID();

      const exists = await E.runPromise(policyRepository.exists(nonExistentId));

      expect(exists).toBe(false);
    });
  });

  describe("save (UPDATE)", () => {
    it("should update existing policy actions", async () => {
      const policyData = createUserReadPolicy(testUserId, testDocumentId);
      const policyEntity = E.runSync(createTestAccessPolicyEntity(policyData));
      const saved = await E.runPromise(policyRepository.save(policyEntity));

      // Update actions to include write permissions
      const updatedData = createUserWritePolicy(testUserId, testDocumentId, { id: saved.id });
      const updatedEntity = E.runSync(createTestAccessPolicyEntity(updatedData));

      const result = await E.runPromise(policyRepository.save(updatedEntity));

      expect(result.id).toBe(saved.id);
      expect(result.actions).toContain("update");
    });
  });

  describe("delete (DELETE)", () => {
    it("should delete policy by id", async () => {
      const policyData = createUserReadPolicy(testUserId, testDocumentId);
      const policyEntity = E.runSync(createTestAccessPolicyEntity(policyData));
      await E.runPromise(policyRepository.save(policyEntity));

      const deleted = await E.runPromise(policyRepository.delete(policyEntity.id));

      expect(deleted).toBe(true);

      const foundOpt = await E.runPromise(policyRepository.findById(policyEntity.id));
      expect(O.isNone(foundOpt)).toBe(true);
    });

    it("should return false when deleting non-existent policy", async () => {
      const nonExistentId = crypto.randomUUID();

      const deleted = await E.runPromise(policyRepository.delete(nonExistentId));

      expect(deleted).toBe(false);
    });
  });

  describe("deleteByResourceId (DELETE)", () => {
    it("should delete all policies for a resource", async () => {
      const user2 = await createTestUser(testDb.db, { email: "user2@example.com" });

      const policy1Data = createUserReadPolicy(testUserId, testDocumentId);
      const policy2Data = createUserWritePolicy(user2.id, testDocumentId);

      const policy1 = E.runSync(createTestAccessPolicyEntity(policy1Data));
      const policy2 = E.runSync(createTestAccessPolicyEntity(policy2Data));

      await E.runPromise(policyRepository.save(policy1));
      await E.runPromise(policyRepository.save(policy2));

      const deletedCount = await E.runPromise(
        policyRepository.deleteByResourceId(testDocumentId as any)
      );

      expect(deletedCount).toBe(2);

      const policies = await E.runPromise(
        policyRepository.findByResourceId(testDocumentId as any)
      );
      expect(policies.length).toBe(0);
    });
  });

  describe("deleteByUserId (DELETE)", () => {
    it("should delete all policies for a user", async () => {
      const versionId2 = crypto.randomUUID();
      const doc2 = await createTestDocument(testDb.db, testUserId, {
        title: "Second Document",
        currentVersionId: versionId2,
      });

      const policy1Data = createUserReadPolicy(testUserId, testDocumentId);
      const policy2Data = createUserWritePolicy(testUserId, doc2.id);

      const policy1 = E.runSync(createTestAccessPolicyEntity(policy1Data));
      const policy2 = E.runSync(createTestAccessPolicyEntity(policy2Data));

      await E.runPromise(policyRepository.save(policy1));
      await E.runPromise(policyRepository.save(policy2));

      const deletedCount = await E.runPromise(
        policyRepository.deleteByUserId(testUserId as any)
      );

      expect(deletedCount).toBe(2);

      const policies = await E.runPromise(
        policyRepository.findBySubject("user", testUserId as any)
      );
      expect(policies.length).toBe(0);
    });
  });

  describe("Cascade Delete", () => {
    it("should cascade delete policies when parent document is deleted", async () => {
      const versionId = crypto.randomUUID();
      const newDoc = await createTestDocument(testDb.db, testUserId as any, {
        title: "Cascade Test Doc",
        currentVersionId: versionId,
      });

      const policyData = createUserReadPolicy(testUserId, newDoc.id);
      const policyEntity = E.runSync(createTestAccessPolicyEntity(policyData));
      await E.runPromise(policyRepository.save(policyEntity));

      // Delete the parent document
      const { documents: docsTable } = testDb.db._.fullSchema;
      await testDb.db.delete(docsTable).where(eq((docsTable as any).id, newDoc.id));

      // Verify policy is also deleted
      const foundOpt = await E.runPromise(policyRepository.findById(policyEntity.id));
      expect(O.isNone(foundOpt)).toBe(true);
    });

    it("should cascade delete policies when subject user is deleted", async () => {
      const user2 = await createTestUser(testDb.db, { email: "delete-cascade@example.com" });

      const policyData = createUserReadPolicy(user2.id, testDocumentId);
      const policyEntity = E.runSync(createTestAccessPolicyEntity(policyData));
      await E.runPromise(policyRepository.save(policyEntity));

      // Delete the subject user
      const { users: usersTable } = testDb.db._.fullSchema;
      await testDb.db.delete(usersTable).where(eq((usersTable as any).id, user2.id));

      // Verify policy is also deleted
      const foundOpt = await E.runPromise(policyRepository.findById(policyEntity.id));
      expect(O.isNone(foundOpt)).toBe(true);
    });
  });

  describe("Serialization Round-trip", () => {
    it("should correctly serialize and deserialize user-based policy", async () => {
      const policyData = createUserWritePolicy(testUserId, testDocumentId);
      const originalEntity = E.runSync(createTestAccessPolicyEntity(policyData));

      const saved = await E.runPromise(policyRepository.save(originalEntity));
      const fetched = await E.runPromise(policyRepository.findById(saved.id));

      const policy = O.getOrThrow(fetched);
      expect(policy.id).toBe(originalEntity.id);
      expect(policy.resourceId).toBe(testDocumentId);
      expect(policy.subjectType).toBe("user");
      expect(policy.subjectId).toBe(testUserId);
      expect(policy.actions).toEqual(originalEntity.actions);
    });

    it("should correctly serialize and deserialize role-based policy", async () => {
      const policyData = createRolePolicy("ADMIN", testDocumentId, "admin");
      const originalEntity = E.runSync(createTestAccessPolicyEntity(policyData));

      const saved = await E.runPromise(policyRepository.save(originalEntity));
      const fetched = await E.runPromise(policyRepository.findById(saved.id));

      const policy = O.getOrThrow(fetched);
      expect(policy.subjectType).toBe("role");
      expect(policy.role).toBe("ADMIN");
      expect(policy.subjectId).toBeUndefined();
    });
  });

  describe("Index Usage and Query Performance", () => {
    it("should leverage resource_idx when querying by resourceId", async () => {
      const policyData = createUserReadPolicy(testUserId, testDocumentId);
      const policyEntity = E.runSync(createTestAccessPolicyEntity(policyData));
      await E.runPromise(policyRepository.save(policyEntity));

      const policies = await E.runPromise(
        policyRepository.findByResourceId(testDocumentId as any)
      );

      expect(policies.length).toBeGreaterThan(0);
    });

    it("should leverage subject_idx when querying by subjectId", async () => {
      const policyData = createUserReadPolicy(testUserId, testDocumentId);
      const policyEntity = E.runSync(createTestAccessPolicyEntity(policyData));
      await E.runPromise(policyRepository.save(policyEntity));

      const policies = await E.runPromise(
        policyRepository.findBySubject("user", testUserId as any)
      );

      expect(policies.length).toBeGreaterThan(0);
    });

    it("should use index scan for resourceId filter (no seq scan)", async () => {
      const execResult = await testDb.db.execute(sql`EXPLAIN (COSTS OFF, FORMAT TEXT) SELECT * FROM access_policies WHERE resource_id = ${testDocumentId} LIMIT 1`);
      const rows = ((execResult as any).rows ?? execResult) as Array<Record<string, string>>;
      const planText = rows.map((r) => Object.values(r)[0] as string).join("\n");
      expect(/Index Scan|Bitmap Index Scan/i.test(planText)).toBe(true);
      expect(/Seq Scan/i.test(planText)).toBe(false);
    });
  });
});

