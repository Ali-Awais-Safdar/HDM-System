import { describe, expect, it, beforeEach } from "vitest";
import { Effect, Option } from "effect";
import { DocumentService, DocumentServiceError } from "../../../src/domain/services/document.service";
import { DocumentEntity } from "../../../src/domain/entities/document.entity";
import { AccessPolicyEntity } from "../../../src/domain/entities/access-policy.entity";
import { DocumentRepository, DocumentSearchFilters } from "../../../src/domain/ports/document.repository";
import { Paginated } from "../../../src/domain/types/pagination";
import { Role } from "../../../src/domain/schema/access-policy.schema";
import { faker } from "@faker-js/faker";
import { 
  createUserReadPolicy,
  createUserWritePolicy,
  createUserAdminPolicy 
} from "../../factories/access-policy.factory";
import { TestPatterns } from "../../utils/test.helpers";

/**
 * Document service-specific test data generators
 */
const documentServiceGenerators = {
  title: () => {
    const titles = [
      "Quarterly Report Q4 2024",
      "Employee Handbook v2.3",
      "Project Proposal",
      "Meeting Notes",
      "Financial Statement",
      "Technical Specification",
    ];
    return faker.helpers.arrayElement(titles);
  },
  
  description: () => faker.lorem.sentences(2),
  
  tags: () => {
    const availableTags = ["finance", "hr", "engineering", "urgent", "confidential"];
    const count = faker.number.int({ min: 1, max: 3 });
    return faker.helpers.arrayElements(availableTags, count);
  },
  
  documentId: () => crypto.randomUUID(),
  ownerId: () => crypto.randomUUID(),
  userId: () => crypto.randomUUID(),
  versionId: () => crypto.randomUUID(),
};

/**
 * Mock DocumentRepository for testing
 */
class MockDocumentRepository implements DocumentRepository {
  private documents: Map<string, DocumentEntity> = new Map();

  save(document: DocumentEntity): Effect.Effect<DocumentEntity, never> {
    this.documents.set(document.id, document);
    return Effect.succeed(document);
  }

  findById(id: string): Effect.Effect<Option.Option<DocumentEntity>, never> {
    const doc = this.documents.get(id);
    return Effect.succeed(doc ? Option.some(doc) : Option.none());
  }

  findByOwner(ownerId: string): Effect.Effect<readonly DocumentEntity[], never> {
    const docs = Array.from(this.documents.values()).filter(d => d.ownerId === ownerId);
    return Effect.succeed(docs);
  }

  search(_filters: DocumentSearchFilters): Effect.Effect<Paginated<DocumentEntity>, never> {
    const docs = Array.from(this.documents.values());
    const paginated: Paginated<DocumentEntity> = {
      data: docs,
      total: docs.length,
      pageNum: 1,
      pageSize: docs.length,
      totalPages: 1
    };
    return Effect.succeed(paginated);
  }

  exists(id: string): Effect.Effect<boolean, never> {
    return Effect.succeed(this.documents.has(id));
  }

  delete(id: string): Effect.Effect<boolean, never> {
    const existed = this.documents.has(id);
    this.documents.delete(id);
    return Effect.succeed(existed);
  }

  // Test helpers
  seedDocument(document: DocumentEntity): void {
    this.documents.set(document.id, document);
  }

  clear(): void {
    this.documents.clear();
  }

  getDocumentCount(): number {
    return this.documents.size;
  }
}

describe("DocumentService - Domain Service Tests", () => {
  let documentService: DocumentService;
  let documentRepository: MockDocumentRepository;

  // Test data constants
  const ownerId = documentServiceGenerators.ownerId() as any;
  const userId = documentServiceGenerators.userId() as any;
  const differentUserId = documentServiceGenerators.userId() as any;
  const currentVersionId = documentServiceGenerators.versionId() as any;

  beforeEach(() => {
    documentRepository = new MockDocumentRepository();
    documentService = new DocumentService(documentRepository);
  });

  describe("Service Initialization & Dependencies", () => {
    it("should create service with required dependencies", () => {
      expect(documentService).toBeInstanceOf(DocumentService);
    });

    it("should accept document repository implementation", () => {
      const service = new DocumentService(documentRepository);
      expect(service).toBeInstanceOf(DocumentService);
    });
  });

  describe("Service Data Generator Validation", () => {
    it("should generate realistic document titles", () => {
      const titles = Array.from({ length: 10 }, () => documentServiceGenerators.title());
      
      titles.forEach(title => {
        expect(title.length).toBeGreaterThan(0);
        expect(title.length).toBeLessThan(256);
      });
    });

    it("should generate valid tags", () => {
      const tagSets = Array.from({ length: 10 }, () => documentServiceGenerators.tags());
      
      tagSets.forEach(tags => {
        expect(Array.isArray(tags)).toBe(true);
        expect(tags.length).toBeGreaterThan(0);
        tags.forEach(tag => {
          expect(typeof tag).toBe("string");
          expect(tag.length).toBeGreaterThan(0);
        });
      });
    });

    it("should generate unique document IDs", () => {
      const ids = Array.from({ length: 20 }, () => documentServiceGenerators.documentId());
      const uniqueIds = new Set(ids);
      
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("createDocument - Document Creation", () => {
    it("should successfully create document with required fields", async () => {
      const title = documentServiceGenerators.title();

      const document = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, title, currentVersionId)
      );

      expect(document).toBeInstanceOf(DocumentEntity);
      expect(document.title).toBe(title);
      expect(document.ownerId).toBe(ownerId);
      expect(document.currentVersionId).toBe(currentVersionId);
      expect(documentRepository.getDocumentCount()).toBe(1);
    });

    it("should create document with description", async () => {
      const title = documentServiceGenerators.title();
      const description = documentServiceGenerators.description();

      const document = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, title, currentVersionId, description)
      );

      expect(document.hasDescription()).toBe(true);
      const desc = TestPatterns.Option.expectSome(document.description);
      expect(desc).toBe(description);
    });

    it("should create document with tags", async () => {
      const title = documentServiceGenerators.title();
      const tags = documentServiceGenerators.tags();

      const document = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, title, currentVersionId, null, tags)
      );

      expect(document.hasTags()).toBe(true);
      const docTags = TestPatterns.Option.expectSome(document.tags);
      expect(docTags).toEqual(tags);
    });

    it("should create document with all optional fields", async () => {
      const title = documentServiceGenerators.title();
      const description = documentServiceGenerators.description();
      const tags = documentServiceGenerators.tags();

      const document = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, title, currentVersionId, description, tags)
      );

      expect(document.hasDescription()).toBe(true);
      expect(document.hasTags()).toBe(true);
      expect(document.tagCount).toBeGreaterThan(0);
    });

    it("should generate unique document IDs", async () => {
      const doc1 = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, documentServiceGenerators.title(), currentVersionId)
      );

      const doc2 = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, documentServiceGenerators.title(), currentVersionId)
      );

      expect(doc1.id).not.toBe(doc2.id);
    });

    it("should set timestamps on creation", async () => {
      const beforeCreation = new Date();

      const document = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, documentServiceGenerators.title(), currentVersionId)
      );

      const afterCreation = new Date();

      expect(document.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreation.getTime());
      expect(document.createdAt.getTime()).toBeLessThanOrEqual(afterCreation.getTime());
    });

    it("should handle null description and tags", async () => {
      const document = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, documentServiceGenerators.title(), currentVersionId, null, null)
      );

      expect(document.hasDescription()).toBe(false);
      expect(document.hasTags()).toBe(false);
      TestPatterns.Option.expectNone(document.description);
      TestPatterns.Option.expectNone(document.tags);
    });

    it("should handle undefined description and tags", async () => {
      const document = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, documentServiceGenerators.title(), currentVersionId, undefined, undefined)
      );

      expect(document.hasDescription()).toBe(false);
      expect(document.hasTags()).toBe(false);
    });
  });

  describe("getDocument - Document Retrieval with Access Control", () => {
    let testDocument: DocumentEntity;
    let readPolicy: AccessPolicyEntity;
    let writePolicy: AccessPolicyEntity;
    let adminPolicy: AccessPolicyEntity;

    beforeEach(async () => {
      // Create test document directly through service
      testDocument = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, documentServiceGenerators.title(), currentVersionId)
      );

      // Create access policies using actual document ID
      readPolicy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createUserReadPolicy(userId, testDocument.id))
      );
      writePolicy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createUserWritePolicy(userId, testDocument.id))
      );
      adminPolicy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createUserAdminPolicy(userId, testDocument.id))
      );
    });

    it("should allow owner to access document", async () => {
      const document = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.getDocument(testDocument.id, ownerId, ["USER" as Role], [])
      );

      expect(document.id).toBe(testDocument.id);
      expect(document.ownerId).toBe(ownerId);
    });

    it("should allow admin role to access any document", async () => {
      const document = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.getDocument(testDocument.id, userId, ["ADMIN" as Role], [])
      );

      expect(document.id).toBe(testDocument.id);
    });

    it("should allow user with read policy to access document", async () => {
      const document = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.getDocument(testDocument.id, userId, ["USER" as Role], [readPolicy])
      );

      expect(document.id).toBe(testDocument.id);
    });

    it("should allow user with write policy to access document", async () => {
      const document = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.getDocument(testDocument.id, userId, ["USER" as Role], [writePolicy])
      );

      expect(document.id).toBe(testDocument.id);
    });

    it("should allow user with admin policy to access document", async () => {
      const document = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.getDocument(testDocument.id, userId, ["USER" as Role], [adminPolicy])
      );

      expect(document.id).toBe(testDocument.id);
    });

    it("should deny access to user without permissions", async () => {
      const error = await TestPatterns.Effect.expectAsyncFailure(
        documentService.getDocument(testDocument.id, differentUserId, ["USER" as Role], []),
        DocumentServiceError
      );

      expect(error).toBeInstanceOf(DocumentServiceError);
      expect(error.code).toBe("ACCESS_DENIED");
      expect(error.message).toContain("Insufficient permissions");
    });

    it("should return NOT_FOUND error for non-existent document", async () => {
      const nonExistentId = crypto.randomUUID() as any;

      const error = await TestPatterns.Effect.expectAsyncFailure(
        documentService.getDocument(nonExistentId, userId, ["ADMIN" as Role], []),
        DocumentServiceError
      );

      expect(error).toBeInstanceOf(DocumentServiceError);
      expect(error.code).toBe("NOT_FOUND");
    });
  });

  describe("updateDocument - Document Modification with Access Control", () => {
    let testDocument: DocumentEntity;
    let writePolicy: AccessPolicyEntity;

    beforeEach(async () => {
      // Create test document
      testDocument = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, documentServiceGenerators.title(), currentVersionId)
      );

      // Create write policy using actual document ID
      writePolicy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createUserWritePolicy(userId, testDocument.id))
      );
    });

    it("should allow owner to update document title", async () => {
      const newTitle = documentServiceGenerators.title();

      const updated = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.updateDocument(
          testDocument.id,
          ownerId,
          ["USER" as Role],
          [],
          { title: newTitle }
        )
      );

      expect(updated.title).toBe(newTitle);
      expect(updated.hasBeenUpdated()).toBe(true);
    });

    it("should allow user with write policy to update document", async () => {
      const newTitle = documentServiceGenerators.title();

      const updated = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.updateDocument(
          testDocument.id,
          userId,
          ["USER" as Role],
          [writePolicy],
          { title: newTitle }
        )
      );

      expect(updated.title).toBe(newTitle);
    });

    it("should update document description", async () => {
      const newDescription = documentServiceGenerators.description();

      const updated = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.updateDocument(
          testDocument.id,
          ownerId,
          ["USER" as Role],
          [],
          { description: newDescription }
        )
      );

      const desc = TestPatterns.Option.expectSome(updated.description);
      expect(desc).toBe(newDescription);
    });

    it("should update document tags", async () => {
      const newTags = documentServiceGenerators.tags();

      const updated = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.updateDocument(
          testDocument.id,
          ownerId,
          ["USER" as Role],
          [],
          { tags: newTags }
        )
      );

      const tags = TestPatterns.Option.expectSome(updated.tags);
      newTags.forEach(tag => {
        expect(tags).toContain(tag);
      });
    });

    it("should update multiple fields simultaneously", async () => {
      const updates = {
        title: documentServiceGenerators.title(),
        description: documentServiceGenerators.description(),
        tags: documentServiceGenerators.tags()
      };

      const updated = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.updateDocument(
          testDocument.id,
          ownerId,
          ["USER" as Role],
          [],
          updates
        )
      );

      expect(updated.title).toBe(updates.title);
      const desc = TestPatterns.Option.expectSome(updated.description);
      expect(desc).toBe(updates.description);
      const tags = TestPatterns.Option.expectSome(updated.tags);
      expect(tags).toEqual(expect.arrayContaining(updates.tags));
    });

    it("should set null description", async () => {
      const updated = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.updateDocument(
          testDocument.id,
          ownerId,
          ["USER" as Role],
          [],
          { description: null }
        )
      );

      TestPatterns.Option.expectNone(updated.description);
    });

    it("should deny update to user without write permissions", async () => {
      const error = await TestPatterns.Effect.expectAsyncFailure(
        documentService.updateDocument(
          testDocument.id,
          differentUserId,
          ["USER" as Role],
          [],
          { title: documentServiceGenerators.title() }
        ),
        DocumentServiceError
      );

      expect(error).toBeInstanceOf(DocumentServiceError);
      expect(error.code).toBe("ACCESS_DENIED");
    });

    it("should return NOT_FOUND for non-existent document", async () => {
      const nonExistentId = crypto.randomUUID() as any;

      const error = await TestPatterns.Effect.expectAsyncFailure(
        documentService.updateDocument(
          nonExistentId,
          ownerId,
          ["USER" as Role],
          [],
          { title: "Update" }
        ),
        DocumentServiceError
      );

      expect(error.code).toBe("NOT_FOUND");
    });

    it("should update updatedAt timestamp", async () => {
      const updated = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.updateDocument(
          testDocument.id,
          ownerId,
          ["USER" as Role],
          [],
          { title: "Updated" }
        )
      );

      expect(updated.hasBeenUpdated()).toBe(true);
      const updatedAt = TestPatterns.Option.expectSome(updated.updatedAt);
      expect(updatedAt).toBeInstanceOf(Date);
    });

    it("should handle empty updates gracefully", async () => {
      const updated = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.updateDocument(
          testDocument.id,
          ownerId,
          ["USER" as Role],
          [],
          {}
        )
      );

      expect(updated.id).toBe(testDocument.id);
    });
  });

  describe("deleteDocument - Document Deletion with Access Control", () => {
    let testDocument: DocumentEntity;
    let adminPolicy: AccessPolicyEntity;

    beforeEach(async () => {
      // Create test document
      testDocument = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, documentServiceGenerators.title(), currentVersionId)
      );

      // Create admin policy using actual document ID
      adminPolicy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createUserAdminPolicy(userId, testDocument.id))
      );
    });

    it("should allow owner to delete document", async () => {
      const result = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.deleteDocument(testDocument.id, ownerId, ["USER" as Role], [])
      );

      expect(result).toBe(true);
      expect(documentRepository.getDocumentCount()).toBe(0);
    });

    it("should allow admin role to delete any document", async () => {
      const result = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.deleteDocument(testDocument.id, userId, ["ADMIN" as Role], [])
      );

      expect(result).toBe(true);
      expect(documentRepository.getDocumentCount()).toBe(0);
    });

    it("should allow user with admin policy to delete document", async () => {
      const result = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.deleteDocument(testDocument.id, userId, ["USER" as Role], [adminPolicy])
      );

      expect(result).toBe(true);
    });

    it("should deny deletion to user without admin permissions", async () => {
      const writePolicy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createUserWritePolicy(userId, testDocument.id))
      );

      const error = await TestPatterns.Effect.expectAsyncFailure(
        documentService.deleteDocument(testDocument.id, userId, ["USER" as Role], [writePolicy]),
        DocumentServiceError
      );

      expect(error).toBeInstanceOf(DocumentServiceError);
      expect(error.code).toBe("ACCESS_DENIED");
      expect(documentRepository.getDocumentCount()).toBe(1); // Document still exists
    });

    it("should deny deletion to user with only read permissions", async () => {
      const readPolicy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createUserReadPolicy(userId, testDocument.id))
      );

      const error = await TestPatterns.Effect.expectAsyncFailure(
        documentService.deleteDocument(testDocument.id, userId, ["USER" as Role], [readPolicy]),
        DocumentServiceError
      );

      expect(error.code).toBe("ACCESS_DENIED");
    });

    it("should return NOT_FOUND for non-existent document", async () => {
      const nonExistentId = crypto.randomUUID() as any;

      const error = await TestPatterns.Effect.expectAsyncFailure(
        documentService.deleteDocument(nonExistentId, ownerId, ["USER" as Role], []),
        DocumentServiceError
      );

      expect(error.code).toBe("NOT_FOUND");
    });

    it("should maintain repository consistency after deletion", async () => {
      const initialCount = documentRepository.getDocumentCount();

      await TestPatterns.Effect.expectAsyncSuccess(
        documentService.deleteDocument(testDocument.id, ownerId, ["USER" as Role], [])
      );

      expect(documentRepository.getDocumentCount()).toBe(initialCount - 1);

      // Verify document is truly gone
      const error = await TestPatterns.Effect.expectAsyncFailure(
        documentService.getDocument(testDocument.id, ownerId, ["USER" as Role], []),
        DocumentServiceError
      );

      expect(error.code).toBe("NOT_FOUND");
    });
  });

  describe("Integration Scenarios", () => {
    it("should support complete document lifecycle", async () => {
      // Create
      const created = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, documentServiceGenerators.title(), currentVersionId)
      );

      expect(created).toBeInstanceOf(DocumentEntity);

      // Read
      const retrieved = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.getDocument(created.id, ownerId, ["USER" as Role], [])
      );

      expect(retrieved.id).toBe(created.id);

      // Update
      const newTitle = documentServiceGenerators.title();
      const updated = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.updateDocument(
          created.id,
          ownerId,
          ["USER" as Role],
          [],
          { title: newTitle }
        )
      );

      expect(updated.title).toBe(newTitle);

      // Delete
      const deleted = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.deleteDocument(created.id, ownerId, ["USER" as Role], [])
      );

      expect(deleted).toBe(true);
    });

    it("should handle multiple documents for same owner", async () => {
      const doc1 = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, documentServiceGenerators.title(), currentVersionId)
      );

      const doc2 = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, documentServiceGenerators.title(), currentVersionId)
      );

      const doc3 = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, documentServiceGenerators.title(), currentVersionId)
      );

      expect(documentRepository.getDocumentCount()).toBe(3);
      expect(doc1.ownerId).toBe(doc2.ownerId);
      expect(doc2.ownerId).toBe(doc3.ownerId);
    });

    it("should enforce access control across multiple operations", async () => {
      // Create document
      const document = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, documentServiceGenerators.title(), currentVersionId)
      );

      // User without permissions cannot read
      await TestPatterns.Effect.expectAsyncFailure(
        documentService.getDocument(document.id, userId, ["USER" as Role], []),
        DocumentServiceError
      );

      // User without permissions cannot update
      await TestPatterns.Effect.expectAsyncFailure(
        documentService.updateDocument(document.id, userId, ["USER" as Role], [], { title: documentServiceGenerators.title() }),
        DocumentServiceError
      );

      // User without permissions cannot delete
      await TestPatterns.Effect.expectAsyncFailure(
        documentService.deleteDocument(document.id, userId, ["USER" as Role], []),
        DocumentServiceError
      );

      // Document should still exist
      expect(documentRepository.getDocumentCount()).toBe(1);
    });

    it("should handle concurrent document operations", async () => {
      const createPromises = Array.from({ length: 5 }, () =>
        Effect.runPromise(
          documentService.createDocument(ownerId, documentServiceGenerators.title(), currentVersionId)
        )
      );

      const documents = await Promise.all(createPromises);

      expect(documents).toHaveLength(5);
      expect(documentRepository.getDocumentCount()).toBe(5);

      // All should have unique IDs
      const ids = new Set(documents.map(d => d.id));
      expect(ids.size).toBe(5);
    });
  });

  describe("Error Handling & Edge Cases", () => {
    it("should handle repository failures gracefully", async () => {
      class FailingRepository extends MockDocumentRepository {
        save(): Effect.Effect<DocumentEntity, never> {
          return Effect.die(new Error("Repository failure"));
        }
      }

      const failingService = new DocumentService(new FailingRepository());

      await expect(
        Effect.runPromise(failingService.createDocument(ownerId, documentServiceGenerators.title(), currentVersionId))
      ).rejects.toThrow();
    });

    it("should maintain consistency on access denial", async () => {
      const document = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, documentServiceGenerators.title(), currentVersionId)
      );

      const originalTitle = document.title;

      // Failed update attempt
      await TestPatterns.Effect.expectAsyncFailure(
        documentService.updateDocument(
          document.id,
          differentUserId,
          ["USER" as Role],
          [],
          { title: documentServiceGenerators.title() }
        ),
        DocumentServiceError
      );

      // Original document should be unchanged
      const retrieved = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.getDocument(document.id, ownerId, ["USER" as Role], [])
      );

      expect(retrieved.title).toBe(originalTitle);
    });

    it("should handle invalid permission combinations", async () => {
      const document = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, "Test", currentVersionId)
      );

      // User has read policy but tries to delete (needs admin)
      const readPolicy = TestPatterns.Effect.expectSuccess(
        AccessPolicyEntity.create(createUserReadPolicy(userId, document.id))
      );

      const error = await TestPatterns.Effect.expectAsyncFailure(
        documentService.deleteDocument(document.id, userId, ["USER" as Role], [readPolicy]),
        DocumentServiceError
      );

      expect(error.code).toBe("ACCESS_DENIED");
    });
  });

  describe("Service Boundaries & Domain Rules", () => {
    it("should enforce domain entity invariants", async () => {
      const title = documentServiceGenerators.title();
      const document = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, title, currentVersionId)
      );

      expect(document.title).toBeDefined();
      expect(document.title.length).toBeGreaterThan(0);
      expect(document.ownerId).toBeDefined();
      expect(document.currentVersionId).toBeDefined();
    });

    it("should return immutable domain entities", async () => {
      const originalTitle = documentServiceGenerators.title();
      const document = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, originalTitle, currentVersionId)
      );

      // Attempt to mutate (should not affect repository)
      const newTitle = documentServiceGenerators.title();
      const updated = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.updateDocument(
          document.id,
          ownerId,
          ["USER" as Role],
          [],
          { title: newTitle }
        )
      );

      // Original object should be unchanged (immutability)
      expect(document.title).toBe(originalTitle);
      expect(updated.title).toBe(newTitle);
    });

    it("should maintain access control policy integrity", async () => {
      const document = await TestPatterns.Effect.expectAsyncSuccess(
        documentService.createDocument(ownerId, documentServiceGenerators.title(), currentVersionId)
      );

      // Test various role combinations
      const testCases = [
        { roles: ["ADMIN" as Role], policies: [], shouldSucceed: true },
        { roles: ["USER" as Role], policies: [], shouldSucceed: false },
        { roles: [] as Role[], policies: [], shouldSucceed: false },
      ];

      for (const testCase of testCases) {
        if (testCase.shouldSucceed) {
          await TestPatterns.Effect.expectAsyncSuccess(
            documentService.getDocument(document.id, userId, testCase.roles, testCase.policies)
          );
        } else {
          await TestPatterns.Effect.expectAsyncFailure(
            documentService.getDocument(document.id, userId, testCase.roles, testCase.policies),
            DocumentServiceError
          );
        }
      }
    });
  });
});

