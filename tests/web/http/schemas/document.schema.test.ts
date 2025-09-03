import { describe, it, expect } from "vitest";
import {
  createDocumentSchema,
  updateMetadataSchema,
  documentParamsSchema,
  fileUploadSchema
} from "../../../../src/web/http/schemas/document.schema";

describe("document.schema", () => {
  it("createDocumentSchema accepts valid input and dedupes tags", () => {
    const res = createDocumentSchema.safeParse({
      title: "My Doc",
      metadata: { a: 1 },
      tags: ["t1", "t1", "t2"]
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.tags).toEqual(["t1", "t2"]);
  });

  it("rejects too-long title and invalid tags", () => {
    const res1 = createDocumentSchema.safeParse({ title: "a".repeat(256) });
    expect(res1.success).toBe(false);

    const res2 = createDocumentSchema.safeParse({ title: "ok", tags: ["bad tag with spaces"] });
    expect(res2.success).toBe(false);
  });

  it("enforces metadata serialized size <= 10KB", () => {
    const big = { x: "a".repeat(10050) }; // slightly > 10KB when stringified
    const res = createDocumentSchema.safeParse({ title: "t", metadata: big });
    expect(res.success).toBe(false);
  });

  it("updateMetadataSchema validates record and size", () => {
    const ok = updateMetadataSchema.safeParse({ metadata: { a: 1 } });
    expect(ok.success).toBe(true);

    const bad = updateMetadataSchema.safeParse({ metadata: { x: "a".repeat(11000) } });
    expect(bad.success).toBe(false);
  });

  it("documentParamsSchema requires UUID", () => {
    expect(documentParamsSchema.safeParse({ id: "not-uuid" }).success).toBe(false);
    expect(documentParamsSchema.safeParse({ id: "550e8400-e29b-41d4-a716-446655440000" }).success).toBe(true);
  });

  it("fileUploadSchema validates shape", () => {
    const ok = fileUploadSchema.safeParse({
      originalname: "a.pdf", mimetype: "application/pdf", size: 3, buffer: Buffer.alloc(3)
    });
    expect(ok.success).toBe(true);

    const bad = fileUploadSchema.safeParse({
      originalname: "", mimetype: "", size: -1, buffer: {} as any
    });
    expect(bad.success).toBe(false);
  });
});
