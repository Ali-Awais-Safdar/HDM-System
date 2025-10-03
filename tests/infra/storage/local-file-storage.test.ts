import { describe, it, expect, afterAll } from "vitest"
import { Effect } from "effect"
import { LocalFileStorage } from "../../../src/infra/storage/local-file-storage"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import os from "os"

describe("LocalFileStorage", () => {
  const tmpDir = mkdtempSync(join(os.tmpdir(), "dms-storage-"))
  const storage = new LocalFileStorage(tmpDir)

  afterAll(() => {
    // Cleanup the whole temp tree
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("initialize() ensures base directory exists", async () => {
    await storage.initialize()
    // If it doesn't throw, initialization succeeded
    expect(true).toBe(true)
  })

  it("store → exists → retrieve → getStats → delete flow", async () => {
    const key = "documents/sub/hello.txt"
    const data = Buffer.from("hello world")

    // Store file
    const filePath = await Effect.runPromise(storage.store(key, data))
    expect(filePath).toBeDefined()

    // Check existence
    const exists1 = await Effect.runPromise(storage.exists(key))
    expect(exists1).toBe(true)

    // Retrieve file
    const retrieved = await Effect.runPromise(storage.retrieve(key))
    expect(retrieved.equals(data)).toBe(true)

    // Get stats
    const stats = await storage.getStats(key)
    expect(stats.size).toBe(data.length)
    expect(stats.createdAt).toBeInstanceOf(Date)
    expect(stats.modifiedAt).toBeInstanceOf(Date)

    // Delete file
    await Effect.runPromise(storage.delete(key))

    // Verify deletion
    const exists2 = await Effect.runPromise(storage.exists(key))
    expect(exists2).toBe(false)

    // Deleting non-existent file is ok
    await Effect.runPromise(storage.delete(key))
    // If it doesn't throw, deletion succeeded
    expect(true).toBe(true)
  })
})
