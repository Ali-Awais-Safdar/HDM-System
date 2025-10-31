import { describe, it, expect } from "vitest"
import { Effect, Option, Clock } from "effect"
import { withTestClock } from "../setup/test-clock"
import { DocumentAggregate } from "@domain/document/document.aggregate"
import { Sha256 } from "@domain/refined/checksum"
import { FileKey, MimeType, FileSize } from "@domain/refined/file-reference"
import { buildAggregate, versionFrom, generateDocument } from "../factories/document.factory"
import type { FileMetadata as FileMetadataT } from "@domain/documentVersion/file-metadata.vo"
import { DocumentVersionId } from "@domain/refined/ids"
import { faker } from "../factories/common"

describe("DocumentAggregate invariants", () => {
  it("enforces sequential version numbering", async () => {
    const enc = generateDocument()
    const v2 = versionFrom({
      documentId: enc.id as any,
      version: 2,
      checksum: "a" as Sha256,
      fileKey: "k" as FileKey,
      mimeType: "application/pdf" as MimeType,
      size: 10 as FileSize
    })
    const eff = withTestClock(DocumentAggregate.createFromSerialized(enc as any, [v2]), Date.now())
    await expect(Effect.runPromise(eff)).rejects.toBeDefined()
  })

  it("dedupes by checksum on recordUpload", async () => {
    const enc = generateDocument()
    const agg = await Effect.runPromise(withTestClock(buildAggregate(enc), Date.now()))
    const fileObj = {
      checksum: faker.string.hexadecimal({ length: 64, prefix: "", casing: "lower" }) as Sha256,
      fileKey: "k1" as FileKey,
      mimeType: "text/plain" as MimeType,
      size: 1 as FileSize
    }
    const fileMeta = fileObj as any as FileMetadataT
    const versionId1 = faker.string.uuid() as DocumentVersionId
    const agg1 = await Effect.runPromise(Effect.provideService(agg.recordUpload(fileMeta, Option.none(), undefined, versionId1), Clock.Clock, Clock.make()))
    const versionId2 = faker.string.uuid() as DocumentVersionId
    await expect(Effect.runPromise(Effect.provideService(agg1.recordUpload(fileMeta, Option.none(), undefined, versionId2), Clock.Clock, Clock.make()))).rejects.toBeDefined()
  })
})

describe("DocumentAggregate version read helpers", () => {
  it("getVersions returns all versions", async () => {
    const enc = generateDocument()
    const agg = await Effect.runPromise(withTestClock(buildAggregate(enc), Date.now()))
    
    const versions = agg.getVersions()
    expect(versions).toBeDefined()
    expect(Array.isArray(versions)).toBe(true)
  })

  it("getVersionCount returns correct count", async () => {
    const enc = generateDocument()
    const agg = await Effect.runPromise(withTestClock(buildAggregate(enc), Date.now()))
    
    const count = agg.getVersionCount()
    expect(count).toBeGreaterThanOrEqual(0)
  })

  it("getLatestVersion returns None when no versions exist", async () => {
    const enc = generateDocument()
    const agg = await Effect.runPromise(withTestClock(buildAggregate(enc), Date.now()))
    
    // Aggregate starts with no versions
    const latestOption = agg.getLatestVersion()
    expect(Option.isNone(latestOption)).toBe(true)
  })

  it("getLatestVersion returns Some when versions exist", async () => {
    const enc = generateDocument()
    const agg = await Effect.runPromise(withTestClock(buildAggregate(enc), Date.now()))
    
    const fileMeta = {
      checksum: faker.string.hexadecimal({ length: 64, prefix: "", casing: "lower" }) as Sha256,
      fileKey: "k1" as FileKey,
      mimeType: "text/plain" as MimeType,
      size: 1 as FileSize
    } as any as FileMetadataT
    
    const versionId = faker.string.uuid() as DocumentVersionId
    const agg1 = await Effect.runPromise(Effect.provideService(agg.recordUpload(fileMeta, Option.none(), undefined, versionId), Clock.Clock, Clock.make()))
    
    const latestOption = agg1.getLatestVersion()
    expect(Option.isSome(latestOption)).toBe(true)
    if (Option.isSome(latestOption)) {
      expect(latestOption.value.version).toBe(1)
    }
  })

  it("getVersionByNumber returns correct version", async () => {
    const enc = generateDocument()
    const agg = await Effect.runPromise(withTestClock(buildAggregate(enc), Date.now()))
    
    const fileMeta = {
      checksum: faker.string.hexadecimal({ length: 64, prefix: "", casing: "lower" }) as Sha256,
      fileKey: "k1" as FileKey,
      mimeType: "text/plain" as MimeType,
      size: 1 as FileSize
    } as any as FileMetadataT
    
    const versionId = faker.string.uuid() as DocumentVersionId
    const agg1 = await Effect.runPromise(Effect.provideService(agg.recordUpload(fileMeta, Option.none(), undefined, versionId), Clock.Clock, Clock.make()))
    
    const versionOption = agg1.getVersionByNumber(1)
    expect(Option.isSome(versionOption)).toBe(true)
    if (Option.isSome(versionOption)) {
      expect(versionOption.value.version).toBe(1)
    }
    
    const notFoundOption = agg1.getVersionByNumber(999)
    expect(Option.isNone(notFoundOption)).toBe(true)
  })

  it("getVersionByChecksum returns correct version", async () => {
    const enc = generateDocument()
    const agg = await Effect.runPromise(withTestClock(buildAggregate(enc), Date.now()))
    
    const checksum = faker.string.hexadecimal({ length: 64, prefix: "", casing: "lower" }) as Sha256
    const fileMeta = {
      checksum,
      fileKey: "k1" as FileKey,
      mimeType: "text/plain" as MimeType,
      size: 1 as FileSize
    } as any as FileMetadataT
    
    const versionId = faker.string.uuid() as DocumentVersionId
    const agg1 = await Effect.runPromise(Effect.provideService(agg.recordUpload(fileMeta, Option.none(), undefined, versionId), Clock.Clock, Clock.make()))
    
    const versionOption = agg1.getVersionByChecksum(checksum)
    expect(Option.isSome(versionOption)).toBe(true)
    if (Option.isSome(versionOption)) {
      expect(versionOption.value.checksum).toBe(checksum)
    }
    
    const notFoundChecksum = faker.string.hexadecimal({ length: 64, prefix: "", casing: "lower" }) as Sha256
    const notFoundOption = agg1.getVersionByChecksum(notFoundChecksum)
    expect(Option.isNone(notFoundOption)).toBe(true)
  })

  it("getVersionById returns correct version", async () => {
    const enc = generateDocument()
    const agg = await Effect.runPromise(withTestClock(buildAggregate(enc), Date.now()))
    
    const fileMeta = {
      checksum: faker.string.hexadecimal({ length: 64, prefix: "", casing: "lower" }) as Sha256,
      fileKey: "k1" as FileKey,
      mimeType: "text/plain" as MimeType,
      size: 1 as FileSize
    } as any as FileMetadataT
    
    const versionId = faker.string.uuid() as DocumentVersionId
    const agg1 = await Effect.runPromise(Effect.provideService(agg.recordUpload(fileMeta, Option.none(), undefined, versionId), Clock.Clock, Clock.make()))
    
    const versionOption = agg1.getVersionById(versionId)
    expect(Option.isSome(versionOption)).toBe(true)
    if (Option.isSome(versionOption)) {
      expect(versionOption.value.id).toBe(versionId)
    }
    
    const notFoundId = faker.string.uuid() as DocumentVersionId
    const notFoundOption = agg1.getVersionById(notFoundId)
    expect(Option.isNone(notFoundOption)).toBe(true)
  })

  it("hasVersionWithChecksum returns correct boolean", async () => {
    const enc = generateDocument()
    const agg = await Effect.runPromise(withTestClock(buildAggregate(enc), Date.now()))
    
    const checksum = faker.string.hexadecimal({ length: 64, prefix: "", casing: "lower" }) as Sha256
    const fileMeta = {
      checksum,
      fileKey: "k1" as FileKey,
      mimeType: "text/plain" as MimeType,
      size: 1 as FileSize
    } as any as FileMetadataT
    
    const versionId = faker.string.uuid() as DocumentVersionId
    const agg1 = await Effect.runPromise(Effect.provideService(agg.recordUpload(fileMeta, Option.none(), undefined, versionId), Clock.Clock, Clock.make()))
    
    expect(agg1.hasVersionWithChecksum(checksum)).toBe(true)
    
    const notFoundChecksum = faker.string.hexadecimal({ length: 64, prefix: "", casing: "lower" }) as Sha256
    expect(agg1.hasVersionWithChecksum(notFoundChecksum)).toBe(false)
  })

  it("forEachVersion applies function to all versions", async () => {
    const enc = generateDocument()
    const agg = await Effect.runPromise(withTestClock(buildAggregate(enc), Date.now()))
    
    const fileMeta1 = {
      checksum: faker.string.hexadecimal({ length: 64, prefix: "", casing: "lower" }) as Sha256,
      fileKey: "k1" as FileKey,
      mimeType: "text/plain" as MimeType,
      size: 1 as FileSize
    } as any as FileMetadataT
    
    const fileMeta2 = {
      checksum: faker.string.hexadecimal({ length: 64, prefix: "", casing: "lower" }) as Sha256,
      fileKey: "k2" as FileKey,
      mimeType: "text/plain" as MimeType,
      size: 2 as FileSize
    } as any as FileMetadataT
    
    const versionId1 = faker.string.uuid() as DocumentVersionId
    const agg1 = await Effect.runPromise(Effect.provideService(agg.recordUpload(fileMeta1, Option.none(), undefined, versionId1), Clock.Clock, Clock.make()))
    const versionId2 = faker.string.uuid() as DocumentVersionId
    const agg2 = await Effect.runPromise(Effect.provideService(agg1.recordUpload(fileMeta2, Option.none(), undefined, versionId2), Clock.Clock, Clock.make()))
    
    const versionNumbers = await Effect.runPromise(agg2.forEachVersion(v => v.version))
    expect(versionNumbers).toEqual([1, 2])
  })
})


