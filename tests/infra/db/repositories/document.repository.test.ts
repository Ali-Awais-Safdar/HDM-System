import { describe, it, expect, vi } from "vitest";
import { DrizzleDocumentRepository } from "../../../../src/infra/db/repositories/document.repository";
import { documents, documentTags } from "../../../../src/lib/db/schema";
import { asDocumentId, asUserId } from "../../../../src/shared/types/brand";
import { Document } from "../../../../src/domain/entities/document.entity";

function fakeSelectRow(row: any) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([row])
      })
    })
  };
}

describe("DrizzleDocumentRepository (unit, with fake DB)", () => {
  it("findById maps row to Document", async () => {
    const db: any = { select: vi.fn() };
    const row = {
      id: "d1",
      ownerId: "u1",
      title: "T",
      mimeType: "application/pdf",
      size: 10,
      storageKey: "documents/d1.pdf",
      metadata: { a: 1 }
    };
    vi.mocked(db.select).mockReturnValue(fakeSelectRow(row));

    const repo = new DrizzleDocumentRepository(db);
    const res = await repo.findById(asDocumentId("d1"));
    expect(res.ok).toBe(true);
    if (res.ok && res.value) {
      expect(res.value.title).toBe("T");
      expect(res.value.ownerId).toBe("u1");
    }
  });

  it("save inserts when not existing", async () => {
     const insertedRow = {
         id: "d2",
         ownerId: "u2",
         title: "New",
         mimeType: "application/pdf",
         size: 3,
         storageKey: "documents/d2.pdf",
         metadata: {},
       };
       const db: any = {
         // 1st select: existence check -> []
         // 2nd select: reload after insert -> [insertedRow]
         select: vi
           .fn()
           .mockReturnValueOnce({
             from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
           })
           .mockReturnValue({
             from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
           }),
         insert: vi.fn(() => ({
           values: vi.fn().mockReturnValue({
             // if repo uses .returning()
             returning: vi.fn().mockResolvedValue([insertedRow]),
             // if repo uses .execute()
             execute: vi.fn().mockResolvedValue([insertedRow]),
           }),
         })),
        update: vi.fn(),
        delete: vi.fn(() => ({
          where: vi.fn().mockReturnValue(Promise.resolve())
        })),
      };
    const repo = new DrizzleDocumentRepository(db);
    // Spy findById to appear missing
    vi.spyOn(repo, "findById").mockResolvedValue({ ok: true, value: null });

    const doc = Document.create({
      id: asDocumentId("d2"),
      ownerId: asUserId("u2"),
      title: "New",
      mimeType: "application/pdf" as any,
      size: 3 as any,
      storageKey: "documents/d2.pdf",
      metadata: {},
      tags: []
    });

    const res = await repo.save(doc);
    expect(res.ok).toBe(true);
    expect(db.insert).toHaveBeenCalledWith(documents);
  });

  it("save updates when exists", async () => {
     const existingRow = {
         id: "d3",
         ownerId: "u3",
         title: "Old",
         mimeType: "application/pdf",
         size: 3,
         storageKey: "documents/d3.pdf",
         metadata: {},
       };
        const updatedRow = {
           ...existingRow,
           title: "Updated",
           size: 4,
           metadata: { a: 1 },
         };
         const db: any = {
           // 1st select: existence check -> [existingRow]
           // 2nd select: reload after update -> [updatedRow]
                     select: vi
            .fn()
            .mockReturnValueOnce({
              from: () => ({ where: () => ({ limit: () => Promise.resolve([existingRow]) }) }),
            })
            .mockReturnValue({
              from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
            }),
           update: vi.fn(() => ({
             set: vi.fn().mockReturnValue({
               where: vi.fn().mockReturnValue({
                 // if repo uses .returning()
                 returning: vi.fn().mockResolvedValue([updatedRow]),
                 // if repo uses .execute()
                 execute: vi.fn().mockResolvedValue([updatedRow]),
               }),
             }),
           })),
                     insert: vi.fn(),
          delete: vi.fn(() => ({
            where: vi.fn().mockReturnValue(Promise.resolve())
          })),
         };
    const repo = new DrizzleDocumentRepository(db);
    vi.spyOn(repo, "findById").mockResolvedValue({ ok: true, value: Document.create({
      id: asDocumentId("d3"),
      ownerId: asUserId("u3"),
      title: "Old",
      mimeType: "application/pdf" as any,
      size: 3 as any,
      storageKey: "documents/d3.pdf",
      metadata: {},
      tags: []
    }) });

    const doc = Document.create({
      id: asDocumentId("d3"),
      ownerId: asUserId("u3"),
      title: "Updated",
      mimeType: "application/pdf" as any,
      size: 4 as any,
      storageKey: "documents/d3.pdf",
      metadata: { a: 1 },
      tags: []
    });

    const res = await repo.save(doc);
    expect(res.ok).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });

  it("delete removes document tags first then document", async () => {
    const db: any = {
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }))
    };
    const repo = new DrizzleDocumentRepository(db);
    const res = await repo.delete(asDocumentId("d4"));
    expect(res.ok).toBe(true);
    // first call for documentTags, second for documents
    expect(db.delete).toHaveBeenNthCalledWith(1, documentTags);
    expect(db.delete).toHaveBeenNthCalledWith(2, documents);
  });

  it("updateDocumentTags creates tags when missing", async () => {
    // Exercise private flow via save() on a doc with tags
     const selectMock = vi.fn()
       // doc existence -> []
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) })
      // For tag lookup: first tag not found -> []
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) })
      // Second tag found -> [existing]
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: "t-existing", name: "b" }]) }) }) });

    const insertMock = vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) }));
    const deleteMock = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    const db: any = { select: selectMock, insert: insertMock, delete: deleteMock, update: vi.fn() };

    const repo = new DrizzleDocumentRepository(db);
    const doc = Document.create({
      id: asDocumentId("d5"),
      ownerId: asUserId("u5"),
      title: "Tagged",
      mimeType: "application/pdf" as any,
      size: 1 as any,
      storageKey: "documents/d5.pdf",
      metadata: {},
      tags: ["a", "b"]
    });

    const res = await repo.save(doc);
    expect(res.ok).toBe(true);
    // It should have attempted to insert at least one new tag and doc-tag links
    expect(insertMock).toHaveBeenCalled();
  });
});
