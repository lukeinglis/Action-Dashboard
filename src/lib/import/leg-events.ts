// Resolves the Event an approved leg belongs to, creating the game from the
// provider's schedule when the user never entered it by hand.
//
// Kept out of the Server Action so the decision of *whether* to create an
// Event is unit-testable: the action supplies the real Supabase client and a
// real provider fetch, tests supply fakes.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureEvent } from "@/lib/events/ensure";
import { ensureMatchupTeams } from "@/lib/teams/ensure";
import { providerSportLabel, toProviderSport } from "@/lib/sports/sport-keys";
import type { ProviderEvent } from "@/lib/providers/types";
import { findTeam, type TeamCandidate } from "./match-parsed-legs";
import type { ApprovedLeg } from "./pipeline";

export interface LegEventDeps {
  teams: TeamCandidate[];
  /**
   * The provider's schedule for a provider sport key, optionally for the slate
   * containing a given instant rather than today's.
   *
   * The instant is passed rather than a formatted date because which calendar
   * day a kickoff belongs to is the provider's convention, not ours — ESPN files
   * a Saturday-night game under the Saturday even though it is Sunday in UTC.
   * `cachedScheduleLoader` takes that conversion as a dependency.
   */
  loadSchedule: (providerSport: string, slateAtUtc?: string) => Promise<ProviderEvent[]>;
  providerKey: string;
}

/**
 * The id of the Event this leg's matchup belongs to, creating it — and the
 * Teams it needs — if necessary, or undefined when the matchup can't be
 * resolved to one.
 *
 * Returns undefined rather than guessing when the matchup stays ambiguous:
 * §20.2 reports an ambiguous match instead of picking one, and a leg pointed at
 * the wrong game grades to a confidently wrong result.
 */
export async function resolveLegEventId(
  supabase: SupabaseClient,
  userId: string,
  leg: Pick<ApprovedLeg, "sport" | "league" | "matchup">,
  deps: LegEventDeps,
): Promise<string | undefined> {
  if (!leg.matchup) return undefined;

  const matchedAway = findTeam(leg.matchup.awayTeamName, leg.sport, deps.teams);
  const matchedHome = findTeam(leg.matchup.homeTeamName, leg.sport, deps.teams);

  // Extraction can't always determine Sport; a matched team's own sport is
  // authoritative and is what the Event must be stored under so refresh scope
  // and the Schedule Rail find it. With neither a parsed sport nor a matched
  // team there is nothing to look the game up under.
  const sport = leg.sport || matchedAway?.sport || matchedHome?.sport;
  if (!sport) return undefined;

  const providerSport = toProviderSport(sport, leg.league);
  // When the slip printed a kickoff, ask for that game's slate rather than
  // today's — a slip reviewed days after it was placed names a game the current
  // scoreboard no longer carries. Most screenshots print no time, in which case
  // this is undefined and the current slate is still what gets asked for.
  const schedule = providerSport
    ? await deps.loadSchedule(providerSport, leg.matchup.startTimeUtc)
    : [];

  // A team the user doesn't have yet is the common case for any sport outside
  // the NFL seed data — every college football and soccer leg imported so far
  // died here. `ensureMatchupTeams` creates the missing side from the scheduled
  // game itself, so the name is the provider's rather than the screenshot's.
  let awayTeam = matchedAway;
  let homeTeam = matchedHome;
  if (!awayTeam || !homeTeam) {
    if (!providerSport) return undefined;
    const ensured = await ensureMatchupTeams(
      supabase,
      userId,
      {
        sport,
        // The canonical league for the provider key, not `leg.league`: a slip
        // writes "CFB" or "England - Premier League", and a Team stored under
        // that spelling is one `sport-keys` can't translate back.
        league: providerSportLabel(providerSport),
        awayTeamName: leg.matchup.awayTeamName,
        homeTeamName: leg.matchup.homeTeamName,
      },
      { teams: deps.teams, schedule },
    );
    if (!ensured) return undefined;
    awayTeam = ensured.awayTeam;
    homeTeam = ensured.homeTeam;
  }

  return ensureEvent(
    supabase,
    userId,
    {
      sport,
      league: leg.league,
      awayTeam: { id: awayTeam.id, name: awayTeam.name, abbreviation: awayTeam.abbreviation },
      homeTeam: { id: homeTeam.id, name: homeTeam.name, abbreviation: homeTeam.abbreviation },
      startTimeUtc: leg.matchup.startTimeUtc,
    },
    { schedule, providerKey: deps.providerKey },
  );
}

/**
 * Wraps a provider schedule fetch so each sport *and slate* is requested at most
 * once per approval, and a provider outage yields an empty schedule instead of
 * an error (§22: a failed refresh must not take the rest of the app down). An
 * empty schedule just means no kickoff can be learned, so the leg stays
 * unlinked — the same outcome as before, and still fixable by hand.
 *
 * `toSlateDate` converts an instant into the provider's own slate identifier,
 * and the cache is keyed on its *output* rather than on the instant. That is
 * what makes a parlay across several games on one day cost one request: two
 * kickoffs three hours apart are different instants but the same slate, and
 * keying on the instant would fetch it twice.
 */
export function cachedScheduleLoader(
  fetchSchedule: (providerSport: string, slateDate?: string) => Promise<ProviderEvent[]>,
  toSlateDate?: (instantUtc: string) => string | undefined,
): (providerSport: string, slateAtUtc?: string) => Promise<ProviderEvent[]> {
  const cache = new Map<string, Promise<ProviderEvent[]>>();
  return (providerSport, slateAtUtc) => {
    const slateDate = slateAtUtc && toSlateDate ? toSlateDate(slateAtUtc) : undefined;
    const key = `${providerSport}|${slateDate ?? ""}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = fetchSchedule(providerSport, slateDate).catch(() => []);
      cache.set(key, pending);
    }
    return pending;
  };
}
