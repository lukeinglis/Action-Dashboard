import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRefreshScope } from "./refresh-scope-db";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import type { DashboardViewFilters } from "@/lib/types/domain";

const USER = "user-1";
const TZ = "America/New_York";
const NOW = new Date("2026-10-05T18:00:00.000Z");
// The default "today" window, resolved for NOW at a 4am rollover.
const WINDOW = { start: new Date("2026-10-05T08:00:00.000Z"), end: new Date("2026-10-06T08:00:00.000Z") };

const FILTERS: DashboardViewFilters = { dateWindow: { kind: "today" }, includePinned: true };

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    user_id: USER,
    sport: "football",
    league: "NFL",
    name: "Lions @ Panthers",
    start_time_utc: "2026-10-05T20:00:00Z",
    start_time_tbd: false,
    end_time_utc: null,
    home_team_id: null,
    away_team_id: null,
    source: "manual",
    automatic_status: "scheduled",
    automatic_home_score: null,
    automatic_away_score: null,
    automatic_period: null,
    automatic_clock: null,
    automatic_changed_at: null,
    manual_status: null,
    manual_home_score: null,
    manual_away_score: null,
    manual_period: null,
    manual_clock: null,
    manual_set_at: null,
    is_pinned: false,
    notes: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

function setup(tables: Record<string, Record<string, unknown>[]> = {}) {
  return createFakeSupabase({
    events: tables.events ?? [],
    bet_legs: tables.bet_legs ?? [],
    bet_leg_events: tables.bet_leg_events ?? [],
    fantasy_roster_slots: tables.fantasy_roster_slots ?? [],
    dfs_lineup_slots: tables.dfs_lineup_slots ?? [],
  });
}

function load(
  fake: ReturnType<typeof createFakeSupabase>,
  filters: DashboardViewFilters = FILTERS,
) {
  return loadRefreshScope(fake as unknown as SupabaseClient, {
    userId: USER,
    timeZone: TZ,
    rolloverHour: 4,
    filters,
    dateWindow: WINDOW,
    now: NOW,
  });
}

describe("loadRefreshScope", () => {
  it("scopes a sport in from a bet leg riding on one of its Events", async () => {
    const fake = setup({
      events: [eventRow()],
      bet_leg_events: [{ id: "l-1", user_id: USER, bet_leg_id: "leg-1", event_id: "event-1" }],
    });

    const { scopes } = await load(fake);

    expect(scopes).toEqual([{ sport: "football", providerSport: "nfl", localDates: ["2026-10-05"] }]);
  });

  it("counts a Fantasy roster slot and a DFS lineup slot as exposure too", async () => {
    // §11.6: exposure is Betting + Fantasy + DFS, so any one of the three is
    // enough to make a sport worth a request.
    const fake = setup({
      events: [eventRow(), eventRow({ id: "event-2", sport: "golf", league: "PGA" })],
      fantasy_roster_slots: [{ id: "f-1", user_id: USER, event_id: "event-1" }],
      dfs_lineup_slots: [{ id: "d-1", user_id: USER, event_id: "event-2" }],
    });

    const { scopes } = await load(fake);

    expect(scopes.map((s) => s.providerSport)).toEqual(["golf", "nfl"]);
  });

  it("ignores an Event nothing is riding on", async () => {
    const fake = setup({ events: [eventRow()] });

    const { scopes } = await load(fake);

    expect(scopes).toEqual([]);
  });

  it("includes a pinned Event with no exposure at all", async () => {
    const fake = setup({ events: [eventRow({ is_pinned: true })] });

    const { scopes } = await load(fake);

    expect(scopes.map((s) => s.providerSport)).toEqual(["nfl"]);
  });

  it("ignores a slot whose player has not been matched to an Event", async () => {
    // event_id is nullable on Fantasy and DFS slots; a null means nothing is
    // riding on any Event yet, not that everything is.
    const fake = setup({
      events: [eventRow()],
      fantasy_roster_slots: [{ id: "f-1", user_id: USER, event_id: null }],
    });

    const { scopes } = await load(fake);

    expect(scopes).toEqual([]);
  });

  it("leaves out an exposed Event that finished last week", async () => {
    // The whole point of narrowing by the date window: a Ticket settled long
    // ago must not drag its sport back into scope and spend a request.
    const fake = setup({
      events: [
        eventRow({
          start_time_utc: "2026-09-28T20:00:00Z",
          automatic_status: "final",
          automatic_changed_at: "2026-09-28T23:30:00Z",
        }),
      ],
      bet_leg_events: [{ id: "l-1", user_id: USER, bet_leg_id: "leg-1", event_id: "event-1" }],
    });

    const { scopes } = await load(fake);

    expect(scopes).toEqual([]);
  });

  it("reaches back for a finished game whose bet never graded", async () => {
    // The bug the user hit: a Sunday game viewed on a later day falls outside
    // every rail rule, so refresh never fetched it, it never reached "final",
    // and the leg riding on it could never settle. An ungraded bet keeps its
    // Event in scope regardless of the date window on screen.
    const fake = setup({
      events: [eventRow({ start_time_utc: "2026-10-04T17:00:00Z", automatic_status: "scheduled" })],
      bet_legs: [{ id: "leg-1", user_id: USER, ticket_id: "t-1", manual_status: null, automatic_status: null }],
      bet_leg_events: [{ id: "l-1", user_id: USER, bet_leg_id: "leg-1", event_id: "event-1" }],
    });

    const { scopes } = await load(fake);

    expect(scopes).toEqual([{ sport: "football", providerSport: "nfl", localDates: ["2026-10-04"] }]);
  });

  it("stops reaching back once the leg has graded", async () => {
    // What keeps the carve-out from growing a game every week: an Event leaves
    // it by being settled, not by aging out.
    const fake = setup({
      events: [eventRow({ start_time_utc: "2026-10-04T17:00:00Z", automatic_status: "scheduled" })],
      bet_legs: [{ id: "leg-1", user_id: USER, ticket_id: "t-1", manual_status: null, automatic_status: "won" }],
      bet_leg_events: [{ id: "l-1", user_id: USER, bet_leg_id: "leg-1", event_id: "event-1" }],
    });

    const { scopes } = await load(fake);

    expect(scopes).toEqual([]);
  });

  it("gives up on an ungraded game older than the backfill window", async () => {
    // A game no provider will ever resolve must not be re-fetched forever.
    const fake = setup({
      events: [eventRow({ start_time_utc: "2026-09-01T17:00:00Z", automatic_status: "scheduled" })],
      bet_legs: [{ id: "leg-1", user_id: USER, ticket_id: "t-1", manual_status: null, automatic_status: null }],
      bet_leg_events: [{ id: "l-1", user_id: USER, bet_leg_id: "leg-1", event_id: "event-1" }],
    });

    const { scopes } = await load(fake);

    expect(scopes).toEqual([]);
  });

  it("does not reach back for a game that has not kicked off", async () => {
    // Every bet on a future game is ungraded; without the start-time check the
    // carve-out would pull in the entire schedule.
    const fake = setup({
      events: [eventRow({ start_time_utc: "2026-11-20T20:00:00Z", automatic_status: "scheduled" })],
      bet_legs: [{ id: "leg-1", user_id: USER, ticket_id: "t-1", manual_status: null, automatic_status: null }],
      bet_leg_events: [{ id: "l-1", user_id: USER, bet_leg_id: "leg-1", event_id: "event-1" }],
    });

    const { scopes } = await load(fake);

    expect(scopes).toEqual([]);
  });

  it("does not reach back for a postponed game, which no score will settle", async () => {
    const fake = setup({
      events: [eventRow({ start_time_utc: "2026-10-04T17:00:00Z", automatic_status: "postponed" })],
      bet_legs: [{ id: "leg-1", user_id: USER, ticket_id: "t-1", manual_status: null, automatic_status: null }],
      bet_leg_events: [{ id: "l-1", user_id: USER, bet_leg_id: "leg-1", event_id: "event-1" }],
    });

    const { scopes } = await load(fake);

    expect(scopes).toEqual([]);
  });

  it("narrows to the View's sport filter", async () => {
    const fake = setup({
      events: [eventRow(), eventRow({ id: "event-2", sport: "golf", league: "PGA" })],
      bet_leg_events: [
        { id: "l-1", user_id: USER, bet_leg_id: "leg-1", event_id: "event-1" },
        { id: "l-2", user_id: USER, bet_leg_id: "leg-2", event_id: "event-2" },
      ],
    });

    const { scopes } = await load(fake, { ...FILTERS, sports: ["golf"] });

    expect(scopes.map((s) => s.providerSport)).toEqual(["golf"]);
  });

  it("drops pinned Events when the View excludes them", async () => {
    const fake = setup({ events: [eventRow({ is_pinned: true })] });

    const { scopes } = await load(fake, { ...FILTERS, includePinned: false });

    expect(scopes).toEqual([]);
  });

  it("reports a relevant sport no adapter covers instead of dropping it", async () => {
    const fake = setup({
      events: [eventRow({ sport: "cricket", league: "IPL" })],
      bet_leg_events: [{ id: "l-1", user_id: USER, bet_leg_id: "leg-1", event_id: "event-1" }],
    });

    const { scopes, unsupportedSports } = await load(fake);

    expect(scopes).toEqual([]);
    expect(unsupportedSports).toEqual(["cricket"]);
  });
});
