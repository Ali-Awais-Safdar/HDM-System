import { describe, it, expect, vi, beforeEach } from "vitest";
import { UpdateDocumentMetadataUseCase } from "../../../src/application/use-cases/update-document-metadata.use-case";
import type { DocumentService } from "../../../src/domain/services/document.service";
import { Document } from "../../../src/domain/entities/document.entity";
import { asUserId, asMimeType, asFileSize, newDocumentId } from "../../../src/shared/types/brand";

describe("UpdateDocumentMetadataUseCase", () => {
  let svc: DocumentService;
  let uc: UpdateDocumentMetadataUseCase;

  beforeEach(() => {
    svc = { updateMetadata: vi.fn() } as any;
    uc = new UpdateDocumentMetadataUseCase(svc);
  });

  it("updates and returns document", async () => {
    const doc = Document.create({
      id: newDocumentId(),
      ownerId: asUserId("owner"),
      title: "T",
      mimeType: asMimeType("application/pdf"),
      size: asFileSize(2),
      storageKey: "documents/x.pdf",
      metadata: { a: 1 },
      tags: []
    });
    vi.mocked(svc.updateMetadata).mockResolvedValue({ ok: true, value: doc });

    const res = await uc.execute({
      documentId: doc.id,
      userId: asUserId("owner"),
      userRole: "user",
      metadata: { a: 2 },
      userPermissions: []
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.id).toBe(doc.id);
  });

  it("bubbles permission error", async () => {
    vi.mocked(svc.updateMetadata).mockResolvedValue({ ok: false, error: new Error("Insufficient permissions") } as any);
    const res = await uc.execute({
      documentId: "x",
      userId: asUserId("u"),
      userRole: "user",
      metadata: {},
      userPermissions: []
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/Insufficient permissions/);
  });
});
