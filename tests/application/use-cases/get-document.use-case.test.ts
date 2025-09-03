import { describe, it, expect, vi, beforeEach } from "vitest";
import { GetDocumentUseCase } from "../../../src/application/use-cases/get-document.use-case";
import type { DocumentService } from "../../../src/domain/services/document.service";
import { Document } from "../../../src/domain/entities/document.entity";
import { asUserId, asMimeType, asFileSize, newDocumentId } from "../../../src/shared/types/brand";

describe("GetDocumentUseCase", () => {
  let svc: DocumentService;
  let uc: GetDocumentUseCase;

  beforeEach(() => {
    svc = { getDocument: vi.fn() } as any;
    uc = new GetDocumentUseCase(svc);
  });

  it("returns mapped document", async () => {
    const doc = Document.create({
      id: newDocumentId(),
      ownerId: asUserId("owner"),
      title: "T",
      mimeType: asMimeType("application/pdf"),
      size: asFileSize(2),
      storageKey: "documents/x.pdf",
      metadata: { a: 1 },
      tags: ["t"]
    });
    vi.mocked(svc.getDocument).mockResolvedValue({ ok: true, value: doc });

    const res = await uc.execute({ documentId: doc.id, userId: asUserId("owner"), userRole: "user" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.id).toBe(doc.id);
  });

  it("propagates domain error", async () => {
    vi.mocked(svc.getDocument).mockResolvedValue({ ok: false, error: new Error("Document not found") } as any);
    const res = await uc.execute({ documentId: "x", userId: asUserId("u"), userRole: "user" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBe("Document not found");
  });
});
