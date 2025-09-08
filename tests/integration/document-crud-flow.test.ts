import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import multer from "multer";
import request from "supertest";
import { DocumentController } from "../../src/web/http/controllers/document.controller";
import { CreateDocumentUseCase } from "../../src/application/use-cases/create-document.use-case";
import { UpdateDocumentMetadataUseCase } from "../../src/application/use-cases/update-document-metadata.use-case";
import { DeleteDocumentUseCase } from "../../src/application/use-cases/delete-document.use-case";
import { GetDocumentUseCase } from "../../src/application/use-cases/get-document.use-case";
import { DocumentService, type DocumentRepository, type FileStorage } from "../../src/domain/services/document.service";
import { PermissionRepository } from "../../src/domain/services/permission.service";
import { LocalFileStorage } from "../../src/infra/storage/local-file-storage";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import os from "os";
import { asUserId } from "../../src/shared/types/brand";

// --- Minimal in-memory DocumentRepository for integration test ---
function makeInMemoryRepo(): DocumentRepository {
  const map = new Map<string, any>();
  return {
    findById: async (id) => ({ ok: true, value: map.get(id) ?? null }),
    findByOwner: async (ownerId) => ({ ok: true, value: [...map.values()].filter(d => d.ownerId === ownerId) }),
    search: async (_filters) => ({ ok: true, value: [...map.values()] }),
    save: async (doc) => { map.set(doc.id, doc); return { ok: true, value: doc }; },
    delete: async (id) => { map.delete(id as string); return { ok: true, value: undefined as void }; },
    // Transaction support methods (simplified for in-memory testing)
    saveInTransaction: async (doc, _tx) => { map.set(doc.id, doc); return { ok: true, value: doc }; },
    deleteInTransaction: async (id, _tx) => { map.delete(id as string); return { ok: true, value: undefined as void }; },
    executeInTransaction: async (operation) => {
      try {
        // For in-memory testing, we don't have real transactions, just call the operation
        return await operation({} as any);
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
      }
    }
  };
}

describe("Integration: /documents CRUD flow (with in-memory repo + real local storage)", () => {
  const tmpDir = mkdtempSync(join(os.tmpdir(), "dms-docs-"));
  const storage: FileStorage = new LocalFileStorage(tmpDir);
  const repo = makeInMemoryRepo();
  const svc = new DocumentService(repo, storage);

  // Mock permission repository for integration tests
  const permissionRepo: PermissionRepository = {
    findByDocumentAndUser: async () => ({ ok: true, value: null }),
    save: async () => ({ ok: true, value: {} as any }),
    findByDocument: async () => ({ ok: true, value: [] }),
    findByUser: async () => ({ ok: true, value: [] }),
    removeByDocumentAndUser: async () => ({ ok: true, value: true }),
    removeByDocument: async () => ({ ok: true, value: 0 }),
    updatePermissionLevel: async () => ({ ok: true, value: {} as any }),
    saveInTransaction: async () => ({ ok: true, value: {} as any }),
    removeInTransaction: async () => ({ ok: true, value: true }),
    updatePermissionLevelInTransaction: async () => ({ ok: true, value: {} as any }),
    executeInTransaction: async (operation: any) => operation({} as any)
  } as any;

  const createUC = new CreateDocumentUseCase(svc);
  const updateUC = new UpdateDocumentMetadataUseCase(svc);
  const deleteUC = new DeleteDocumentUseCase(svc);
  const getUC = new GetDocumentUseCase(svc);
  const controller = new DocumentController(createUC, updateUC, deleteUC, getUC, permissionRepo);

  let app: express.Express;
  beforeAll(async () => {
    app = express();
    app.use(express.json());
    const upload = multer({ storage: multer.memoryStorage() });
    // Simple auth shim: attach a test user
    app.use((req, _res, next) => { (req as any).user = { id: asUserId("11111111-1111-7111-8111-111111111111"), role: "user", email: "test@example.com" }; next(); });
    const router = express.Router();
    router.post("/", upload.single("file"), (req, _res, next) => {
      // For testing, set mimetype if it's undefined
      if (req.file && !req.file.mimetype) {
        req.file.mimetype = 'application/pdf';
      }
      next();
    }, controller.createDocument.bind(controller));
    router.get("/:id", controller.getDocument.bind(controller));
    router.patch("/:id/metadata", controller.updateMetadata.bind(controller));
    router.delete("/:id", controller.deleteDocument.bind(controller));
    app.use("/documents", router);
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("POST → GET → PATCH → DELETE end-to-end", async () => {
    // Create
    const createRes = await request(app)
      .post("/documents")
      .field("title", "Integration File")
      // keep metadata/tags omitted to avoid multipart JSON parsing issues; they default correctly
      .attach("file", Buffer.from("pdfdata"), { filename: "file.pdf", contentType: "application/pdf" })
      .expect(201);

    const { id, ownerId, mimeType, size } = createRes.body;
    expect(id).toBeTruthy();
    expect(ownerId).toBe("11111111-1111-7111-8111-111111111111");
    expect(mimeType).toBe("application/pdf");
    expect(size).toBe(Buffer.byteLength("pdfdata"));

    // Get
    const getRes = await request(app)
      .get(`/documents/${id}`)
      .expect(200);
    expect(getRes.body.id).toBe(id);

    // Update metadata
    const patchRes = await request(app)
      .patch(`/documents/${id}/metadata`)
      .send({ metadata: { status: "final", reviewed: true } })
      .expect(200);
    expect(patchRes.body.metadata).toMatchObject({ status: "final", reviewed: true });

    // Delete
    const delRes = await request(app)
      .delete(`/documents/${id}`)
      .expect(200);
    expect(delRes.body).toMatchObject({ success: true });

    // Verify gone
    await request(app).get(`/documents/${id}`).expect(404);
  });
});
