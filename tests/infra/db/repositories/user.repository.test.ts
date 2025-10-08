import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { Effect as E, Option as O, Exit } from "effect";
import { UserDrizzleRepository } from "@infra/repositories/user.repository";
import { setupTestDatabase, cleanupDatabase, TestDatabase } from "../../../setup/database";
import { createTestUserEntity } from "../../../factories/user.factory";
import { createUserId } from "../../../utils/test-id-helpers";

describe("UserDrizzleRepository Integration Tests", () => {
  let testDb: TestDatabase;
  let userRepository: UserDrizzleRepository;

  beforeAll(async () => {
    testDb = await setupTestDatabase();
    userRepository = new UserDrizzleRepository(testDb.db);
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    await cleanupDatabase(testDb.db);
  });

  describe("save (CREATE)", () => {
    it("should save a new user and return the entity", async () => {
      const userEntity = E.runSync(
        createTestUserEntity({
          email: "john.doe@example.com",
          roles: ["USER"],
          workspaceId: { _tag: "None" },
        })
      );

      const savedUser = await E.runPromise(userRepository.save(userEntity));

      expect(savedUser.id).toBe(userEntity.id);
      expect(savedUser.email).toBe("john.doe@example.com");
      expect(savedUser.roles).toEqual(["USER"]);
      expect(O.isNone(savedUser.workspaceId)).toBe(true);
    });

    it("should save user with workspaceId", async () => {
      const workspaceId = crypto.randomUUID();
      const userEntity = E.runSync(
        createTestUserEntity({
          email: "workspace.user@example.com",
          workspaceId: { _tag: "Some", value: workspaceId },
        })
      );

      const savedUser = await E.runPromise(userRepository.save(userEntity));

      expect(O.isSome(savedUser.workspaceId)).toBe(true);
      expect(O.getOrNull(savedUser.workspaceId)).toBe(workspaceId);
    });

    it("should fail when saving user with duplicate email", async () => {
      const userEntity1 = E.runSync(
        createTestUserEntity({ email: "duplicate@example.com" })
      );
      const userEntity2 = E.runSync(
        createTestUserEntity({ email: "duplicate@example.com" })
      );

      await E.runPromise(userRepository.save(userEntity1));

      const result = E.runSyncExit(userRepository.save(userEntity2));

      expect(Exit.isFailure(result)).toBe(true);
    });

    it("should save user with ADMIN role", async () => {
      const userEntity = E.runSync(
        createTestUserEntity({
          email: "admin@example.com",
          roles: ["ADMIN"],
        })
      );

      const savedUser = await E.runPromise(userRepository.save(userEntity));

      expect(savedUser.roles).toEqual(["ADMIN"]);
    });
  });

  describe("findById (READ)", () => {
    it("should find user by id", async () => {
      const userEntity = E.runSync(
        createTestUserEntity({ email: "findme@example.com" })
      );
      await E.runPromise(userRepository.save(userEntity));

      const foundOpt = await E.runPromise(userRepository.findById(userEntity.id));

      expect(O.isSome(foundOpt)).toBe(true);
      const found = O.getOrThrow(foundOpt);
      expect(found.id).toBe(userEntity.id);
      expect(found.email).toBe("findme@example.com");
    });

    it("should return None for non-existent user id", async () => {
      const nonExistentId = createUserId();

      const foundOpt = await E.runPromise(userRepository.findById(nonExistentId));

      expect(O.isNone(foundOpt)).toBe(true);
    });
  });

  describe("findByEmail (READ)", () => {
    it("should find user by email", async () => {
      const userEntity = E.runSync(
        createTestUserEntity({ email: "search@example.com" })
      );
      await E.runPromise(userRepository.save(userEntity));

      const foundOpt = await E.runPromise(userRepository.findByEmail("search@example.com" as any));

      expect(O.isSome(foundOpt)).toBe(true);
      const found = O.getOrThrow(foundOpt);
      expect(found.email).toBe("search@example.com");
    });

    it("should return None for non-existent email", async () => {
      const nonExistentEmail = E.runSync(
        E.succeed("nonexistent@example.com")
      );
      const foundOpt = await E.runPromise(
        userRepository.findByEmail(nonExistentEmail as any)
      );

      expect(O.isNone(foundOpt)).toBe(true);
    });
  });

  describe("exists (READ)", () => {
    it("should return true when user exists", async () => {
      const userEntity = E.runSync(
        createTestUserEntity({ email: "exists@example.com" })
      );
      await E.runPromise(userRepository.save(userEntity));

      const exists = await E.runPromise(userRepository.exists(userEntity.id));

      expect(exists).toBe(true);
    });

    it("should return false when user does not exist", async () => {
      const nonExistentId = createUserId();

      const exists = await E.runPromise(userRepository.exists(nonExistentId));

      expect(exists).toBe(false);
    });
  });

  describe("save (UPDATE)", () => {
    it("should update existing user", async () => {
      const userEntity = E.runSync(
        createTestUserEntity({ email: "original@example.com", roles: ["USER"] })
      );
      const saved = await E.runPromise(userRepository.save(userEntity));

      // Get serialized form and update roles
      const serialized = E.runSync(saved.serialized());
      const updatedSerialized = {
        ...serialized,
        roles: ["ADMIN"] as const,
      };
      
      const updatedEntity = E.runSync(
        createTestUserEntity(updatedSerialized)
      );

      const result = await E.runPromise(userRepository.save(updatedEntity));

      expect(result.id).toBe(saved.id);
      expect(result.roles).toEqual(["ADMIN"]);
    });

    it("should update workspaceId", async () => {
      const userEntity = E.runSync(
        createTestUserEntity({
          email: "workspace-update@example.com",
          workspaceId: { _tag: "None" },
        })
      );
      const saved = await E.runPromise(userRepository.save(userEntity));

      const newWorkspaceId = crypto.randomUUID();
      const updatedEntity = E.runSync(
        createTestUserEntity({
          id: saved.id,
          email: saved.email,
          passwordHash: saved.passwordHash,
          roles: saved.roles,
          workspaceId: { _tag: "Some", value: newWorkspaceId },
          createdAt: saved.createdAt.toISOString(),
        })
      );

      const result = await E.runPromise(userRepository.save(updatedEntity));

      expect(O.isSome(result.workspaceId)).toBe(true);
      expect(O.getOrNull(result.workspaceId)).toBe(newWorkspaceId);
    });
  });

  describe("delete (DELETE)", () => {
    it("should delete user by id", async () => {
      const userEntity = E.runSync(
        createTestUserEntity({ email: "delete-me@example.com" })
      );
      await E.runPromise(userRepository.save(userEntity));

      const deleted = await E.runPromise(userRepository.delete(userEntity.id));

      expect(deleted).toBe(true);

      const foundOpt = await E.runPromise(userRepository.findById(userEntity.id));
      expect(O.isNone(foundOpt)).toBe(true);
    });

    it("should return false when deleting non-existent user", async () => {
      const nonExistentId = createUserId();

      const deleted = await E.runPromise(userRepository.delete(nonExistentId));

      expect(deleted).toBe(false);
    });
  });

  describe("Serialization Round-trip", () => {
    it("should correctly serialize and deserialize user with all fields", async () => {
      const workspaceId = crypto.randomUUID();
      const originalEntity = E.runSync(
        createTestUserEntity({
          email: "roundtrip@example.com",
          roles: ["ADMIN"],
          workspaceId: { _tag: "Some", value: workspaceId },
        })
      );

      const saved = await E.runPromise(userRepository.save(originalEntity));
      const fetched = await E.runPromise(userRepository.findById(saved.id));

      const user = O.getOrThrow(fetched);
      expect(user.id).toBe(originalEntity.id);
      expect(user.email).toBe(originalEntity.email);
      expect(user.passwordHash).toBe(originalEntity.passwordHash);
      expect(user.roles).toEqual(originalEntity.roles);
      expect(O.getOrNull(user.workspaceId)).toBe(workspaceId);
    });

    it("should correctly handle None workspaceId", async () => {
      const originalEntity = E.runSync(
        createTestUserEntity({
          email: "no-workspace@example.com",
          workspaceId: { _tag: "None" },
        })
      );

      const saved = await E.runPromise(userRepository.save(originalEntity));
      const fetched = await E.runPromise(userRepository.findById(saved.id));

      const user = O.getOrThrow(fetched);
      expect(O.isNone(user.workspaceId)).toBe(true);
    });
  });
});

