// Resolves the players a user's prop legs are about to a stats provider's
// players, and hands back their numbers. See docs/PRD.md §20.2 (matching) and
// §30 (extraction).
//
// Team markets read off the scoreboard, so a refreshed Event is enough to say
// whether a spread is covering. A prop is not on the scoreboard: "Egbuka Over
// 65.5 Receiving Yards" needs that one player's own stat line, which means the
// participant on the leg has to be tied to a provider player id first. This
// file is that step, and the only one that writes participant mappings.
//
// Two things keep the cost down. Only participants that actually carry a prop
// leg are considered — matching the whole league against a user's roster would
// be work with no bet behind it — and Sleeper answers for every player in one
// call, so the fetch is flat regardless of how many props the user holds.
//
// §20.2's rule is inherited whole: a mapping is created only when exactly one
// candidate matches, an ambiguity is reported for the user to resolve, and an
// existing mapping is never overridden. A mapping is a lasting claim about who
// a bet is on, so a wrong one would keep grading the prop against a stranger.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  matchPlayerStats,
  type ParticipantCandidate,
} from "@/lib/providers/match-player-stats";
import type { ProviderPlayerStat } from "@/lib/providers/types";
import { supportedPropMarkets } from "./prop-stats";

export interface ApplyPlayerStatsResult {
  /** Normalized stat lines keyed by participant id, ready for evaluateLeg. */
  statsByParticipant: Map<string, Record<string, number>>;
  participantMappingsCreated: number;
  /**
   * Participants the ladder could not resolve to exactly one player, for the
   * "Needs Match" affordance of §20.2. Their props stay silent meanwhile.
   */
  needsMatch: { participantId: string; name: string; candidateProviderIds: string[] }[];
}

const EMPTY: ApplyPlayerStatsResult = {
  statsByParticipant: new Map(),
  participantMappingsCreated: 0,
  needsMatch: [],
};

/**
 * Matches the user's prop-leg participants against `stats` and returns each
 * matched participant's numbers.
 *
 * Writes nothing but `provider_mappings`: the stat values themselves are not
 * persisted here, because the leg state they feed is written by updateLegStates
 * under §45's automatic-only rule.
 */
export async function applyPlayerStats(
  supabase: SupabaseClient,
  stats: ProviderPlayerStat[],
  options: { userId: string; providerKey: string; sport: string },
): Promise<ApplyPlayerStatsResult> {
  const { userId, providerKey, sport } = options;

  // No stats is not the same as no match: a provider that answered with nothing
  // has nothing to say about any player, and matching against an empty list
  // would report every participant as unmatched.
  if (stats.length === 0) return { ...EMPTY, statsByParticipant: new Map() };

  const participants = await loadPropParticipants(supabase, { userId, sport });
  if (participants.length === 0) return { ...EMPTY, statsByParticipant: new Map() };

  const existingMappings = await loadParticipantMappings(supabase, { userId, providerKey });

  const { matches, ambiguous } = matchPlayerStats(participants, stats, existingMappings);

  const statByProviderId = new Map(stats.map((s) => [s.providerPlayerId, s]));

  const result: ApplyPlayerStatsResult = {
    statsByParticipant: new Map(),
    participantMappingsCreated: 0,
    needsMatch: ambiguous.map((a) => ({
      participantId: a.participantId,
      name: a.name,
      candidateProviderIds: a.candidateProviderIds,
    })),
  };

  // provider_mappings is unique on both (provider_key, provider_id) and
  // (entity_id, provider_key), so a new mapping is skipped if either side is
  // already taken — the same guard apply-provider-events uses for teams.
  const mappedProviderIds = new Set(existingMappings.map((m) => m.providerPlayerId));
  const mappedParticipantIds = new Set(existingMappings.map((m) => m.participantId));

  for (const match of matches) {
    const stat = statByProviderId.get(match.providerPlayerId);
    // A mapping can point at a player the provider is not reporting this week —
    // a bye, or an inactive. The mapping stands; the leg simply stays silent.
    if (stat) result.statsByParticipant.set(match.participantId, stat.stats);

    if (match.via === "mapping") continue;
    if (
      mappedProviderIds.has(match.providerPlayerId) ||
      mappedParticipantIds.has(match.participantId)
    ) {
      continue;
    }

    const { error } = await supabase.from("provider_mappings").insert({
      user_id: userId,
      entity_type: "participant",
      entity_id: match.participantId,
      provider_key: providerKey,
      provider_id: match.providerPlayerId,
      match_method: "auto",
      locked: false,
    });
    if (error) throw error;

    mappedProviderIds.add(match.providerPlayerId);
    mappedParticipantIds.add(match.participantId);
    result.participantMappingsCreated += 1;
  }

  return result;
}

/**
 * The participants named by this user's prop legs, with the team abbreviation
 * the matching ladder uses as a tiebreaker.
 *
 * Scoped to markets a stat line can answer: a futures leg on a player has a
 * participant too, and fetching a week's stats would say nothing about it.
 */
async function loadPropParticipants(
  supabase: SupabaseClient,
  params: { userId: string; sport: string },
): Promise<ParticipantCandidate[]> {
  const { data: legRows, error: legError } = await supabase
    .from("bet_legs")
    .select("id")
    .eq("user_id", params.userId)
    .in("market_type", supportedPropMarkets());
  if (legError) throw legError;

  const legIds = ((legRows ?? []) as { id: string }[]).map((r) => r.id);
  if (legIds.length === 0) return [];

  const { data: subjectRows, error: subjectError } = await supabase
    .from("bet_leg_subjects")
    .select("participant_id")
    .eq("user_id", params.userId)
    .in("bet_leg_id", legIds);
  if (subjectError) throw subjectError;

  const participantIds = [
    ...new Set(
      ((subjectRows ?? []) as { participant_id: string | null }[])
        .map((r) => r.participant_id)
        .filter((id): id is string => id != null),
    ),
  ];
  if (participantIds.length === 0) return [];

  const { data: participantRows, error: participantError } = await supabase
    .from("participants")
    .select("id,name,sport,team_id")
    .eq("sport", params.sport)
    .in("id", participantIds);
  if (participantError) throw participantError;

  const rows = (participantRows ?? []) as {
    id: string;
    name: string;
    sport: string;
    team_id: string | null;
  }[];

  const teamIds = [...new Set(rows.map((r) => r.team_id).filter((id): id is string => id != null))];
  const abbreviationByTeam = await loadTeamAbbreviations(supabase, teamIds);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sport: row.sport,
    teamAbbreviation: row.team_id ? abbreviationByTeam.get(row.team_id) ?? null : null,
  }));
}

async function loadTeamAbbreviations(
  supabase: SupabaseClient,
  teamIds: string[],
): Promise<Map<string, string | null>> {
  if (teamIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("teams")
    .select("id,abbreviation")
    .in("id", teamIds);
  if (error) throw error;

  return new Map(
    ((data ?? []) as { id: string; abbreviation: string | null }[]).map((r) => [
      r.id,
      r.abbreviation,
    ]),
  );
}

async function loadParticipantMappings(
  supabase: SupabaseClient,
  params: { userId: string; providerKey: string },
): Promise<{ participantId: string; providerPlayerId: string }[]> {
  const { data, error } = await supabase
    .from("provider_mappings")
    .select("entity_id,provider_id")
    .eq("user_id", params.userId)
    .eq("entity_type", "participant")
    .eq("provider_key", params.providerKey);
  if (error) throw error;

  return ((data ?? []) as { entity_id: string; provider_id: string }[]).map((r) => ({
    participantId: r.entity_id,
    providerPlayerId: r.provider_id,
  }));
}
