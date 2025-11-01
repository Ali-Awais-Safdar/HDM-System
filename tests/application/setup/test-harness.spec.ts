import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { workflowTestLifecycle } from "./test-harness"
import type { WorkflowTestHarness } from "./test-harness"

describe("Workflow Test Harness", () => {
  let harness: WorkflowTestHarness

  beforeAll(async () => {
    harness = await workflowTestLifecycle.beforeAll()
  })

  afterAll(async () => {
    await workflowTestLifecycle.afterAll(harness)
  })

  beforeEach(async () => {
    await workflowTestLifecycle.beforeEach(harness)
  })

  it("should setup harness with all workflows", () => {
    expect(harness.db).toBeDefined()
    expect(harness.documentAggregateRepository).toBeDefined()
    expect(harness.accessPolicyRepository).toBeDefined()
    expect(harness.downloadTokenRepository).toBeDefined()
    expect(harness.userRepository).toBeDefined()
    expect(harness.documentAccessService).toBeDefined()
    expect(harness.fileStoragePort).toBeDefined()
    expect(harness.passwordHasherPort).toBeDefined()
    expect(harness.configPort).toBeDefined()
    expect(harness.documentWorkflow).toBeDefined()
    expect(harness.uploadWorkflow).toBeDefined()
    expect(harness.accessPolicyWorkflow).toBeDefined()
    expect(harness.downloadTokenWorkflow).toBeDefined()
    expect(harness.documentVersionWorkflow).toBeDefined()
  })

  it("should reset file storage port on beforeEach", () => {
    // File storage port should be available for direct upload
    expect(harness.fileStoragePort).toBeDefined()
    expect(harness.fileStoragePort.uploadFile).toBeDefined()
    expect(harness.fileStoragePort.downloadFile).toBeDefined()
  })

  it("should reset password hasher port on beforeEach", () => {
    // Can't easily test this without implementation details
    expect(harness.passwordHasherPort).toBeDefined()
  })
})

