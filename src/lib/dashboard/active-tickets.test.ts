import { describe, expect, it } from "vitest";
import { sortTickets, ticketSection } from "./active-tickets";

const TZ = "America/New_York";

describe("ticketSection", () => {
  it("keeps pending/active tickets in the active section regardless of time", () => {
    const now = new Date("2026-09-21T10:00:00Z");
    expect(ticketSection("pending", null, now, TZ, 4)).toBe("active");
    expect(ticketSection("active", null, now, TZ, 4)).toBe("active");
  });

  it("keeps a settled ticket in the settled section before the next rollover after settledAt", () => {
    // settledAt 2026-09-21T10:00Z (6am ET); next rollover (4am ET) is 2026-09-22T08:00Z.
    const settledAt = "2026-09-21T10:00:00Z";
    const now = new Date("2026-09-22T06:00:00Z");
    expect(ticketSection("won", settledAt, now, TZ, 4)).toBe("settled");
  });

  it("drops a settled ticket from the dashboard after the first rollover following settledAt", () => {
    const settledAt = "2026-09-21T10:00:00Z";
    const now = new Date("2026-09-22T09:00:00Z");
    expect(ticketSection("lost", settledAt, now, TZ, 4)).toBe(null);
  });

  it("keeps a settled ticket visible if settledAt is not yet recorded", () => {
    const now = new Date("2026-09-21T10:00:00Z");
    expect(ticketSection("void", null, now, TZ, 4)).toBe("settled");
  });
});

describe("sortTickets", () => {
  const tickets = [
    { id: "a", sortKey: "c", stakeCents: 1000, toWinCents: 500, legsRemaining: 2, nextEventStartUtc: "2026-09-22T00:00:00Z" },
    { id: "b", sortKey: "a", stakeCents: 3000, toWinCents: 100, legsRemaining: 0, nextEventStartUtc: "2026-09-21T00:00:00Z" },
    { id: "c", sortKey: "b", stakeCents: 2000, toWinCents: 900, legsRemaining: 1, nextEventStartUtc: null },
  ];

  it("sorts by sortKey in manual mode", () => {
    expect(sortTickets(tickets, "manual").map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by next event start, nulls last, in next_event mode", () => {
    expect(sortTickets(tickets, "next_event").map((t) => t.id)).toEqual(["b", "a", "c"]);
  });

  it("sorts by stake descending", () => {
    expect(sortTickets(tickets, "stake").map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by to-win descending", () => {
    expect(sortTickets(tickets, "to_win").map((t) => t.id)).toEqual(["c", "a", "b"]);
  });

  it("sorts by legs remaining ascending", () => {
    expect(sortTickets(tickets, "legs_remaining").map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("never mutates the input array or its sortKey values", () => {
    const original = tickets.map((t) => ({ ...t }));
    sortTickets(tickets, "stake");
    expect(tickets).toEqual(original);
  });

  it("restores manual order after switching to another mode and back", () => {
    sortTickets(tickets, "stake");
    expect(sortTickets(tickets, "manual").map((t) => t.id)).toEqual(["b", "c", "a"]);
  });
});
