import { describe, it, expect } from "vitest"
import { Schema as S } from "effect"
import { applyMutationWithTimestamp, serializeWith } from "@domain/utils/schema-transform"
import { BaseEntitySchema } from "@domain/utils/schema.base"
import { Optional } from "@domain/utils/schema.utils"
import { withTestClock } from "../setup/test-clock"

// Minimal test entity schema to validate applyMutationWithTimestamp behavior
const Id = S.String
const Name = S.String
const TestEntitySchema = S.extend(
  BaseEntitySchema(Id),
  S.Struct({
    name: Name,
    note: Optional(S.String)
  })
)
// validate type-level pipeline via a no-op reference
type _TestEntity = S.Schema.Type<typeof TestEntitySchema>
void (null as unknown as _TestEntity)
type TestEncoded = S.Schema.Encoded<typeof TestEntitySchema>

describe("utils/schema-transform.applyMutationWithTimestamp", () => {
  it("sets updatedAt to provided clock time and applies delta", () => {
    const initial: TestEncoded = {
      id: "id-1",
      name: "before",
      note: undefined,
      createdAt: new Date("2025-01-03T00:00:00.000Z").toISOString(),
      updatedAt: undefined
    }

    // Pretend we have an existing entity by decoding (serializeWith encodes back to encoded shape)
    const deltaName = "after"
    const nowMs = Date.parse("2025-01-03T12:34:56.000Z")

    // Decode to obtain the current entity value (decoded shape) before applying mutation
    const current = expectSuccess(S.decodeUnknown(TestEntitySchema)(initial)) as any

    const mutated = withTestClock(
      applyMutationWithTimestamp(
        TestEntitySchema,
        current as unknown,
        (_now) => ({ name: deltaName } as Partial<TestEncoded>),
        (_e) => new Error("encode error") as any,
        (input) => S.decodeUnknown(TestEntitySchema)(input)
      ),
      nowMs
    )

    const entity = expectSuccess(mutated)
    const encoded = expectSuccess(serializeWith(TestEntitySchema, entity as any))
    expect(encoded.name).toBe(deltaName)
    expect(new Date(encoded.updatedAt as any).getTime()).toBe(nowMs)
    expect(encoded.id).toBe(initial.id)
  })
})

// Reuse test helper from project to unwrap effects
import { expectSuccess } from "../../utils/test.helpers"


