import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { initContainer, resolveWorkflow, isContainerInitialized } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"
import type { UploadWorkflow } from "@application/workflow/upload.workflow"

describe("LocalFileStorage - DI Container Integration", () => {
  beforeAll(() => {
    // Initialize the container before running tests
    initContainer()
  })

  afterAll(() => {
    // Cleanup is done by vitest
  })

  it("should boot the DI container without errors", () => {
    expect(isContainerInitialized()).toBe(true)
  })

  it("should resolve FILE_STORAGE_PORT from the container", () => {
    const fileStorage = resolveWorkflow(TOKENS.FILE_STORAGE_PORT)
    expect(fileStorage).toBeDefined()
  })

  it("should resolve UPLOAD_WORKFLOW from the container", () => {
    const uploadWorkflow = resolveWorkflow<UploadWorkflow>(TOKENS.UPLOAD_WORKFLOW)
    expect(uploadWorkflow).toBeDefined()
    expect(uploadWorkflow).toHaveProperty("initiateUpload")
    expect(uploadWorkflow).toHaveProperty("confirmUpload")
  })
})

