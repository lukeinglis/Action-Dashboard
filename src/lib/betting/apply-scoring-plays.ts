// Fetches the ordered scoring feed for the Events that need it, and turns it
// into the same per-participant stats the rest of grading reads. See
// docs/PRD.md §26.1.
//
// This is a per-Event request, so unlike the weekly stat fetch it cannot be
// flat-cost. Two things keep it near zero instead:
//
//   1. Only Events that actually carry a scoring-order leg are asked about. A
//      user with no first-scorer bets spends no requests at all.
//   2. Only legs still ungraded count. A settled leg is settled; re-reading a
//      finished game every refresh for fourteen days would be the whole cost
//      of the settlement backfill spent on nothing.
//
// A failure here degrades like the weekly stats do (§22): the scorelines and
// every other market still land, and the first-scorer legs stay silent.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SportsProvider } from "@/lib/providers/types";
import { loadParticipantCandidates } from "./apply-player-stats";
import { firstTouchdownStats } from "./first-touchdown";
import type { ParticipantCandidate } from "@/lib/providers/match-player-stats";

/**
 * Markets that cannot be answered from a stat line because they turn on the
 * order of scoring. The database filters on this, so adding a market here is
 * what makes refresh start paying for its feed.
 */
export const SCORING_ORDER_MARKETS = ["first_touchdown"];

export interface ApplyScoringPlaysResult {
  /** Event id -> participant id -> stats, shaped for updateLegStates. */
  statsByEvent: Map<string, Map<string, Record<string, number>>>;
  requestCount: number;
  /** First failure, for the non-blocking notice of §22. */
  error?: string;
}

const EMPTY: ApplyScoringPlaysResult = { statsByEvent: new Map(), requestCount: 0 };

export async function applyScoringPlays(
  supabase: SupabaseClient,
  provider: SportsProvider,
  params: {
    userId: string;
    providerKey: string;
    /** Provider sport key, since the feed lives under the sport's own path. */
    providerSport: string;
    sport: string;
    eventIds: string[];
  },
): Promise<ApplyScoringPlaysResult> {
  if (!provider.getScoringPlays || params.eventIds.length === 0) return EMPTY;

  const legs = await loadScoringOrderLegs(supabase, params);
  if (legs.size === 0) return EMPTY;

  const providerEventIds = await loadEventMappings(supabase, {
    userId: params.userId,
    providerKey: params.providerKey,
    eventIds: [...legs.keys()],
  });

  const statsByEvent = new Map<string, Map<string, Record<string, number>>>();
  let requestCount = 0;
  let error: string | undefined;

  for (const [eventId, participants] of legs) {
    const providerEventId = providerEventIds.get(eventId);
    // No mapping means this Event was never matched to a provider record, so
    // there is no feed to ask for. The leg stays open, which is the honest
    // state for a game the provider has not been tied to.
    if (!providerEventId) continue;

    try {
      const plays = await provider.getScoringPlays({
        sport: params.providerSport,
        providerEventId,
      });
      requestCount += 1;

      const stats = firstTouchdownStats(plays, participants);
      if (stats.size > 0) statsByEvent.set(eventId, stats);
    } catch (cause) {
      // Per Event rather than for the whole refresh: one unreadable game must
      // not cost the other games their scorers.
      requestCount += 1;
      error ??= cause instanceof Error ? cause.message : String(cause);
    }
  }

  return { statsByEvent, requestCount, error };
}

/**
 * Merges scoring-order stats into the weekly ones, per Event.
 *
 * Copies rather than mutates on purpose: Events sharing a week share one stats
 * map by reference, so writing into it would leak one game's first scorer into
 * every other game that week.
 */
export function mergeStatsByEvent(
  base: Map<string, Map<string, Record<string, number>>> | undefined,
  extra: Map<string, Map<string, Record<string, number>>>,
): Map<string, Map<string, Record<string, number>>> {
  const merged = new Map(base ?? []);

  for (const [eventId, byParticipant] of extra) {
    const existing = merged.get(eventId);
    const next = new Map(existing ?? []);
    for (const [participantId, stats] of byParticipant) {
      next.set(participantId, { ...(next.get(participantId) ?? {}), ...stats });
    }
    merged.set(eventId, next);
  }

  return merged;
}

/**
 * Event id -> the participants whose ungraded scoring-order legs ride on it.
 *
 * A leg is skipped once `automatic_status` is set: the market is decided and
 * the answer is stored, so re-reading the game would buy nothing.
 */
async function loadScoringOrderLegs(
  supabase: SupabaseClient,
  params: { userId: string; sport: string; eventIds: string[] },
): Promise<Map<string, ParticipantCandidate[]>> {
  const { data: legRows, error: legError } = await supabase
    .from("bet_legs")
    .select("id")
    .eq("user_id", params.userId)
    .in("market_type", SCORING_ORDER_MARKETS)
    .is("automatic_status", null);
  if (legError) throw legError;

  const legIds = ((legRows ?? []) as { id: string }[]).map((r) => r.id);
  if (legIds.length === 0) return new Map();

  const { data: linkRows, error: linkError } = await supabase
    .from("bet_leg_events")
    .select("bet_leg_id,event_id")
    .eq("user_id", params.userId)
    .in("bet_leg_id", legIds)
    .in("event_id", params.eventIds);
  if (linkError) throw linkError;

  const links = (linkRows ?? []) as { bet_leg_id: string; event_id: string }[];
  if (links.length === 0) return new Map();

  const { data: subjectRows, error: subjectError } = await supabase
    .from("bet_leg_subjects")
    .select("bet_leg_id,participant_id")
    .eq("user_id", params.userId)
    .in(
      "bet_leg_id",
      links.map((l) => l.bet_leg_id),
    );
  if (subjectError) throw subjectError;

  const participantIdsByLeg = new Map<string, string[]>();
  for (const row of (subjectRows ?? []) as {
    bet_leg_id: string;
    participant_id: string | null;
  }[]) {
    if (!row.participant_id) continue;
    const list = participantIdsByLeg.get(row.bet_leg_id) ?? [];
    list.push(row.participant_id);
    participantIdsByLeg.set(row.bet_leg_id, list);
  }

  const allIds = [...new Set([...participantIdsByLeg.values()].flat())];
  const candidates = await loadParticipantCandidates(supabase, allIds, params.sport);
  const byId = new Map(candidates.map((c) => [c.id, c]));

  const byEvent = new Map<string, ParticipantCandidate[]>();
  for (const link of links) {
    const participants = (participantIdsByLeg.get(link.bet_leg_id) ?? [])
      .map((id) => byId.get(id))
      .filter((c): c is ParticipantCandidate => c != null);
    if (participants.length === 0) continue;

    const existing = byEvent.get(link.event_id) ?? [];
    for (const participant of participants) {
      if (!existing.some((e) => e.id === participant.id)) existing.push(participant);
    }
    byEvent.set(link.event_id, existing);
  }

  return byEvent;
}

async function loadEventMappings(
  supabase: SupabaseClient,
  params: { userId: string; providerKey: string; eventIds: string[] },
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("provider_mappings")
    .select("entity_id,provider_id")
    .eq("user_id", params.userId)
    .eq("entity_type", "event")
    .eq("provider_key", params.providerKey)
    .in("entity_id", params.eventIds);
  if (error) throw error;

  return new Map(
    ((data ?? []) as { entity_id: string; provider_id: string }[]).map((r) => [
      r.entity_id,
      r.provider_id,
    ]),
  );
}
