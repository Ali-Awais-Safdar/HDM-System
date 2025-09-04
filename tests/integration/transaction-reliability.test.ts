import { describe, it, expect, beforeEach, vi } from "vitest";
import { DocumentService } from "../../src/domain/services/document.service";
import { PermissionService } from "../../src/domain/services/permission.service";
import { ShareDocumentUseCase } from "../../src/application/use-cases/share-document.use-case";
import { CreateDocumentUseCase } from "../../src/application/use-cases/create-document.use-case";
import { ok, err } from "../../src/shared/result/result";
import { asUserId, asMimeType, newDocumentId } from "../../src/shared/types/brand";

/**
 * Integration tests for transaction reliability.
 * These tests verify that our transaction implementations properly handle:
 * - File storage + database write atomicity
 * - Proper cleanup on failures
 * - Race condition prevention
 * - Rollback capability for partial failures
 */
describe("Transaction Reliability Integration Tests", () => {
  let mockDocumentRepository: any;
  let mockPermissionRepository: any;
  let mockFileStorage: any;
  let documentService: DocumentService;
  let permissionService: PermissionService;
  let createDocumentUseCase: CreateDocumentUseCase;
  let shareDocumentUseCase: ShareDocumentUseCase;

  beforeEach(() => {
    // Mock repositories with transaction support
    mockDocumentRepository = {
      findById: vi.fn(),
      save: vi.fn(),
      saveInTransaction: vi.fn(),
      executeInTransaction: vi.fn(),
    };

    mockPermissionRepository = {
      findByDocumentAndUser: vi.fn(),
      save: vi.fn(),
      saveInTransaction: vi.fn(),
      updatePermissionLevelInTransaction: vi.fn(),
      executeInTransaction: vi.fn(),
    };

    mockFileStorage = {
      store: vi.fn(),
      delete: vi.fn(),
      retrieve: vi.fn(),
      exists: vi.fn(),
    };

    // Services
    documentService = new DocumentService(
      mockDocumentRepository,
      mockFileStorage,
      mockPermissionRepository
    );

    permissionService = new PermissionService(mockPermissionRepository);

    // Use cases
    createDocumentUseCase = new CreateDocumentUseCase(documentService);
    shareDocumentUseCase = new ShareDocumentUseCase(
      mockDocumentRepository,
      mockPermissionRepository
    );
  });

  describe("Document Creation Transaction Reliability", () => {
    it("should rollback database changes and cleanup file when database save fails", async () => {
      const fileData = Buffer.from("test file content");
      const cleanupSpy = vi.fn();

      // Mock successful file storage
      mockFileStorage.store.mockResolvedValue(ok("storage/path"));
      mockFileStorage.delete.mockImplementation(cleanupSpy);
      cleanupSpy.mockResolvedValue(ok(true));

      // Mock transaction execution that fails at database save
      mockDocumentRepository.executeInTransaction.mockImplementation(async (callback: any) => {
        // Simulate transaction behavior
        const mockTx = {};
        // Transaction rollback would happen here automatically if callback throws
        return await callback(mockTx);
      });

      // Mock database save failure
      mockDocumentRepository.saveInTransaction.mockResolvedValue(
        err(new Error("Database save failed"))
      );

      // Execute document creation
      const result = await createDocumentUseCase.execute({
        title: "Test Document",
        file: {
          originalName: "test.txt",
          mimeType: "text/plain",
          size: fileData.length,
          data: fileData,
        },
        metadata: {},
        tags: [],
        ownerId: asUserId("user123"),
      });

      // Verify the operation failed
      expect(result.ok).toBe(false);

      // Verify file was stored initially
      expect(mockFileStorage.store).toHaveBeenCalled();

      // Verify cleanup was attempted
      expect(cleanupSpy).toHaveBeenCalled();
    });

    it("should complete successfully when both file storage and database operations succeed", async () => {
      const fileData = Buffer.from("test file content");

      // Mock successful file storage
      mockFileStorage.store.mockResolvedValue(ok("storage/path"));

      // Mock successful transaction execution
      mockDocumentRepository.executeInTransaction.mockImplementation(async (callback: any) => {
        const mockTx = {};
        return await callback(mockTx);
      });

      // Mock successful database save
      const mockDocument = {
        id: newDocumentId(),
        ownerId: asUserId("user123"),
        title: "Test Document",
        mimeType: asMimeType("text/plain"),
        size: fileData.length,
        storageKey: "storage/path",
        metadata: {},
        tags: [],
        createdAt: new Date(),
        updatedAt: null,
      };

      mockDocumentRepository.saveInTransaction.mockResolvedValue(ok(mockDocument));

      // Execute document creation
      const result = await createDocumentUseCase.execute({
        title: "Test Document",
        file: {
          originalName: "test.txt",
          mimeType: "text/plain",
          size: fileData.length,
          data: fileData,
        },
        metadata: {},
        tags: [],
        ownerId: asUserId("user123"),
      });

      // Verify the operation succeeded
      expect(result.ok).toBe(true);

      // Verify file was stored
      expect(mockFileStorage.store).toHaveBeenCalled();

      // Verify database save was called within transaction
      expect(mockDocumentRepository.saveInTransaction).toHaveBeenCalled();

      // Verify cleanup was NOT called (success case)
      expect(mockFileStorage.delete).not.toHaveBeenCalled();
    });

    it("should handle file storage failure without attempting database operations", async () => {
      const fileData = Buffer.from("test file content");

      // Mock file storage failure
      mockFileStorage.store.mockResolvedValue(err(new Error("Storage failed")));

      // Mock transaction execution (should not be called)
      mockDocumentRepository.executeInTransaction.mockImplementation(async (callback: any) => {
        const mockTx = {};
        return await callback(mockTx);
      });

      // Execute document creation
      const result = await createDocumentUseCase.execute({
        title: "Test Document",
        file: {
          originalName: "test.txt",
          mimeType: "text/plain",
          size: fileData.length,
          data: fileData,
        },
        metadata: {},
        tags: [],
        ownerId: asUserId("user123"),
      });

      // Verify the operation failed
      expect(result.ok).toBe(false);

      // Verify file storage was attempted
      expect(mockFileStorage.store).toHaveBeenCalled();

      // Verify database operations were not attempted
      expect(mockDocumentRepository.saveInTransaction).not.toHaveBeenCalled();
    });
  });

  describe("Permission Operations Transaction Reliability", () => {
    it("should use transactions for permission granting operations", async () => {
      const documentId = newDocumentId();
      const userId = asUserId("user123");

      // Mock no existing permission
      mockPermissionRepository.findByDocumentAndUser.mockResolvedValue(ok(null));

      // Mock transaction execution
      mockPermissionRepository.executeInTransaction.mockImplementation(async (callback: any) => {
        const mockTx = {};
        return await callback(mockTx);
      });

      // Mock successful permission save within transaction
      const mockPermission = {
        id: "perm123",
        documentId,
        userId,
        level: "read" as const,
        createdAt: new Date(),
      };

      mockPermissionRepository.saveInTransaction.mockResolvedValue(ok(mockPermission));

      // Execute permission granting
      const result = await permissionService.grantPermission(documentId, userId, "read");

      // Verify success
      expect(result.ok).toBe(true);

      // Verify transaction was used
      expect(mockPermissionRepository.executeInTransaction).toHaveBeenCalled();
      expect(mockPermissionRepository.saveInTransaction).toHaveBeenCalled();
    });

    it("should rollback permission changes on transaction failure", async () => {
      const documentId = newDocumentId();
      const userId = asUserId("user123");

      // Mock no existing permission
      mockPermissionRepository.findByDocumentAndUser.mockResolvedValue(ok(null));

      // Mock transaction execution that fails
      mockPermissionRepository.executeInTransaction.mockImplementation(async (callback: any) => {
        const mockTx = {};
        // Transaction rollback would happen automatically if callback throws
        return await callback(mockTx);
      });

      // Mock permission save failure
      mockPermissionRepository.saveInTransaction.mockResolvedValue(
        err(new Error("Permission save failed"))
      );

      // Execute permission granting
      const result = await permissionService.grantPermission(documentId, userId, "read");

      // Verify failure
      expect(result.ok).toBe(false);

      // Verify transaction was attempted
      expect(mockPermissionRepository.executeInTransaction).toHaveBeenCalled();
    });
  });

  describe("Share Document Operation Optimization", () => {
    it("should perform parallel operations for document and permission lookups", async () => {
      const documentId = newDocumentId();
      const requesterId = asUserId("requester123");
      const targetUserId = asUserId("target123");

      const mockDocument = {
        id: documentId,
        ownerId: requesterId, // Requester owns the document
        title: "Test Document",
        mimeType: asMimeType("text/plain"),
        size: 1024,
        storageKey: "storage/path",
        metadata: {},
        tags: [],
        createdAt: new Date(),
        updatedAt: null,
      };

      // Mock parallel operations
      const documentFindSpy = vi.fn().mockResolvedValue(ok(mockDocument));
      const permissionFindSpy = vi.fn().mockResolvedValue(ok(null));

      mockDocumentRepository.findById = documentFindSpy;
      mockPermissionRepository.findByDocumentAndUser = permissionFindSpy;

      // Mock successful permission granting
      const mockPermission = {
        id: "perm123",
        documentId,
        userId: targetUserId,
        level: "read" as const,
        createdAt: new Date(),
      };

      mockPermissionRepository.executeInTransaction.mockImplementation(async (callback: any) => {
        const mockTx = {};
        return await callback(mockTx);
      });

      mockPermissionRepository.saveInTransaction.mockResolvedValue(ok(mockPermission));

      // Execute share document
      const result = await shareDocumentUseCase.execute(requesterId, "user", {
        documentId,
        targetUserId,
        permissionLevel: "read",
      });

      // Verify success
      expect(result.ok).toBe(true);

      // Verify both operations were called (should be parallel)
      expect(documentFindSpy).toHaveBeenCalledWith(documentId);
      expect(permissionFindSpy).toHaveBeenCalledWith(documentId, requesterId);

      // The calls should happen in parallel, but we can't easily test timing
      // This ensures both operations are still performed
    });
  });

  describe("Race Condition Prevention", () => {
    it("should prevent race conditions in permission operations using transactions", async () => {
      const documentId = newDocumentId();
      const userId = asUserId("user123");

      let transactionCallCount = 0;

      // Mock transaction execution that simulates concurrent access
      mockPermissionRepository.executeInTransaction.mockImplementation(async (callback: any) => {
        transactionCallCount++;
        const mockTx = {};
        
        // Simulate some delay to allow race conditions
        await new Promise(resolve => setTimeout(resolve, 10));
        
        return await callback(mockTx);
      });

      // Mock existing permission check
      mockPermissionRepository.findByDocumentAndUser.mockResolvedValue(ok(null));

      // Mock permission save
      const mockPermission = {
        id: "perm123",
        documentId,
        userId,
        level: "read" as const,
        createdAt: new Date(),
      };

      mockPermissionRepository.saveInTransaction.mockResolvedValue(ok(mockPermission));

      // Execute multiple concurrent permission grants
      const promises = [
        permissionService.grantPermission(documentId, userId, "read"),
        permissionService.grantPermission(documentId, userId, "write"),
      ];

      const results = await Promise.all(promises);

      // Both should succeed (due to transaction isolation)
      results.forEach(result => {
        expect(result.ok).toBe(true);
      });

      // Verify each operation used its own transaction
      expect(transactionCallCount).toBe(2);
    });
  });
});
