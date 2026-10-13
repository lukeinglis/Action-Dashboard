// Resolves the Event an approved leg belongs to, creating the game from the
// provider's schedule when the user never entered it by hand.
//
// Kept out of the Server Action so the decision of *whether* to create an
// Event is unit-testable: the action supplies the real Supabase client and a
// real provider fetch, tests supply fakes.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureEvent } from "@/lib/events/ensure";
import { toProviderSport } from "@/lib/sports/sport-keys";
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
 * The id of the Event this leg's matchup belongs to, creating it if needed, or
 * undefined when the matchup can't be resolved to one.
 *
 * Returns undefined rather than guessing when either team is unknown: §20.2
 * reports an ambiguous match instead of picking one, and a leg pointed at the
 * wrong game grades to a confidently wrong result.
 */
export async function resolveLegEventId(
  supabase: SupabaseClient,
  userId: string,
  leg: Pick<ApprovedLeg, "sport" | "league" | "matchup">,
  deps: LegEventDeps,
): Promise<string | undefined> {
  if (!leg.matchup) return undefined;

  const awayTeam = findTeam(leg.matchup.awayTeamName, leg.sport, deps.teams);
  const homeTeam = findTeam(leg.matchup.homeTeamName, leg.sport, deps.teams);
  if (!awayTeam || !homeTeam) return undefined;

  // Extraction can't always determine Sport; the matched teams' own sport is
  // authoritative and is what the Event must be stored under so refresh scope
  // and the Schedule Rail find it.
  const sport = leg.sport || awayTeam.sport || homeTeam.sport;
  const providerSport = toProviderSport(sport, leg.league);
  const schedule = providerSport ? await deps.loadSchedule(providerSport) : [];

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
