import "dotenv/config"
import "reflect-metadata"
import { initContainer } from "@infra/di/setup"

// Ensure crypto API is available in test environment
if (typeof globalThis.crypto === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("node:crypto").webcrypto
  ;(globalThis as any).crypto = crypto
}

// Initialize the dependency injection container for tests
// This ensures test harness retrieves dependencies via container
initContainer()

console.log("✅ Test environment initialized with DI container")

