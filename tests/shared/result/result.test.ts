import { describe, it, expect } from "vitest";
import { ok, err, isOk, isErr, map, flatMap, unwrap, unwrapOr } from "../../../src/shared/result/result";

describe("Result", () => {
  describe("creation", () => {
    it("should create Ok result", () => {
      const result = ok("success");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("success");
      }
    });

    it("should create Err result", () => {
      const error = new Error("test error");
      const result = err(error);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
      }
    });
  });

  describe("type guards", () => {
    it("should identify Ok results", () => {
      const okResult = ok("test");
      const errResult = err(new Error("test"));

      expect(isOk(okResult)).toBe(true);
      expect(isOk(errResult)).toBe(false);
    });

    it("should identify Err results", () => {
      const okResult = ok("test");
      const errResult = err(new Error("test"));

      expect(isErr(okResult)).toBe(false);
      expect(isErr(errResult)).toBe(true);
    });
  });

  describe("map", () => {
    it("should map Ok values", () => {
      const result = ok(5);
      const mapped = map(result, x => x * 2);

      expect(mapped.ok).toBe(true);
      if (mapped.ok) {
        expect(mapped.value).toBe(10);
      }
    });

    it("should not map Err values", () => {
      const error = new Error("test");
      const result = err(error);
      const mapped = map(result, x => x * 2);

      expect(mapped.ok).toBe(false);
      if (!mapped.ok) {
        expect(mapped.error).toBe(error);
      }
    });
  });

  describe("flatMap", () => {
    it("should flatMap Ok values", () => {
      const result = ok(5);
      const flatMapped = flatMap(result, x => ok(x * 2));

      expect(flatMapped.ok).toBe(true);
      if (flatMapped.ok) {
        expect(flatMapped.value).toBe(10);
      }
    });

    it("should not flatMap Err values", () => {
      const error = new Error("test");
      const result = err(error);
      const flatMapped = flatMap(result, x => ok(x * 2));

      expect(flatMapped.ok).toBe(false);
      if (!flatMapped.ok) {
        expect(flatMapped.error).toBe(error);
      }
    });

    it("should handle errors from flatMap function", () => {
      const result = ok(5);
      const error = new Error("flatMap error");
      const flatMapped = flatMap(result, () => err(error));

      expect(flatMapped.ok).toBe(false);
      if (!flatMapped.ok) {
        expect(flatMapped.error).toBe(error);
      }
    });
  });

  describe("unwrap", () => {
    it("should unwrap Ok values", () => {
      const result = ok("success");
      expect(unwrap(result)).toBe("success");
    });

    it("should throw for Err values", () => {
      const error = new Error("test error");
      const result = err(error);
      expect(() => unwrap(result)).toThrow(error);
    });
  });

  describe("unwrapOr", () => {
    it("should return value for Ok results", () => {
      const result = ok("success");
      expect(unwrapOr(result, "default")).toBe("success");
    });

    it("should return default for Err results", () => {
      const result = err(new Error("test"));
      expect(unwrapOr(result, "default")).toBe("default");
    });
  });
});
