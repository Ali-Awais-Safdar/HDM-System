import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateDocumentUseCase } from "../../../src/application/use-cases/create-document.use-case";
import { Document } from "../../../src/domain/entities/document.entity";
import type { DocumentService } from "../../../src/domain/services/document.service";
import { asMimeType, asUserId, asFileSize, newDocumentId } from "../../../src/shared/types/brand";

describe("CreateDocumentUseCase", () => {
  let svc: DocumentService;
  let uc: CreateDocumentUseCase;

  beforeEach(() => {
    svc = {
      createDocument: vi.fn()
    } as any;
    uc = new CreateDocumentUseCase(svc);
  });

  it("orchestrates creation with FileUpload validation and maps response", async () => {
    const ownerId = asUserId("11111111-1111-7111-8111-111111111111");
    const data = Buffer.from("data");
    const saved = Document.create({
      id: newDocumentId(),
      ownerId,
      title: "Doc",
      mimeType: asMimeType("application/pdf"),
      size: asFileSize(data.length),
      storageKey: "documents/x.pdf",
      metadata: { k: 1 },
      tags: ["a"]
    });
    vi.mocked(svc.createDocument).mockResolvedValue({ ok: true, value: saved });

    const res = await uc.execute({
      title: "Doc",
      file: { originalName: "doc.pdf", mimeType: "application/pdf", size: data.length, data },
      metadata: { k: 1 },
      tags: ["a", "a"],
      ownerId
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.title).toBe("Doc");
      expect(res.value.mimeType).toBe("application/pdf");
      expect(res.value.size).toBe(data.length);
      expect(res.value.ownerId).toBe(ownerId);
    }
  });

  it("propagates domain error as CreateDocumentError", async () => {
    vi.mocked(svc.createDocument).mockResolvedValue({ ok: false, error: new Error("Failed to save document") } as any);
    const res = await uc.execute({
      title: "Bad",
      file: { originalName: "doc.pdf", mimeType: "application/pdf", size: 1, data: Buffer.alloc(1) },
      ownerId: asUserId("u")
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/Failed to save document/);
  });

  it("returns error if FileUpload validation fails", async () => {
    const res = await uc.execute({
      title: "Doc",
      // invalid mime causes FileUpload.create to throw
      file: { originalName: "bad.sh", mimeType: "text/x-shellscript", size: 1, data: Buffer.alloc(1) },
      ownerId: asUserId("u")
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBeTruthy();
  });
});
