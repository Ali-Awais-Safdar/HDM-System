import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { msUntilExpiry } from "@domain/downloadToken/expiry-window.vo"
import { withTestClock } from "../setup/test-clock"
import { expectSuccess } from "../../utils/test.helpers"

describe("ExpiryWindow.msUntilExpiry", () => {
  it("never returns a negative value even with small positive skew", () => {
    fc.assert(
      fc.property(
        // current time in ms
        fc.integer({ min: 0, max: 2_147_483_647 }),
        // positive clock skew up to 5 seconds
        fc.integer({ min: 1, max: 5_000 }),
        // expiry offset relative to now (can be past or future within ±10s)
        fc.integer({ min: -10_000, max: 10_000 }),
        (nowMs, skewMs, expiryOffsetMs) => {
          const expiry = new Date(nowMs + expiryOffsetMs)
          const eff = withTestClock(msUntilExpiry(expiry, skewMs), nowMs)
          const remaining = expectSuccess(eff)
          expect(remaining).toBeGreaterThanOrEqual(0)
        }
      ),
      { numRuns: 500 }
    )
  })
})


