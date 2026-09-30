import { describe, expect, it } from "vitest";
import { derivedTicketStatus, effectiveTicketStatus, legSettlement } from "./derived-status";

function leg(manualStatus: string | null, automaticStatus: string | null = null) {
  return { manualStatus, automaticStatus } as never;
}

describe("legSettlement", () => {
  it("prefers manual over automatic", () => {
    expect(legSettlement(leg("won", "open"))).toBe("won");
  });

  it("falls back to automatic, then open", () => {
    expect(legSettlement(leg(null, "push"))).toBe("push");
    expect(legSettlement(leg(null, null))).toBe("open");
  });
});

describe("derivedTicketStatus", () => {
  it("is pending with no legs", () => {
    expect(derivedTicketStatus([], false)).toBe("pending");
  });

  it("is pending when no leg is settled and no linked Event is live", () => {
    expect(derivedTicketStatus([leg(null, "open")], false)).toBe("pending");
  });

  it("is active when any leg is settled", () => {
    expect(derivedTicketStatus([leg("won"), leg(null, "open")], false)).toBe("active");
  });

  it("is active when a linked Event is live even with no leg settled", () => {
    expect(derivedTicketStatus([leg(null, "open")], true)).toBe("active");
  });

  it("is lost when any leg is lost, regardless of the others", () => {
    expect(derivedTicketStatus([leg("won"), leg("lost"), leg(null, "open")], false)).toBe("lost");
  });

  it("is void when every settled leg is push or void and all legs are settled", () => {
    expect(derivedTicketStatus([leg("push"), leg("void")], false)).toBe("void");
  });

  it("is void for a single-leg ticket that pushes", () => {
    expect(derivedTicketStatus([leg("push")], false)).toBe("void");
  });

  it("is won when all legs are settled and at least one won", () => {
    expect(derivedTicketStatus([leg("won"), leg("push")], false)).toBe("won");
  });

  it("is not won/void while any leg is still open", () => {
    expect(derivedTicketStatus([leg("won"), leg(null, "open")], false)).toBe("active");
  });
});

describe("effectiveTicketStatus", () => {
  it("prefers the manual Ticket status over the derived value", () => {
    expect(effectiveTicketStatus("cashed_out", [leg("won"), leg("push")], false)).toBe("cashed_out");
  });

  it("falls back to the derived status when no manual status is set", () => {
    expect(effectiveTicketStatus(null, [leg("won"), leg("push")], false)).toBe("won");
  });
});
