import { describe, it, expect } from "vitest"
import { Schema as S, Option } from "effect"
import { Optional } from "@domain/utils/schema.utils"
import { expectSuccess } from "../../utils/test.helpers"

describe("utils/Optional schema helper", () => {
  const Base = S.String
  const OptString = Optional(Base)

  it("decodes undefined/null to Option.none()", () => {
    const noneFromUndefined = S.decodeUnknown(OptString)(undefined)
    const noneFromNull = S.decodeUnknown(OptString)(null)
    const opt1 = expectSuccess(noneFromUndefined) as Option.Option<string>
    const opt2 = expectSuccess(noneFromNull) as Option.Option<string>
    expect(Option.isNone(opt1)).toBe(true)
    expect(Option.isNone(opt2)).toBe(true)
  })

  it("decodes value to Option.some(value)", () => {
    const decoded = S.decodeUnknown(OptString)("hello")
    const option = expectSuccess(decoded)
    expect(Option.isSome(option)).toBe(true)
    if (Option.isSome(option)) {
      expect(option.value).toBe("hello")
    }
  })

  it("encodes Option.none() to undefined", () => {
    const encoded = S.encode(OptString)(Option.none())
    const result = expectSuccess(encoded)
    expect(result).toBeUndefined()
  })

  it("encodes Option.some(value) to value", () => {
    const encoded = S.encode(OptString)(Option.some("data"))
    const result = expectSuccess(encoded)
    expect(result).toBe("data")
  })
})



