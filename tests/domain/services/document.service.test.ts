import { describe, it, expect, vi, beforeEach, type Mocked } from "vitest";
import { DocumentService, DocumentError } from "../../../src/domain/services/document.service";
import { Document } from "../../../src/domain/entities/document.entity";
import {
  asUserId,
  asMimeType,
  asFileSize,
  newDocumentId,
} from "../../../src/shared/types/brand";
import type {
  DocumentRepository,
  FileStorage,
} from "../../../src/domain/services/document.service";
import type { DatabaseTransaction } from "../../../src/lib/db/connection";

// Use the type of Document.create(...) props (not the constructor args!)
type DocCreateProps = Parameters<typeof Document.create>[0];

function mkDoc(overrides: Partial<DocCreateProps> = {}) {
  const id = overrides.id ?? newDocumentId();
  const ownerId = overrides.ownerId ?? asUserId("11111111-1111-7111-8111-111111111111");

  return Document.create({
    id,
    ownerId,
    title: overrides.title ?? "Title",
    mimeType: overrides.mimeType ?? asMimeType("application/pdf"),
    size: overrides.size ?? asFileSize(5),
    storageKey: overrides.storageKey ?? `documents/${String(id)}.pdf`,
    metadata: overrides.metadata ?? { a: 1 },
    tags: overrides.tags ?? ["t1"],
  });
}

describe("DocumentService", () => {
  let repo: Mocked<DocumentRepository>;
  let storage: Mocked<FileStorage>;
  let svc: DocumentService;

  beforeEach(() => {
    // Strictly typed mocks that match the interface signatures
    repo = {
      findById: vi.fn(),
      findByOwner: vi.fn(),
      search: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
      saveInTransaction: vi.fn(),
      deleteInTransaction: vi.fn(),
      executeInTransaction: vi.fn(),
    } as unknown as Mocked<DocumentRepository>;

    storage = {
      store: vi.fn(),
      retrieve: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
    } as unknown as Mocked<FileStorage>;

    svc = new DocumentService(repo, storage);
  });

  it("createDocument stores file, saves entity, and returns the document", async () => {
    const ownerId = asUserId("aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa");
    const data = Buffer.from("pdf");

    storage.store.mockResolvedValue({ ok: true, value: "storage/documents/xyz.pdf" });
    storage.delete.mockResolvedValue({ ok: true, value: undefined });
    
    // Mock the transaction execution to simulate successful save
    repo.executeInTransaction.mockImplementation(async (callback) => {
      const mockTx = {} as DatabaseTransaction;
      return await callback(mockTx);
    });
    
    // Mock the saveInTransaction method
    repo.saveInTransaction.mockImplementation(async (doc, _tx) => ({ ok: true, value: doc }));

    const res = await svc.createDocument(
      ownerId,
      "My PDF",
      asMimeType("application/pdf"),
      data,
      { cat: "legal" },
      ["a", "b"]
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const doc = res.value;
      expect(doc.ownerId).toBe(ownerId);
      expect(doc.title).toBe("My PDF");
      expect(doc.mimeType).toBe("application/pdf");
      expect(doc.size).toBe(data.length);
      expect(doc.storageKey).toMatch(/^documents\/.*\.pdf$/);
      expect(repo.executeInTransaction).toHaveBeenCalledOnce();
      expect(repo.saveInTransaction).toHaveBeenCalledOnce();
    }
  });

  it("createDocument fails if storage.store fails", async () => {
    storage.store.mockResolvedValue({ ok: false, error: new Error("disk full") } as any);
    
    // Mock the transaction execution (should not be called since storage fails first)
    repo.executeInTransaction.mockImplementation(async (callback) => {
      const mockTx = {} as DatabaseTransaction;
      return await callback(mockTx);
    });
    
    const res = await svc.createDocument(
      asUserId("bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb"),
      "t",
      asMimeType("application/pdf"),
      Buffer.from("x")
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(DocumentError);
  });

  it("updateMetadata enforces permissions (owner OK, non-owner forbidden, admin OK)", async () => {
    const doc = mkDoc({ ownerId: asUserId("cccccccc-cccc-7ccc-8ccc-cccccccccccc") });
    repo.findById.mockResolvedValue({ ok: true, value: doc });
    repo.save.mockImplementation(async (d) => ({ ok: true, value: d }));

    // Owner can update
    let res = await svc.updateMetadata(
      doc.id,
      asUserId("cccccccc-cccc-7ccc-8ccc-cccccccccccc"),
      "user",
      { status: "final" },
      []
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.metadata).toMatchObject({ a: 1, status: "final" });

    // Non-owner without permission is blocked
    res = await svc.updateMetadata(
      doc.id,
      asUserId("dddddddd-dddd-7ddd-8ddd-dddddddddddd"),
      "user",
      { status: "x" },
      []
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/Insufficient permissions/);

    // Admin can update
    res = await svc.updateMetadata(
      doc.id,
      asUserId("eeeeeeee-eeee-7eee-8eee-eeeeeeeeeeee"),
      "admin",
      { adminSet: true },
      []
    );
    expect(res.ok).toBe(true);
  });

  it("deleteDocument deletes storage first, then repository", async () => {
    const calls: string[] = [];
    const doc = mkDoc();

    repo.findById.mockResolvedValue({ ok: true, value: doc });
    storage.delete.mockImplementation(async () => {
      calls.push("storage.delete");
      return { ok: true, value: undefined as void };
    });
    repo.delete.mockImplementation(async () => {
      calls.push("repo.delete");
      return { ok: true, value: undefined as void };
    });

    const res = await svc.deleteDocument(doc.id, doc.ownerId, "user", []);
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["storage.delete", "repo.delete"]);
  });

  it("getDocument enforces read permissions", async () => {
    const doc = mkDoc({ ownerId: asUserId("ffffffff-ffff-7fff-8fff-ffffffffffff") });
    repo.findById.mockResolvedValue({ ok: true, value: doc });

    // Owner can read
    let res = await svc.getDocument(doc.id, asUserId("ffffffff-ffff-7fff-8fff-ffffffffffff"), "user", []);
    expect(res.ok).toBe(true);

    // Non-owner without permission denied
    res = await svc.getDocument(doc.id, asUserId("11111111-2222-7333-8444-555555555555"), "user", []);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/Insufficient permissions/);

    // Admin can read
    res = await svc.getDocument(doc.id, asUserId("66666666-6666-7666-8666-666666666666"), "admin", []);
    expect(res.ok).toBe(true);
  });

  it("generates correct file extension from mime type", async () => {
    const ownerId = asUserId("77777777-7777-7777-8777-777777777777");
    const data = Buffer.alloc(3);

    storage.store.mockResolvedValue({ ok: true, value: "ok" });
    storage.delete.mockResolvedValue({ ok: true, value: undefined });
    
    // Mock the transaction execution to simulate successful save
    repo.executeInTransaction.mockImplementation(async (callback) => {
      const mockTx = {} as DatabaseTransaction;
      return await callback(mockTx);
    });
    
    // Mock the saveInTransaction method
    repo.saveInTransaction.mockImplementation(async (doc, _tx) => ({ ok: true, value: doc }));

    const types: Array<[string, string]> = [
      ["application/pdf", ".pdf"],
      ["image/jpeg", ".jpg"],
      ["image/png", ".png"],
      ["text/plain", ".txt"],
      ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
    ];

    for (const [mt, ext] of types) {
      const res = await svc.createDocument(ownerId, "t", asMimeType(mt), data);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.value.storageKey.endsWith(ext)).toBe(true);
    }
  });
});