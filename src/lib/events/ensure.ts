// Find-or-create for the Event behind an imported leg's matchup.
// See docs/PRD.md §30 ("Event Matching").
//
// Why this exists: the only way to create an Event was the manual form at
// /events/new. Import matched legs against Events the user already had and
// left the rest unlinked — so importing a slip for a game not already entered
// by hand produced a Ticket whose legs point at no game at all. Grading needs
// the scoreline and refresh scope is built from Events, so such a leg can never
// settle.
//
// The slip's own text does survive, in `bet_legs.raw_description`, and
// `repairLegs` re-derives links from it after the fact. That is not a substitute
// for creating the Event here: §20.2 allows creation only from an explicit user
// action and has refresh "never create new ones", so `repairLegs` can rediscover
// only games the user already has. A missing game has to come from approval.
//
// An Event is only created with a real start time. `buildEventMatchKey`
// returns null without one, which would leave the row permanently unmatchable
// against the provider and invisible to the Schedule Rail — a worse outcome
// than the unlinked leg it replaced, because it looks fixed.

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTeamPairKey, normalizeEventName } from "@/lib/events/match-key";
import { toEvent, type EventRow } from "@/lib/db/rows";
import type { ProviderEvent } from "@/lib/providers/types";

export interface EnsureEventTeam {
  id: string;
  name: string;
  abbreviation?: string | null;
}

export interface EnsureEventInput {
  sport: string;
  league?: string;
  awayTeam: EnsureEventTeam;
  homeTeam: EnsureEventTeam;
  /** From the slip, when it printed a kickoff. Real screenshots usually don't. */
  startTimeUtc?: string;
}

export interface EnsureEventDeps {
  /**
   * The provider's schedule for this sport, used to learn the kickoff the slip
   * didn't print. Pass `[]` when the provider is unavailable: a refresh that
   * fails must not take import down with it (§22).
   */
  schedule: ProviderEvent[];
  providerKey: string;
}

/**
 * Returns the id of the user's Event for this matchup, creating it from the
 * provider's schedule if absent, or undefined when no kickoff can be
 * established for it.
 *
 * Matching an existing Event reuses `buildTeamPairKey` — the same fallback
 * `matchParsedLeg` proposes with — so approval links the leg to the very
 * Event the review screen showed rather than quietly creating a second copy
 * of a game the user already has.
 */
export async function ensureEvent(
  supabase: SupabaseClient,
  userId: string,
  input: EnsureEventInput,
  deps: EnsureEventDeps,
): Promise<string | undefined> {
  const existing = await findByTeamPair(supabase, userId, input);
  if (existing) return existing;

  const providerEvent = findProviderEvent(input, deps.schedule);
  const startTimeUtc = input.startTimeUtc ?? providerEvent?.startTimeUtc;
  if (!startTimeUtc) return undefined;

  const { data, error } = await supabase
    .from("events")
    .insert({
      user_id: userId,
      sport: input.sport,
      league: input.league ?? null,
      name: `${input.awayTeam.name} @ ${input.homeTeam.name}`,
      start_time_utc: startTimeUtc,
      home_team_id: input.homeTeam.id,
      away_team_id: input.awayTeam.id,
      // "provider" only when the provider is where the kickoff came from; a
      // start time off the slip itself is the user's own data.
      source: providerEvent?.startTimeUtc ? "provider" : "manual",
    })
    .select("*")
    .single();

  if (error) {
    // A parlay repeats the same game across legs, and two legs of one slip are
    // approved in the same pass — prefer whichever row won over failing the
    // whole approval.
    const raced = await findByTeamPair(supabase, userId, input);
    if (raced) return raced;
    throw error;
  }

  const event = toEvent(data as EventRow);

  if (providerEvent) {
    // Bind the new Event to the provider game directly, so refresh updates it
    // by mapping (§20.2 line 1) instead of re-deriving a match key every time.
    const { error: mappingError } = await supabase.from("provider_mappings").insert({
      user_id: userId,
      entity_type: "event",
      entity_id: event.id,
      provider_key: deps.providerKey,
      provider_id: providerEvent.providerEventId,
      match_method: "auto",
      locked: false,
    });
    // A mapping is an optimization; the match key still works without it.
    if (mappingError && mappingError.code !== "23505") throw mappingError;
  }

  return event.id;
}

async function findByTeamPair(
  supabase: SupabaseClient,
  userId: string,
  input: EnsureEventInput,
): Promise<string | undefined> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("user_id", userId)
    .eq("sport", input.sport);
  if (error) throw error;

  const pairKey = buildTeamPairKey(input.sport, input.awayTeam.id, input.homeTeam.id);
  const matches = (data ?? [])
    .map((row) => toEvent(row as EventRow))
    .filter(
      (event) =>
        event.homeTeamId &&
        event.awayTeamId &&
        buildTeamPairKey(event.sport, event.awayTeamId, event.homeTeamId) === pairKey,
    );

  if (matches.length <= 1) return matches[0]?.id;

  // Two teams meet more than once a season. Prefer the meeting nearest the
  // kickoff we know about, falling back to the soonest.
  const target = input.startTimeUtc ? new Date(input.startTimeUtc).getTime() : Date.now();
  return matches.reduce((closest, event) => {
    if (!event.startTimeUtc) return closest;
    if (!closest.startTimeUtc) return event;
    const a = Math.abs(new Date(event.startTimeUtc).getTime() - target);
    const b = Math.abs(new Date(closest.startTimeUtc).getTime() - target);
    return a < b ? event : closest;
  }).id;
}

/** The scheduled game for this matchup, by abbreviation then by team name. */
function findProviderEvent(
  input: EnsureEventInput,
  schedule: ProviderEvent[],
): ProviderEvent | undefined {
  const wanted = [input.awayTeam, input.homeTeam].map(sideKeys);

  return schedule.find((candidate) => {
    const sides = [
      { abbreviation: candidate.awayTeamAbbreviation, name: candidate.awayTeamName },
      { abbreviation: candidate.homeTeamAbbreviation, name: candidate.homeTeamName },
    ].map(sideKeys);

    // Order-independent: a slip's "@" is not always the provider's.
    return wanted.every((want) => sides.some((side) => sharesKey(want, side)));
  });
}

function sideKeys(team: { name?: string | null; abbreviation?: string | null }): Set<string> {
  const keys = new Set<string>();
  if (team.abbreviation) keys.add(`abbr:${normalizeEventName(team.abbreviation)}`);
  if (team.name) keys.add(`name:${normalizeEventName(team.name)}`);
  return keys;
}

function sharesKey(a: Set<string>, b: Set<string>): boolean {
  for (const key of a) if (b.has(key)) return true;
  return false;
}
