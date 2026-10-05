import { describe, expect, it } from "vitest";
import {
  TICKET_COLORS,
  deriveTicketCode,
  deriveTicketColor,
  resolveTicketCode,
  resolveTicketColor,
} from "./ticket-code";

describe("deriveTicketCode", () => {
  it("initials a multi-word name", () => {
    expect(deriveTicketCode("Jets Moneyline Parlay")).toBe("JMP");
  });

  it("caps initials at three words", () => {
    expect(deriveTicketCode("Sunday Night Football Special")).toBe("SNF");
  });

  it("takes the first three letters of a single word", () => {
    expect(deriveTicketCode("Jersey")).toBe("JER");
  });

  it("ignores punctuation when splitting", () => {
    expect(deriveTicketCode("Bills/Chiefs")).toBe("BC");
  });

  it("falls back to an em dash for an empty name", () => {
    expect(deriveTicketCode(null)).toBe("—");
    expect(deriveTicketCode("   ")).toBe("—");
  });
});

describe("deriveTicketColor", () => {
  it("returns the same swatch for the same seed", () => {
    expect(deriveTicketColor("TDPt1")).toBe(deriveTicketColor("TDPt1"));
  });

  it("always returns a palette member", () => {
    for (const seed of ["a", "bb", "ccc", "TDPt1", ""]) {
      expect(TICKET_COLORS).toContain(deriveTicketColor(seed));
    }
  });
});

describe("resolveTicketCode", () => {
  it("prefers the stored code", () => {
    expect(resolveTicketCode({ code: "ZZZ", name: "Jets Moneyline Parlay" })).toBe("ZZZ");
  });

  it("derives from the name when no code is stored", () => {
    expect(resolveTicketCode({ code: null, name: "Jets Moneyline Parlay" })).toBe("JMP");
  });

  it("falls back to the generated name", () => {
    expect(resolveTicketCode({ name: null, generatedName: "Jersey Parlay" })).toBe("JP");
  });
});

describe("resolveTicketColor", () => {
  it("prefers a stored color in the palette", () => {
    expect(resolveTicketColor({ id: "t1", color: "rose" })).toBe("rose");
  });

  it("ignores a stored color outside the palette", () => {
    const resolved = resolveTicketColor({ id: "t1", color: "chartreuse", name: "Jersey" });
    expect(TICKET_COLORS).toContain(resolved);
  });

  it("is stable per ticket across calls", () => {
    const ticket = { id: "t1", name: "Jets Moneyline Parlay" };
    expect(resolveTicketColor(ticket)).toBe(resolveTicketColor(ticket));
  });
});
