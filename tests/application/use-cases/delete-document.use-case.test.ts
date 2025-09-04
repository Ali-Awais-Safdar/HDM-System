import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeleteDocumentUseCase } from "../../../src/application/use-cases/delete-document.use-case";
import type { DocumentService } from "../../../src/domain/services/document.service";
import { asUserId } from "../../../src/shared/types/brand";

describe("DeleteDocumentUseCase", () => {
  let svc: DocumentService;
  let uc: DeleteDocumentUseCase;

  beforeEach(() => {
    svc = { deleteDocument: vi.fn() } as any;
    uc = new DeleteDocumentUseCase(svc);
  });

  it("returns success on delete", async () => {
    vi.mocked(svc.deleteDocument).mockResolvedValue({ ok: true, value: undefined });

    const res = await uc.execute({
      documentId: "id-1",
      userId: asUserId("u"),
      userRole: "user",
      userPermissions: []
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.success).toBe(true);
  });

  it("propagates domain error", async () => {
    vi.mocked(svc.deleteDocument).mockResolvedValue({ ok: false, error: new Error("Document not found") } as any);
    const res = await uc.execute({ documentId: "nope", userId: asUserId("u"), userRole: "user", userPermissions: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBe("Document not found");
  });
});
