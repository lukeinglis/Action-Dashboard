import { describe, expect, it } from "vitest";
import { findDuplicateTicket, type DuplicateTicketCandidate } from "./duplicate-check";

const existing: DuplicateTicketCandidate[] = [
  {
    id: "ticket-1",
    sportsbookTicketId: "DK-1001",
    sportsbook: "DraftKings",
    stakeCents: 2000,
    toWinCents: 3500,
    placedAt: "2026-09-21T16:00:00Z",
  },
  {
    id: "ticket-2",
    sportsbookTicketId: null,
    sportsbook: "FanDuel",
    stakeCents: 1000,
    toWinCents: 900,
    placedAt: "2026-09-22T12:00:00Z",
  },
];

describe("findDuplicateTicket", () => {
  it("matches decisively on sportsbookTicketId", () => {
    const dup = findDuplicateTicket(
      { sportsbookTicketId: "DK-1001", sportsbook: "DraftKings", stakeCents: 999, toWinCents: 1, placedAt: "2026-01-01T00:00:00Z" },
      existing,
    );
    expect(dup?.id).toBe("ticket-1");
  });

  it("falls back to sportsbook + stake + toWin + placedAt when no ticket ID match", () => {
    const dup = findDuplicateTicket(
      { sportsbook: "FanDuel", stakeCents: 1000, toWinCents: 900, placedAt: "2026-09-22T12:00:00Z" },
      existing,
    );
    expect(dup?.id).toBe("ticket-2");
  });

  it("falls back to stake/toWin/placedAt match even when sportsbookTicketId doesn't match anything", () => {
    const dup = findDuplicateTicket(
      { sportsbookTicketId: "DK-9999", sportsbook: "DraftKings", stakeCents: 2000, toWinCents: 3500, placedAt: "2026-09-21T16:00:00Z" },
      existing,
    );
    expect(dup?.id).toBe("ticket-1");
  });

  it("returns undefined when nothing matches", () => {
    const dup = findDuplicateTicket(
      { sportsbook: "DraftKings", stakeCents: 500, toWinCents: 100, placedAt: "2026-09-21T16:00:00Z" },
      existing,
    );
    expect(dup).toBeUndefined();
  });

  it("matches on stake/toWin when both sides have null sportsbook and placedAt", () => {
    const noSportsbook: DuplicateTicketCandidate[] = [
      { id: "ticket-3", sportsbook: null, stakeCents: 300, toWinCents: 150, placedAt: null },
    ];
    const dup = findDuplicateTicket({ stakeCents: 300, toWinCents: 150 }, noSportsbook);
    expect(dup?.id).toBe("ticket-3");
  });
});
