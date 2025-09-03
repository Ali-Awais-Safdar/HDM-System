import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShareDocumentUseCase } from "../../../src/application/use-cases/share-document.use-case";
import { Document } from "../../../src/domain/entities/document.entity";
import { Permission } from "../../../src/domain/entities/permission.entity";
import { asDocumentId, asUserId, asMimeType, asFileSize } from "../../../src/shared/types/brand";
import { ok, err } from "../../../src/shared/result/result";

describe("ShareDocumentUseCase", () => {
  let useCase: ShareDocumentUseCase;
  let mockDocumentRepository: any;
  let mockPermissionRepository: any;

  beforeEach(() => {
    mockDocumentRepository = {
      findById: vi.fn(),
    };

    mockPermissionRepository = {
      findByDocumentAndUser: vi.fn(),
      save: vi.fn(),
      updatePermissionLevel: vi.fn(),
    };

    useCase = new ShareDocumentUseCase(mockDocumentRepository, mockPermissionRepository);
  });

  const mockDocument = Document.create({
    id: asDocumentId("doc-123"),
    ownerId: asUserId("owner-456"),
    title: "Test Document",
    mimeType: asMimeType("application/pdf"),
    size: asFileSize(1024),
    storageKey: "test-key",
    metadata: {},
    tags: [],
  });

  describe("execute", () => {
    it("should allow document owner to share with another user", async () => {
      const shareParams = {
        documentId: asDocumentId("doc-123"),
        targetUserId: asUserId("user-789"),
        permissionLevel: "read" as const,
      };

      // Mock document exists
      mockDocumentRepository.findById.mockResolvedValue(ok(mockDocument));
      
      // Mock requester has no explicit permissions (but is owner)
      mockPermissionRepository.findByDocumentAndUser.mockResolvedValue(ok(null));
      
      // Mock permission service methods
      const mockPermissionService = {
        grantPermission: vi.fn().mockResolvedValue(ok(Permission.create({
          documentId: shareParams.documentId,
          userId: shareParams.targetUserId,
          level: shareParams.permissionLevel,
        }))),
      };

      // Replace the permission service in the use case
      (useCase as any).permissionService = mockPermissionService;

      const result = await useCase.execute(
        asUserId("owner-456"), // requester is owner
        "user",
        shareParams
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.granted).toBe(true);
        expect(result.value.permissionLevel).toBe("read");
      }
      expect(mockPermissionService.grantPermission).toHaveBeenCalledWith(
        shareParams.documentId,
        shareParams.targetUserId,
        shareParams.permissionLevel
      );
    });

    it("should allow admin to share any document", async () => {
      const shareParams = {
        documentId: asDocumentId("doc-123"),
        targetUserId: asUserId("user-789"),
        permissionLevel: "write" as const,
      };

      // Mock document exists
      mockDocumentRepository.findById.mockResolvedValue(ok(mockDocument));
      
      // Mock requester permissions
      mockPermissionRepository.findByDocumentAndUser.mockResolvedValue(ok(null));
      
      // Mock permission service
      const mockPermissionService = {
        grantPermission: vi.fn().mockResolvedValue(ok(Permission.create({
          documentId: shareParams.documentId,
          userId: shareParams.targetUserId,
          level: shareParams.permissionLevel,
        }))),
      };
      (useCase as any).permissionService = mockPermissionService;

      const result = await useCase.execute(
        asUserId("admin-123"), // admin user
        "admin",
        shareParams
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.granted).toBe(true);
        expect(result.value.permissionLevel).toBe("write");
      }
    });

    it("should allow user with admin permission to share document", async () => {
      const shareParams = {
        documentId: asDocumentId("doc-123"),
        targetUserId: asUserId("user-789"),
        permissionLevel: "read" as const,
      };

      const adminPermission = Permission.create({
        documentId: shareParams.documentId,
        userId: asUserId("user-with-admin"),
        level: "admin",
      });

      // Mock document exists
      mockDocumentRepository.findById.mockResolvedValue(ok(mockDocument));
      
      // Mock requester has admin permission
      mockPermissionRepository.findByDocumentAndUser.mockResolvedValue(ok(adminPermission));
      
      // Mock permission service
      const mockPermissionService = {
        grantPermission: vi.fn().mockResolvedValue(ok(Permission.create({
          documentId: shareParams.documentId,
          userId: shareParams.targetUserId,
          level: shareParams.permissionLevel,
        }))),
      };
      (useCase as any).permissionService = mockPermissionService;

      const result = await useCase.execute(
        asUserId("user-with-admin"),
        "user",
        shareParams
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.granted).toBe(true);
      }
    });

    it("should deny sharing when user has insufficient permissions", async () => {
      const shareParams = {
        documentId: asDocumentId("doc-123"),
        targetUserId: asUserId("user-789"),
        permissionLevel: "read" as const,
      };

      const readPermission = Permission.create({
        documentId: shareParams.documentId,
        userId: asUserId("user-with-read"),
        level: "read",
      });

      // Mock document exists
      mockDocumentRepository.findById.mockResolvedValue(ok(mockDocument));
      
      // Mock requester has only read permission
      mockPermissionRepository.findByDocumentAndUser.mockResolvedValue(ok(readPermission));

      const result = await useCase.execute(
        asUserId("user-with-read"),
        "user",
        shareParams
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("ACCESS_DENIED");
        expect(result.error.message).toContain("Access denied");
      }
    });

    it("should handle document not found", async () => {
      const shareParams = {
        documentId: asDocumentId("nonexistent-doc"),
        targetUserId: asUserId("user-789"),
        permissionLevel: "read" as const,
      };

      // Mock document not found
      mockDocumentRepository.findById.mockResolvedValue(ok(null));

      const result = await useCase.execute(
        asUserId("owner-456"),
        "user",
        shareParams
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DOCUMENT_NOT_FOUND");
      }
    });

    it("should handle document repository error", async () => {
      const shareParams = {
        documentId: asDocumentId("doc-123"),
        targetUserId: asUserId("user-789"),
        permissionLevel: "read" as const,
      };

      // Mock document repository error
      mockDocumentRepository.findById.mockResolvedValue(err(new Error("Database error")));

      const result = await useCase.execute(
        asUserId("owner-456"),
        "user",
        shareParams
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DOCUMENT_NOT_FOUND");
      }
    });

    it("should handle permission check failure", async () => {
      const shareParams = {
        documentId: asDocumentId("doc-123"),
        targetUserId: asUserId("user-789"),
        permissionLevel: "read" as const,
      };

      // Mock document exists
      mockDocumentRepository.findById.mockResolvedValue(ok(mockDocument));
      
      // Mock permission check failure
      mockPermissionRepository.findByDocumentAndUser.mockResolvedValue(err(new Error("Permission check failed")));

      const result = await useCase.execute(
        asUserId("user-123"),
        "user",
        shareParams
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PERMISSION_CHECK_FAILED");
      }
    });

    it("should handle permission grant failure", async () => {
      const shareParams = {
        documentId: asDocumentId("doc-123"),
        targetUserId: asUserId("user-789"),
        permissionLevel: "read" as const,
      };

      // Mock document exists
      mockDocumentRepository.findById.mockResolvedValue(ok(mockDocument));
      
      // Mock requester is owner
      mockPermissionRepository.findByDocumentAndUser.mockResolvedValue(ok(null));
      
      // Mock permission service failure
      const mockPermissionService = {
        grantPermission: vi.fn().mockResolvedValue(err(new Error("Grant failed"))),
      };
      (useCase as any).permissionService = mockPermissionService;

      const result = await useCase.execute(
        asUserId("owner-456"),
        "user",
        shareParams
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PERMISSION_GRANT_FAILED");
      }
    });

    it("should handle unexpected errors", async () => {
      const shareParams = {
        documentId: asDocumentId("doc-123"),
        targetUserId: asUserId("user-789"),
        permissionLevel: "read" as const,
      };

      // Mock document repository throws
      mockDocumentRepository.findById.mockRejectedValue(new Error("Unexpected error"));

      const result = await useCase.execute(
        asUserId("owner-456"),
        "user",
        shareParams
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNKNOWN_ERROR");
      }
    });
  });
});
