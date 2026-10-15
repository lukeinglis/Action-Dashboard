// Re-derives a saved BetLeg's Event link and Subjects from the slip text it was
// created from. See docs/PRD.md §26.1 (leg linkage), §26.2 (direction encodes
// Over/Under) and §30 (the import pipeline this reuses).
//
// Why this exists: a leg's Event link and Subjects are proposed once, at import
// approval, and never revisited. So every bug in the matcher is baked
// permanently into the rows it wrote, and fixing the matcher only helps the
// *next* import. Legs imported earlier stay broken in three ways, all of which
// were actually present in the author's own data:
//
//   1. No Event link at all, because the slip printed no kickoff and the
//      matcher could not yet fall back to the team pair. updateLegStates starts
//      from bet_leg_events, so such a leg is never even loaded — it can never
//      grade, and the Ticket holding it never settles.
//   2. A single Subject rooting *against* the team the user backed, because the
//      selection "JAX Jaguars" did not string-equal the event side "JAX" and
//      was taken for the opponent. This is the dangerous one: the leg does not
//      fail to grade, it grades *inverted*, reporting a win as a loss.
//   3. No Subject at all on a player prop, because the named player had no
//      Participant yet and the proposal was dropped. §26.2 stores Over/Under in
//      the direction, so losing the Subject loses the bet's meaning.
//
// `BetLeg.rawDescription` is the verbatim leg block the parser was handed, so
// all of that is recoverable: parse it back, run today's matcher, and write
// only what disagrees.
//
// Two rules keep this safe to run repeatedly:
//
//   - Nothing is written unless the current matcher actually disagrees with
//     what is stored, so a refresh over healthy legs costs no writes.
//   - A direction the user set by hand is never touched (§45): only rows still
//     marked `auto` are corrected.
//
// Deliberately never creates an Event. §20.2 keeps Event creation out of the
// refresh path, so a leg whose game is genuinely absent is reported for the
// user rather than conjured — the same answer the Schedule Rail would give.

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseLegBlock } from "@/lib/import/parse-slip-text";
import { matchParsedLeg, type MatchCandidates } from "@/lib/import/match-parsed-legs";
import { setBetLegSubject } from "@/lib/tickets/bet-leg-subjects";
import { linkBetLegEvent } from "@/lib/tickets/bet-leg-events";
import { ensureParticipant } from "@/lib/participants/ensure";
import type { RootingDirection } from "@/lib/types/domain";

export interface StoredSubject {
  teamId: string | null;
  participantId: string | null;
  direction: RootingDirection;
  directionSource: "auto" | "manual";
}

export interface StoredLeg {
  id: string;
  sport: string;
  league?: string | null;
  rawDescription: string | null;
  /** Whether the leg already points at any Event. */
  hasEventLink: boolean;
  subjects: StoredSubject[];
}

/** A Subject the matcher proposes and the stored rows do not already satisfy. */
export interface SubjectRepair {
  teamId?: string;
  participantId?: string;
  /** Set when the named player has no Participant yet, as at import approval. */
  createParticipantNamed?: string;
  direction: RootingDirection;
}

export interface LegRepairPlan {
  legId: string;
  sport: string;
  league?: string;
  /** The Event the current matcher resolves, when the leg has no link yet. */
  linkEventId?: string;
  subjects: SubjectRepair[];
  /**
   * Why no Event can be linked, when one is still missing. Not a failure: both
   * answers mean the leg needs the user, and saying which keeps the refresh
   * summary honest instead of silently counting it as fixed.
   *
   * `future` — the slip named no game at all (a season outright, a tournament
   * winner), so no scoreline will ever settle it.
   * `unknown_teams` — it named a game whose teams or Event we do not carry.
   */
  unlinkable?: "future" | "unknown_teams";
}

/**
 * What a stored leg needs to match what today's matcher would produce, or null
 * when it needs nothing (or cannot be read back at all).
 *
 * Pure: the caller loads the legs and candidates once and applies the result.
 */
export function planLegRepair(
  leg: StoredLeg,
  candidates: MatchCandidates,
  timeZone: string,
): LegRepairPlan | null {
  if (!leg.rawDescription) return null;

  const parsed = parseLegBlock(leg.rawDescription);
  if (!parsed) return null;

  const match = matchParsedLeg(parsed, candidates, timeZone);

  const linkEventId = leg.hasEventLink ? undefined : match.eventId;
  const unlinkable = legUnlinkableReason(leg, match.eventExpected, linkEventId);

  const subjects: SubjectRepair[] = [];
  for (const proposal of match.subjects) {
    const repair = subjectRepair(leg, proposal);
    if (repair) subjects.push(repair);
  }

  if (!linkEventId && !unlinkable && subjects.length === 0) return null;

  return {
    legId: leg.id,
    // The leg's own sport is authoritative for creating a Participant under it;
    // the slip's own text may have left it blank.
    sport: leg.sport || parsed.sport,
    league: leg.league ?? parsed.league ?? undefined,
    linkEventId,
    subjects,
    unlinkable,
  };
}

function legUnlinkableReason(
  leg: StoredLeg,
  eventExpected: boolean,
  linkEventId: string | undefined,
): LegRepairPlan["unlinkable"] {
  if (leg.hasEventLink || linkEventId) return undefined;
  return eventExpected ? "unknown_teams" : "future";
}

/**
 * The write a single proposed Subject needs, or undefined when the stored rows
 * already say the same thing.
 *
 * A proposal that resolved to neither a Team nor a Participant — and that
 * approval would not create one for — is dropped exactly as approval drops it:
 * `setBetLegSubject` requires one or the other.
 */
function subjectRepair(
  leg: StoredLeg,
  proposal: { teamId?: string; participantId?: string; createParticipant?: boolean; name: string; direction: RootingDirection },
): SubjectRepair | undefined {
  if (!proposal.teamId && !proposal.participantId) {
    return proposal.createParticipant
      ? { createParticipantNamed: proposal.name, direction: proposal.direction }
      : undefined;
  }

  const stored = leg.subjects.find((s) =>
    proposal.teamId ? s.teamId === proposal.teamId : s.participantId === proposal.participantId,
  );

  // Already correct, or deliberately set by the user — §45 makes a manual
  // direction outrank anything computed, so re-proposing it is not a repair.
  if (stored && (stored.directionSource === "manual" || stored.direction === proposal.direction)) {
    return undefined;
  }

  return { teamId: proposal.teamId, participantId: proposal.participantId, direction: proposal.direction };
}

export interface RepairLegsResult {
  /** Legs that actually changed — the count worth showing the user. */
  legsRepaired: number;
  /** Legs given an Event link they were missing. */
  eventsLinked: number;
  /** Subject rows written — inserted, or corrected away from a wrong direction. */
  subjectsWritten: number;
  /** Legs the slip named no game for: an outright or season future. */
  futures: number;
  /** Legs naming a game whose teams or Event we do not carry. */
  unresolved: number;
}

/**
 * Brings every stored leg back in line with the current matcher.
 *
 * Idempotent, and cheap on a healthy data set: planning is pure and writes
 * happen only where the stored rows actually disagree, so this costs three
 * queries and nothing else once the legs are correct.
 */
export async function repairLegs(
  supabase: SupabaseClient,
  userId: string,
  legs: StoredLeg[],
  deps: { candidates: MatchCandidates; timeZone: string },
): Promise<RepairLegsResult> {
  const result: RepairLegsResult = {
    legsRepaired: 0,
    eventsLinked: 0,
    subjectsWritten: 0,
    futures: 0,
    unresolved: 0,
  };

  for (const leg of legs) {
    const plan = planLegRepair(leg, deps.candidates, deps.timeZone);
    if (!plan) continue;

    if (plan.unlinkable === "future") result.futures += 1;
    if (plan.unlinkable === "unknown_teams") result.unresolved += 1;
    if (plan.linkEventId || plan.subjects.length > 0) result.legsRepaired += 1;

    if (plan.linkEventId) {
      await linkBetLegEvent(supabase, userId, plan.legId, plan.linkEventId, "auto");
      result.eventsLinked += 1;
    }

    for (const subject of plan.subjects) {
      let participantId = subject.participantId;
      if (!participantId && !subject.teamId && subject.createParticipantNamed) {
        participantId = (
          await ensureParticipant(supabase, userId, {
            name: subject.createParticipantNamed,
            sport: plan.sport,
            league: plan.league,
          })
        ).id;
      }
      if (!participantId && !subject.teamId) continue;

      await setBetLegSubject(supabase, userId, {
        betLegId: plan.legId,
        teamId: subject.teamId,
        participantId,
        proposedDirection: subject.direction,
        matchMethod: "auto",
      });
      result.subjectsWritten += 1;
    }
  }

  return result;
}

interface LegRow {
  id: string;
  sport: string;
  league: string | null;
  raw_description: string | null;
}

/**
 * Every leg that could be repaired, with the Event-link and Subject state the
 * plan needs. Three queries regardless of leg count — the per-leg decision is
 * made in memory so a healthy data set costs no writes.
 */
export async function loadRepairableLegs(
  supabase: SupabaseClient,
  userId: string,
): Promise<StoredLeg[]> {
  const { data: legRows, error: legError } = await supabase
    .from("bet_legs")
    .select("id,sport,league,raw_description")
    .eq("user_id", userId);
  if (legError) throw legError;

  const legs = ((legRows ?? []) as LegRow[]).filter((l) => l.raw_description);
  if (legs.length === 0) return [];

  const legIds = legs.map((l) => l.id);

  const [{ data: linkRows, error: linkError }, { data: subjectRows, error: subjectError }] =
    await Promise.all([
      supabase.from("bet_leg_events").select("bet_leg_id").eq("user_id", userId).in("bet_leg_id", legIds),
      supabase
        .from("bet_leg_subjects")
        .select("bet_leg_id,team_id,participant_id,direction,direction_source")
        .eq("user_id", userId)
        .in("bet_leg_id", legIds),
    ]);
  if (linkError) throw linkError;
  if (subjectError) throw subjectError;

  const linked = new Set(((linkRows ?? []) as { bet_leg_id: string }[]).map((r) => r.bet_leg_id));

  const subjectsByLeg = new Map<string, StoredSubject[]>();
  for (const row of (subjectRows ?? []) as {
    bet_leg_id: string;
    team_id: string | null;
    participant_id: string | null;
    direction: RootingDirection;
    direction_source: "auto" | "manual";
  }[]) {
    const list = subjectsByLeg.get(row.bet_leg_id) ?? [];
    list.push({
      teamId: row.team_id,
      participantId: row.participant_id,
      direction: row.direction,
      directionSource: row.direction_source,
    });
    subjectsByLeg.set(row.bet_leg_id, list);
  }

  return legs.map((l) => ({
    id: l.id,
    sport: l.sport,
    league: l.league,
    rawDescription: l.raw_description,
    hasEventLink: linked.has(l.id),
    subjects: subjectsByLeg.get(l.id) ?? [],
  }));
}
