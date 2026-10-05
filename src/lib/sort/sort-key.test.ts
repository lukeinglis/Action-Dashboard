import { describe, expect, it } from "vitest";
import { sortKeyAfter, sortKeyBefore, sortKeyBetween } from "./sort-key";

describe("sortKeyBetween", () => {
  it("returns the alphabet midpoint with no bounds", () => {
    expect(sortKeyBetween(null, null)).toBe("i");
  });

  it("returns a key strictly after a lower bound with no upper bound", () => {
    expect(sortKeyBetween("ab", null)).toBe("n");
    expect("ab" < sortKeyBetween("ab", null)).toBe(true);
  });

  it("returns a key strictly before an upper bound with no lower bound", () => {
    const key = sortKeyBetween(null, "ab");
    expect(key < "ab").toBe(true);
  });

  it("returns a key strictly between two close neighbors", () => {
    const key = sortKeyBetween("a", "ab");
    expect(key > "a").toBe(true);
    expect(key < "ab").toBe(true);
  });

  it("throws when lower is not before upper", () => {
    expect(() => sortKeyBetween("b", "a")).toThrow();
    expect(() => sortKeyBetween("a", "a")).toThrow();
  });

  it("repeated midpoints never collide, even after many inserts at the same spot", () => {
    const lower = "a";
    let upper = "b";
    const seen = new Set([lower, upper]);
    for (let i = 0; i < 50; i++) {
      const mid = sortKeyBetween(lower, upper);
      expect(mid > lower).toBe(true);
      expect(mid < upper).toBe(true);
      expect(seen.has(mid)).toBe(false);
      seen.add(mid);
      upper = mid;
    }
  });
});

describe("sortKeyAfter / sortKeyBefore", () => {
  it("sortKeyAfter sorts after the given key", () => {
    const first = sortKeyAfter(null);
    const second = sortKeyAfter(first);
    expect(second > first).toBe(true);
  });

  it("sortKeyBefore sorts before the given key", () => {
    const first = sortKeyAfter(null);
    const before = sortKeyBefore(first);
    expect(before < first).toBe(true);
  });
});
