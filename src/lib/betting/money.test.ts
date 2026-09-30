import { describe, expect, it } from "vitest";
import { centsToDollars, dollarsToCents, formatCents, hasReturnMismatch } from "./money";

describe("dollarsToCents / centsToDollars", () => {
  it("round-trips whole and fractional dollar amounts", () => {
    expect(dollarsToCents(10)).toBe(1000);
    expect(dollarsToCents(10.5)).toBe(1050);
    expect(centsToDollars(1000)).toBe(10);
    expect(centsToDollars(1050)).toBe(10.5);
  });
});

describe("formatCents", () => {
  it("formats positive and negative cents as dollars", () => {
    expect(formatCents(1000)).toBe("$10.00");
    expect(formatCents(-1000)).toBe("-$10.00");
    expect(formatCents(150)).toBe("$1.50");
  });
});

describe("hasReturnMismatch", () => {
  it("is false when totalReturnCents equals stake plus to-win ($10 to win $150)", () => {
    expect(
      hasReturnMismatch({ stakeCents: 1000, toWinCents: 15000, totalReturnCents: 16000, isBonusBet: false }),
    ).toBe(false);
  });

  it("is true for a non-bonus ticket whose return doesn't match stake plus to-win", () => {
    expect(
      hasReturnMismatch({ stakeCents: 1000, toWinCents: 15000, totalReturnCents: 15000, isBonusBet: false }),
    ).toBe(true);
  });

  it("is false for a bonus bet even though the stake isn't returned ($10 bonus bet to win $15)", () => {
    expect(
      hasReturnMismatch({ stakeCents: 1000, toWinCents: 1500, totalReturnCents: 1500, isBonusBet: true }),
    ).toBe(false);
  });
});
