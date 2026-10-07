// Matches provider records to internal Events. See docs/PRD.md section 20.2:
//
//   1. Existing ProviderMapping wins, so the link survives a time change or
//      postponement that would break the match key.
//   2. Otherwise match unmapped Events on the match key.
//   3. Exactly one candidate -> create an `auto` mapping.
//   4. Zero or several candidates -> no mapping, and the Event shows
//      "Needs Match".
//
// Pure, so the whole decision table is testable without a database. Refresh
// never creates Events (§20.2), so an unmatched provider record is simply
// dropped rather than inserted.

import { buildEventMatchKey, normalizeEventName, toLocalDateString } from "./match-key";
import type { ProviderEvent } from "@/lib/providers/types";

/**
 * Provider sport key -> internal `events.sport`. The provider namespaces by
 * league ("nfl"); internally sport and league are separate columns, and teams
 * were seeded as sport "football" / league "NFL".
 */
const INTERNAL_SPORT: Record<string, string> = {
  nfl: "football",
  golf: "golf",
};

export function toInternalSport(providerSport: string): string {
  return INTERNAL_SPORT[providerSport] ?? providerSport;
}

export interface TeamCandidate {
  id: string;
  sport: string;
  league?: string | null;
  name?: string | null;
  abbreviation?: string | null;
}

export interface EventCandidate {
  id: string;
  sport: string;
  league?: string | null;
  name: string;
  startTimeUtc?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
}

export interface ExistingMapping {
  entityId: string;
  providerId: string;
}

export interface MatchContext {
  timeZone: string;
  /** entity_type 'team' mappings for this provider. */
  teamMappings: ExistingMapping[];
  /** entity_type 'event' mappings for this provider. */
  eventMappings: ExistingMapping[];
  teams: TeamCandidate[];
  events: EventCandidate[];
}

export type MatchOutcome =
  | { kind: "mapped"; eventId: string }
  | { kind: "matched"; eventId: string }
  | { kind: "ambiguous"; candidateEventIds: string[] }
  | { kind: "unmatched"; reason: "no-match-key" | "no-candidate" };

export interface ProviderEventMatch {
  providerEvent: ProviderEvent;
  /** Internal team ids, resolved by mapping then abbreviation. */
  homeTeamId: string | null;
  awayTeamId: string | null;
  outcome: MatchOutcome;
}

export interface MatchProviderEventsResult {
  matches: ProviderEventMatch[];
  /**
   * Internal Events mapped to this provider whose provider record did not
   * appear, limited to the dates the provider actually reported on. Flagged,
   * never deleted or remapped (§20.2).
   */
  lostMappingEventIds: string[];
  /** Team mappings worth persisting so the next refresh skips the name match. */
  resolvedTeams: { teamId: string; providerId: string }[];
}

function indexByProviderId(mappings: ExistingMapping[]): Map<string, string> {
  return new Map(mappings.map((m) => [m.providerId, m.entityId]));
}

export interface TeamRef {
  providerId?: string;
  abbreviation?: string;
  name?: string;
}

/**
 * Internal team id for a provider competitor. The mapping is authoritative;
 * abbreviation and name are the bootstrap for the first refresh, when no team
 * mapping exists yet.
 *
 * Name is not redundant with abbreviation: ESPN calls Washington "WSH" and the
 * seeded team is "WAS", which was the single mismatch across all 32 NFL teams.
 * Matching the full name as well fixes that without a hardcoded alias list
 * that would need a new entry every time a provider disagrees.
 */
export function resolveTeamId(
  ref: TeamRef,
  sport: string,
  league: string | undefined,
  teamIdByProviderId: Map<string, string>,
  teams: TeamCandidate[],
): string | null {
  if (ref.providerId) {
    const mapped = teamIdByProviderId.get(ref.providerId);
    if (mapped) return mapped;
  }

  const inScope = teams.filter(
    (t) => t.sport === sport && (league == null || t.league == null || t.league === league),
  );

  // Two teams matching one provider competitor is a data problem; guessing
  // would silently write scores onto the wrong Event.
  const unique = (hits: TeamCandidate[]) => (hits.length === 1 ? hits[0].id : null);

  if (ref.abbreviation) {
    const wanted = normalizeEventName(ref.abbreviation);
    const byAbbreviation = unique(
      inScope.filter((t) => t.abbreviation != null && normalizeEventName(t.abbreviation) === wanted),
    );
    if (byAbbreviation) return byAbbreviation;
  }

  if (ref.name) {
    const wanted = normalizeEventName(ref.name);
    return unique(inScope.filter((t) => t.name != null && normalizeEventName(t.name) === wanted));
  }

  return null;
}

export function matchProviderEvents(
  providerEvents: ProviderEvent[],
  context: MatchContext,
): MatchProviderEventsResult {
  const { timeZone, teams, events } = context;
  const teamIdByProviderId = indexByProviderId(context.teamMappings);
  const eventIdByProviderId = indexByProviderId(context.eventMappings);

  const resolvedTeams = new Map<string, string>();
  const matches: ProviderEventMatch[] = [];

  // An Event already mapped to this provider is never a match-key candidate:
  // it belongs to whichever provider record claimed it.
  const mappedEventIds = new Set(eventIdByProviderId.values());

  interface Pending {
    index: number;
    matchKey: string;
  }
  const pending: Pending[] = [];

  for (const providerEvent of providerEvents) {
    const sport = toInternalSport(providerEvent.sport);
    const league = providerEvent.league;

    const homeTeamId = resolveTeamId(
      {
        providerId: providerEvent.homeTeamProviderId,
        abbreviation: providerEvent.homeTeamAbbreviation,
        name: providerEvent.homeTeamName,
      },
      sport,
      league,
      teamIdByProviderId,
      teams,
    );
    const awayTeamId = resolveTeamId(
      {
        providerId: providerEvent.awayTeamProviderId,
        abbreviation: providerEvent.awayTeamAbbreviation,
        name: providerEvent.awayTeamName,
      },
      sport,
      league,
      teamIdByProviderId,
      teams,
    );

    if (homeTeamId && providerEvent.homeTeamProviderId) {
      resolvedTeams.set(providerEvent.homeTeamProviderId, homeTeamId);
    }
    if (awayTeamId && providerEvent.awayTeamProviderId) {
      resolvedTeams.set(providerEvent.awayTeamProviderId, awayTeamId);
    }

    const index = matches.length;
    matches.push({
      providerEvent,
      homeTeamId,
      awayTeamId,
      outcome: { kind: "unmatched", reason: "no-candidate" },
    });

    const existing = eventIdByProviderId.get(providerEvent.providerEventId);
    if (existing) {
      matches[index].outcome = { kind: "mapped", eventId: existing };
      continue;
    }

    const matchKey = buildEventMatchKey(
      {
        sport,
        league,
        name: providerEvent.name,
        startTimeUtc: providerEvent.startTimeUtc,
        homeTeamId,
        awayTeamId,
      },
      timeZone,
    );

    if (!matchKey) {
      matches[index].outcome = { kind: "unmatched", reason: "no-match-key" };
      continue;
    }

    pending.push({ index, matchKey });
  }

  // Group both sides by match key before deciding. An MLB doubleheader puts
  // two provider records and two Events under one key, and neither side can be
  // told apart by key alone — so both are ambiguous rather than arbitrarily
  // paired (§20.2 step 4).
  const candidatesByKey = new Map<string, string[]>();
  for (const candidate of events) {
    if (mappedEventIds.has(candidate.id)) continue;
    const key = buildEventMatchKey(candidate, timeZone);
    if (!key) continue;
    const bucket = candidatesByKey.get(key);
    if (bucket) bucket.push(candidate.id);
    else candidatesByKey.set(key, [candidate.id]);
  }

  const pendingByKey = new Map<string, number[]>();
  for (const { index, matchKey } of pending) {
    const bucket = pendingByKey.get(matchKey);
    if (bucket) bucket.push(index);
    else pendingByKey.set(matchKey, [index]);
  }

  for (const [key, indexes] of pendingByKey) {
    const candidateEventIds = candidatesByKey.get(key) ?? [];

    if (candidateEventIds.length === 0) {
      for (const index of indexes) {
        matches[index].outcome = { kind: "unmatched", reason: "no-candidate" };
      }
      continue;
    }

    if (indexes.length === 1 && candidateEventIds.length === 1) {
      matches[indexes[0]].outcome = { kind: "matched", eventId: candidateEventIds[0] };
      continue;
    }

    for (const index of indexes) {
      matches[index].outcome = { kind: "ambiguous", candidateEventIds };
    }
  }

  return {
    matches,
    lostMappingEventIds: findLostMappings(providerEvents, context, timeZone),
    resolvedTeams: [...resolvedTeams].map(([providerId, teamId]) => ({ teamId, providerId })),
  };
}

/**
 * A mapping is "lost" only when the provider reported on that Event's date and
 * the record still didn't show up. Without the date restriction every Event
 * outside the refreshed slate would be flagged on every refresh.
 */
function findLostMappings(
  providerEvents: ProviderEvent[],
  context: MatchContext,
  timeZone: string,
): string[] {
  const reportedProviderIds = new Set(providerEvents.map((e) => e.providerEventId));
  const reportedDates = new Set(
    providerEvents
      .filter((e) => e.startTimeUtc)
      .map((e) => toLocalDateString(e.startTimeUtc!, timeZone)),
  );
  const eventsById = new Map(context.events.map((e) => [e.id, e]));

  const lost: string[] = [];
  for (const mapping of context.eventMappings) {
    if (reportedProviderIds.has(mapping.providerId)) continue;

    const event = eventsById.get(mapping.entityId);
    if (!event?.startTimeUtc) continue;
    if (!reportedDates.has(toLocalDateString(event.startTimeUtc, timeZone))) continue;

    lost.push(mapping.entityId);
  }
  return lost;
}
