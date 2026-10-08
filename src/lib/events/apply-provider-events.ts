// Writes matched provider results onto Events. See docs/PRD.md sections 20.2
// (matching) and 45 (manual override rules).
//
// Two invariants drive the whole file:
//
//   1. Only `automatic_*` columns are written. A manual override is never
//      cleared by a refresh — `displayedValue = manualValue ?? automaticValue`
//      is resolved at read time, so the automatic value sits underneath.
//   2. `automatic_changed_at` advances only when a value actually changed. A
//      stale override is defined as `automaticChangedAt > manualSetAt` (§45),
//      so bumping the timestamp on every refresh would make every override
//      look stale within a minute and the "needs review" count meaningless.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  matchProviderEvents,
  type EventCandidate,
  type ExistingMapping,
  type MatchContext,
  type ProviderEventMatch,
  type TeamCandidate,
} from "./match-provider-events";
import { toInternalSport } from "@/lib/sports/sport-keys";
import type { EventRow } from "@/lib/db/rows";
import type { ProviderEvent } from "@/lib/providers/types";

export interface ApplyProviderEventsResult {
  /** Events whose automatic values actually moved. */
  updated: number;
  /** Events matched but already up to date, so not written. */
  unchanged: number;
  eventMappingsCreated: number;
  teamMappingsCreated: number;
  /** Provider records with no single internal Event to write to (§20.2 step 4). */
  needsMatch: { providerEventId: string; name: string; candidateEventIds: string[] }[];
  /** Mapped Events the provider stopped reporting. Flagged, never deleted. */
  lostMappingEventIds: string[];
}

interface AutomaticFields {
  automatic_status: string | null;
  automatic_home_score: number | null;
  automatic_away_score: number | null;
  automatic_period: string | null;
  automatic_clock: string | null;
}

/**
 * Provider home/away onto the Event's own home/away. These disagree when a
 * manually created Event has the sides reversed; writing the provider's values
 * positionally would silently invert the scoreline.
 */
export function orientAutomaticFields(
  match: ProviderEventMatch,
  event: Pick<EventRow, "home_team_id" | "away_team_id">,
): AutomaticFields {
  const { providerEvent, homeTeamId, awayTeamId } = match;

  const reversed =
    homeTeamId != null &&
    awayTeamId != null &&
    event.home_team_id === awayTeamId &&
    event.away_team_id === homeTeamId;

  return {
    automatic_status: providerEvent.status ?? null,
    automatic_home_score:
      (reversed ? providerEvent.awayScore : providerEvent.homeScore) ?? null,
    automatic_away_score:
      (reversed ? providerEvent.homeScore : providerEvent.awayScore) ?? null,
    automatic_period: providerEvent.period ?? null,
    automatic_clock: providerEvent.clock ?? null,
  };
}

export function hasAutomaticChange(next: AutomaticFields, current: EventRow): boolean {
  return (
    next.automatic_status !== current.automatic_status ||
    next.automatic_home_score !== current.automatic_home_score ||
    next.automatic_away_score !== current.automatic_away_score ||
    next.automatic_period !== current.automatic_period ||
    next.automatic_clock !== current.automatic_clock
  );
}

/**
 * Matches `providerEvents` against the user's Events and writes the automatic
 * fields. Refresh updates existing Events and never creates them (§20.2), so a
 * provider record with no internal counterpart is reported and dropped.
 */
export async function applyProviderEvents(
  supabase: SupabaseClient,
  providerEvents: ProviderEvent[],
  options: { userId: string; providerKey: string; timeZone: string; now?: () => string },
): Promise<ApplyProviderEventsResult> {
  const { userId, providerKey, timeZone } = options;
  const now = options.now ?? (() => new Date().toISOString());

  if (providerEvents.length === 0) {
    return {
      updated: 0,
      unchanged: 0,
      eventMappingsCreated: 0,
      teamMappingsCreated: 0,
      needsMatch: [],
      lostMappingEventIds: [],
    };
  }

  const sports = [...new Set(providerEvents.map((e) => toInternalSport(e.sport)))];
  const context = await loadMatchContext(supabase, { providerKey, timeZone, sports });
  const { matches, lostMappingEventIds, resolvedTeams } = matchProviderEvents(
    providerEvents,
    context,
  );

  const eventRows = await loadEventRows(
    supabase,
    matches
      .map((m) => (m.outcome.kind === "mapped" || m.outcome.kind === "matched" ? m.outcome.eventId : null))
      .filter((id): id is string => id != null),
  );

  const result: ApplyProviderEventsResult = {
    updated: 0,
    unchanged: 0,
    eventMappingsCreated: 0,
    teamMappingsCreated: 0,
    needsMatch: [],
    lostMappingEventIds,
  };

  // provider_mappings is unique on both (provider_key, provider_id) and
  // (entity_id, provider_key), so a mapping is skipped if either side is taken.
  const mappedTeamProviderIds = new Set(context.teamMappings.map((m) => m.providerId));
  const mappedTeamIds = new Set(context.teamMappings.map((m) => m.entityId));
  for (const { teamId, providerId } of resolvedTeams) {
    if (mappedTeamProviderIds.has(providerId) || mappedTeamIds.has(teamId)) continue;
    await insertMapping(supabase, {
      userId,
      providerKey,
      entityType: "team",
      entityId: teamId,
      providerId,
    });
    result.teamMappingsCreated += 1;
  }

  for (const match of matches) {
    const { outcome, providerEvent } = match;

    if (outcome.kind === "unmatched" || outcome.kind === "ambiguous") {
      result.needsMatch.push({
        providerEventId: providerEvent.providerEventId,
        name: providerEvent.name,
        candidateEventIds: outcome.kind === "ambiguous" ? outcome.candidateEventIds : [],
      });
      continue;
    }

    if (outcome.kind === "matched") {
      await insertMapping(supabase, {
        userId,
        providerKey,
        entityType: "event",
        entityId: outcome.eventId,
        providerId: providerEvent.providerEventId,
      });
      result.eventMappingsCreated += 1;
    }

    const row = eventRows.get(outcome.eventId);
    if (!row) continue;

    const next = orientAutomaticFields(match, row);
    if (!hasAutomaticChange(next, row)) {
      result.unchanged += 1;
      continue;
    }

    const { error } = await supabase
      .from("events")
      .update({ ...next, automatic_changed_at: now() })
      .eq("id", outcome.eventId);
    if (error) throw error;
    result.updated += 1;
  }

  return result;
}

async function loadMatchContext(
  supabase: SupabaseClient,
  params: { providerKey: string; timeZone: string; sports: string[] },
): Promise<MatchContext> {
  const { data: mappingRows, error: mappingError } = await supabase
    .from("provider_mappings")
    .select("entity_type,entity_id,provider_id")
    .eq("provider_key", params.providerKey);
  if (mappingError) throw mappingError;

  const teamMappings: ExistingMapping[] = [];
  const eventMappings: ExistingMapping[] = [];
  for (const row of (mappingRows ?? []) as {
    entity_type: string;
    entity_id: string;
    provider_id: string;
  }[]) {
    const mapping = { entityId: row.entity_id, providerId: row.provider_id };
    if (row.entity_type === "team") teamMappings.push(mapping);
    else if (row.entity_type === "event") eventMappings.push(mapping);
  }

  const { data: teamRows, error: teamError } = await supabase
    .from("teams")
    .select("id,sport,league,name,abbreviation")
    .in("sport", params.sports);
  if (teamError) throw teamError;

  const { data: eventRows, error: eventError } = await supabase
    .from("events")
    .select("id,sport,league,name,start_time_utc,home_team_id,away_team_id")
    .in("sport", params.sports);
  if (eventError) throw eventError;

  const events: EventCandidate[] = (
    (eventRows ?? []) as {
      id: string;
      sport: string;
      league: string | null;
      name: string;
      start_time_utc: string | null;
      home_team_id: string | null;
      away_team_id: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    sport: row.sport,
    league: row.league,
    name: row.name,
    startTimeUtc: row.start_time_utc,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
  }));

  return {
    timeZone: params.timeZone,
    teamMappings,
    eventMappings,
    teams: (teamRows ?? []) as TeamCandidate[],
    events,
  };
}

async function loadEventRows(
  supabase: SupabaseClient,
  eventIds: string[],
): Promise<Map<string, EventRow>> {
  if (eventIds.length === 0) return new Map();

  const { data, error } = await supabase.from("events").select("*").in("id", eventIds);
  if (error) throw error;

  return new Map(((data ?? []) as EventRow[]).map((row) => [row.id, row]));
}

async function insertMapping(
  supabase: SupabaseClient,
  params: {
    userId: string;
    providerKey: string;
    entityType: "team" | "event";
    entityId: string;
    providerId: string;
  },
): Promise<void> {
  const { error } = await supabase.from("provider_mappings").insert({
    user_id: params.userId,
    entity_type: params.entityType,
    entity_id: params.entityId,
    provider_key: params.providerKey,
    provider_id: params.providerId,
    match_method: "auto",
    locked: false,
  });
  if (error) throw error;
}
