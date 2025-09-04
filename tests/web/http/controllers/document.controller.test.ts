import { describe, it, expect, vi } from "vitest";
import { DocumentController } from "../../../../src/web/http/controllers/document.controller";
import { CreateDocumentUseCase } from "../../../../src/application/use-cases/create-document.use-case";
import { UpdateDocumentMetadataUseCase } from "../../../../src/application/use-cases/update-document-metadata.use-case";
import { DeleteDocumentUseCase } from "../../../../src/application/use-cases/delete-document.use-case";
import { GetDocumentUseCase } from "../../../../src/application/use-cases/get-document.use-case";
import { PermissionRepository } from "../../../../src/domain/services/permission.service";
import { asUserId } from "../../../../src/shared/types/brand";

function mkRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("DocumentController", () => {
  const createUC = { execute: vi.fn() } as unknown as CreateDocumentUseCase;
  const updateUC = { execute: vi.fn() } as unknown as UpdateDocumentMetadataUseCase;
  const deleteUC = { execute: vi.fn() } as unknown as DeleteDocumentUseCase;
  const getUC = { execute: vi.fn() } as unknown as GetDocumentUseCase;
  const permissionRepo = { findByDocumentAndUser: vi.fn() } as unknown as PermissionRepository;
  const ctrl = new DocumentController(createUC, updateUC, deleteUC, getUC, permissionRepo);

  it("createDocument -> 401 when unauthenticated", async () => {
    const req: any = { 
      user: undefined, 
      file: undefined, 
      body: {},
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue('test-agent'),
      correlationId: 'test-correlation-id'
    };
    const res = mkRes();
    await ctrl.createDocument(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("createDocument -> 400 when file missing", async () => {
    const req: any = { 
      user: { id: asUserId("u") }, 
      file: undefined, 
      body: {},
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue('test-agent'),
      correlationId: 'test-correlation-id'
    };
    const res = mkRes();
    await ctrl.createDocument(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("createDocument -> 422 when body invalid", async () => {
    const req: any = {
      user: { id: asUserId("u") },
      file: { originalname: "a.pdf", mimetype: "application/pdf", size: 1, buffer: Buffer.alloc(1) },
      body: { title: "" }, // invalid
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue('test-agent'),
      correlationId: 'test-correlation-id'
    };
    const res = mkRes();
    await ctrl.createDocument(req, res);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it("createDocument -> 201 on success", async () => {
    const req: any = {
      user: { id: asUserId("u"), role: "user" },
      file: { originalname: "a.pdf", mimetype: "application/pdf", size: 1, buffer: Buffer.alloc(1) },
      body: { title: "T" },
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue('test-agent'),
      correlationId: 'test-correlation-id'
    };
    const res = mkRes();
    vi.mocked(createUC.execute).mockResolvedValue({
      ok: true,
      value: { id: "d1", title: "T", mimeType: "application/pdf", size: 1, metadata: {}, tags: [], ownerId: "u", createdAt: new Date(), updatedAt: null }
    } as any);
    await ctrl.createDocument(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: "d1" }));
  });

  it("getDocument -> 422 for invalid id", async () => {
    const req: any = { 
      user: { id: asUserId("u"), role: "user" }, 
      params: { id: "not-a-uuid" },
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue('test-agent'),
      correlationId: 'test-correlation-id'
    };
    const res = mkRes();
    await ctrl.getDocument(req, res);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it("getDocument -> 200 when found", async () => {
    const req: any = { 
      user: { id: asUserId("u"), role: "user" }, 
      params: { id: "550e8400-e29b-41d4-a716-446655440000" },
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue('test-agent'),
      correlationId: 'test-correlation-id'
    };
    const res = mkRes();
    vi.mocked(permissionRepo.findByDocumentAndUser).mockResolvedValue({ ok: true, value: null } as any);
    vi.mocked(getUC.execute).mockResolvedValue({ ok: true, value: { id: req.params.id } } as any);
    await ctrl.getDocument(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("updateMetadata -> 422 invalid body", async () => {
    const req: any = { 
      user: { id: asUserId("u"), role: "user" }, 
      params: { id: "01234567-89ab-cdef-0123-456789abcdef" }, 
      body: { metadata: "not-json" },
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue('test-agent'),
      correlationId: 'test-correlation-id'
    };
    const res = mkRes();
    await ctrl.updateMetadata(req, res);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it("deleteDocument -> 200 on success", async () => {
    const req: any = { 
      user: { id: asUserId("u"), role: "user" }, 
      params: { id: "550e8400-e29b-41d4-a716-446655440000" },
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue('test-agent'),
      correlationId: 'test-correlation-id'
    };
    const res = mkRes();
    vi.mocked(permissionRepo.findByDocumentAndUser).mockResolvedValue({ ok: true, value: null } as any);
    vi.mocked(deleteUC.execute).mockResolvedValue({ ok: true, value: { success: true, message: "Document deleted successfully" } } as any);
    await ctrl.deleteDocument(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
