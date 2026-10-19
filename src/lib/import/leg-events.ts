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
  /** The provider's schedule for a provider sport key. */
  loadSchedule: (providerSport: string) => Promise<ProviderEvent[]>;
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
  const schedule = providerSport ? await deps.loadSchedule(providerSport) : [];

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
 * Wraps a provider schedule fetch so each sport is requested at most once per
 * approval, and a provider outage yields an empty schedule instead of an
 * error (§22: a failed refresh must not take the rest of the app down). An
 * empty schedule just means no kickoff can be learned, so the leg stays
 * unlinked — the same outcome as before, and still fixable by hand.
 */
export function cachedScheduleLoader(
  fetchSchedule: (providerSport: string) => Promise<ProviderEvent[]>,
): (providerSport: string) => Promise<ProviderEvent[]> {
  const cache = new Map<string, Promise<ProviderEvent[]>>();
  return (providerSport) => {
    let pending = cache.get(providerSport);
    if (!pending) {
      pending = fetchSchedule(providerSport).catch(() => []);
      cache.set(providerSport, pending);
    }
    return pending;
  };
}
