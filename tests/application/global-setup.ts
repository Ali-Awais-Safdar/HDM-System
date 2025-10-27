import "dotenv/config"

// Ensure crypto API is available in test environment
if (typeof globalThis.crypto === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("node:crypto").webcrypto
  ;(globalThis as any).crypto = crypto
}

