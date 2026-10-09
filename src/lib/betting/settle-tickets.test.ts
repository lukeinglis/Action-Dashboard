import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import { syncTicketSettlement } from "./settle-tickets";

const USER = "user-1";
const NOW = "2026-10-05T23:30:00.000Z";

function ticket(overrides: Record<string, unknown> = {}) {
  return { id: "t-1", user_id: USER, manual_status: null, settled_at: null, ...overrides };
}

function leg(overrides: Record<string, unknown> = {}) {
  return {
    id: "leg-1",
    user_id: USER,
    ticket_id: "t-1",
    manual_status: null,
    automatic_status: null,
    ...overrides,
  };
}

function setup(tables: Record<string, Record<string, unknown>[]> = {}) {
  return createFakeSupabase({
    tickets: tables.tickets ?? [],
    bet_legs: tables.bet_legs ?? [],
    bet_leg_events: tables.bet_leg_events ?? [],
  });
}

function sync(
  fake: ReturnType<typeof createFakeSupabase>,
  options: { eventIds?: string[]; ticketIds?: string[]; betLegIds?: string[] },
) {
  return syncTicketSettlement(fake as unknown as SupabaseClient, {
    userId: USER,
    ...options,
    now: () => NOW,
  });
}

describe("syncTicketSettlement", () => {
  it("closes a ticket whose legs have all graded", async () => {
    const fake = setup({
      tickets: [ticket()],
      bet_legs: [leg({ automatic_status: "won" })],
      bet_leg_events: [{ id: "l-1", user_id: USER, bet_leg_id: "leg-1", event_id: "event-1" }],
    });

    const result = await sync(fake, { eventIds: ["event-1"] });

    expect(result).toEqual({ settled: 1, reopened: 0 });
    expect(fake.tables.tickets[0].settled_at).toBe(NOW);
  });

  it("leaves a parlay open while any leg is still open", async () => {
    // Settling off the first leg to come in is the whole hazard here: a 3-leg
    // parlay with one winner has decided nothing.
    const fake = setup({
      tickets: [ticket()],
      bet_legs: [leg({ automatic_status: "won" }), leg({ id: "leg-2" })],
      bet_leg_events: [{ id: "l-1", user_id: USER, bet_leg_id: "leg-1", event_id: "event-1" }],
    });

    const result = await sync(fake, { eventIds: ["event-1"] });

    expect(result).toEqual({ settled: 0, reopened: 0 });
    expect(fake.tables.tickets[0].settled_at).toBeNull();
  });

  it("closes a parlay as soon as one leg loses", async () => {
    // A lost leg decides the ticket even with the rest unplayed, so it must not
    // wait for the other games to finish.
    const fake = setup({
      tickets: [ticket()],
      bet_legs: [leg({ automatic_status: "lost" }), leg({ id: "leg-2" })],
      bet_leg_events: [{ id: "l-1", user_id: USER, bet_leg_id: "leg-1", event_id: "event-1" }],
    });

    await sync(fake, { eventIds: ["event-1"] });

    expect(fake.tables.tickets[0].settled_at).toBe(NOW);
  });

  it("reaches the ticket through a leg on any of its events", async () => {
    // A cross-game parlay is refreshed one sport at a time, so the call that
    // runs last has to find the ticket from whichever leg it touched.
    const fake = setup({
      tickets: [ticket()],
      bet_legs: [leg({ automatic_status: "won" }), leg({ id: "leg-2", automatic_status: "won" })],
      bet_leg_events: [
        { id: "l-1", user_id: USER, bet_leg_id: "leg-1", event_id: "event-1" },
        { id: "l-2", user_id: USER, bet_leg_id: "leg-2", event_id: "event-2" },
      ],
    });

    await sync(fake, { eventIds: ["event-2"] });

    expect(fake.tables.tickets[0].settled_at).toBe(NOW);
  });

  it("keeps the original settlement time when run again", async () => {
    // §25 stamps when the status *first* became terminal; every later refresh
    // would otherwise push the ticket's rollover back a day.
    const fake = setup({
      tickets: [ticket({ settled_at: "2026-10-05T20:00:00.000Z" })],
      bet_legs: [leg({ automatic_status: "won" })],
      bet_leg_events: [{ id: "l-1", user_id: USER, bet_leg_id: "leg-1", event_id: "event-1" }],
    });

    const result = await sync(fake, { eventIds: ["event-1"] });

    expect(result).toEqual({ settled: 0, reopened: 0 });
    expect(fake.tables.tickets[0].settled_at).toBe("2026-10-05T20:00:00.000Z");
  });

  it("reopens a ticket when a correction takes it back to undecided", async () => {
    // §25: cleared if the status returns to non-terminal. Without this a leg
    // graded by mistake would leave the ticket closed forever.
    const fake = setup({
      tickets: [ticket({ settled_at: "2026-10-05T20:00:00.000Z" })],
      bet_legs: [leg()],
    });

    const result = await sync(fake, { ticketIds: ["t-1"] });

    expect(result).toEqual({ settled: 0, reopened: 1 });
    expect(fake.tables.tickets[0].settled_at).toBeNull();
  });

  it("honours a hand-set ticket status over the legs", async () => {
    // A cashed-out ticket is decided no matter what its legs go on to do.
    const fake = setup({
      tickets: [ticket({ manual_status: "cashed_out" })],
      bet_legs: [leg()],
    });

    await sync(fake, { ticketIds: ["t-1"] });

    expect(fake.tables.tickets[0].settled_at).toBe(NOW);
  });

  it("finds the ticket from a single hand-graded leg", async () => {
    // The manual path: markets no provider settles are graded by hand, and that
    // has to close the ticket too.
    const fake = setup({
      tickets: [ticket()],
      bet_legs: [leg({ manual_status: "push" })],
    });

    await sync(fake, { betLegIds: ["leg-1"] });

    expect(fake.tables.tickets[0].settled_at).toBe(NOW);
  });

  it("never touches another user's ticket", async () => {
    const fake = setup({
      tickets: [ticket({ user_id: "user-2" })],
      bet_legs: [leg({ user_id: "user-2", automatic_status: "won" })],
      bet_leg_events: [{ id: "l-1", user_id: "user-2", bet_leg_id: "leg-1", event_id: "event-1" }],
    });

    const result = await sync(fake, { eventIds: ["event-1"] });

    expect(result).toEqual({ settled: 0, reopened: 0 });
    expect(fake.tables.tickets[0].settled_at).toBeNull();
  });

  it("does nothing when the refresh touched no bet at all", async () => {
    const fake = setup({ tickets: [ticket()], bet_legs: [leg()] });

    const result = await sync(fake, { eventIds: ["event-9"] });

    expect(result).toEqual({ settled: 0, reopened: 0 });
  });
});
