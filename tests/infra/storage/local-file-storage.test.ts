import { describe, it, expect, afterAll } from "vitest";
import { LocalFileStorage } from "../../../src/infra/storage/local-file-storage";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import os from "os";

describe("LocalFileStorage", () => {
  const tmpDir = mkdtempSync(join(os.tmpdir(), "dms-storage-"));
  const storage = new LocalFileStorage(tmpDir);

  afterAll(() => {
    // Cleanup the whole temp tree
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("initialize() ensures base directory exists", async () => {
    const res = await storage.initialize();
    expect(res.ok).toBe(true);
  });

  it("store → exists → retrieve → getStats → delete flow", async () => {
    const key = "documents/sub/hello.txt";
    const data = Buffer.from("hello world");

    const s1 = await storage.store(key, data);
    expect(s1.ok).toBe(true);

    const ex = await storage.exists(key);
    expect(ex.ok && ex.value).toBe(true);

    const ret = await storage.retrieve(key);
    expect(ret.ok).toBe(true);
    if (ret.ok) expect(ret.value.equals(data)).toBe(true);

    const stats = await storage.getStats(key);
    expect(stats.ok).toBe(true);
    if (stats.ok) {
      expect(stats.value.size).toBe(data.length);
      expect(stats.value.createdAt).toBeInstanceOf(Date);
      expect(stats.value.modifiedAt).toBeInstanceOf(Date);
    }

    const del = await storage.delete(key);
    expect(del.ok).toBe(true);

    const ex2 = await storage.exists(key);
    expect(ex2.ok && ex2.value).toBe(false);

    // deleting non-existent file is ok
    const del2 = await storage.delete(key);
    expect(del2.ok).toBe(true);
  });
});
