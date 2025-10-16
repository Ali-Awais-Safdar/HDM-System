import { describe, it } from "vitest"
import { generateDownloadToken } from "./download-token.factory"
import { TestPatterns } from "../../utils/test-patterns"

describe("DownloadToken Factory - Constraints", () => {
  it("should satisfy token constraints and expiry window", () => {
    const now = new Date("2025-01-03T00:00:00.000Z")
    TestPatterns.Factory.testFactoryConstraints(
      () => generateDownloadToken({}, now),
      [
        { name: "id uuid", validator: (t) => typeof t.id === "string" && t.id.includes("-") },
        { name: "token url-safe len", validator: (t) => /^[A-Za-z0-9_-]{32,64}$/.test(t.token) },
        { name: "expiresInFuture", validator: (t) => new Date(t.expiresAt).getTime() > now.getTime() },
        { name: "within24h", validator: (t) => (new Date(t.expiresAt).getTime() - now.getTime()) <= 24 * 60 * 60 * 1000 },
      ],
      15
    )
  })

  it("should generate unique tokens", () => {
    TestPatterns.Factory.testFactoryUniqueness(
      () => generateDownloadToken(),
      (t) => t.token,
      20
    )
  })
})


