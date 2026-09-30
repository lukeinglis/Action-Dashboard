// Fetches the candidate Teams/Participants/Events and existing Tickets a
// user's import review needs (docs/PRD.md section 30: "Participant
// Matching", "Event Matching"; section 32: "Duplicate Detection"). Thin
// wrappers around Supabase, kept separate from the pure matching logic in
// match-parsed-legs.ts and duplicate-check.ts so those stay unit-testable
// without a database.

import type { SupabaseClient } from "@supabase/supabase-js";
import { toTeam, toParticipant, toEvent, toTicket, type TeamRow, type ParticipantRow, type EventRow, type TicketRow } from "@/lib/db/rows";
import type { MatchCandidates } from "./match-parsed-legs";
import type { DuplicateTicketCandidate } from "./duplicate-check";

export async function fetchMatchCandidates(supabase: SupabaseClient, userId: string): Promise<MatchCandidates> {
  const [teamsRes, participantsRes, eventsRes] = await Promise.all([
    supabase.from("teams").select("*").eq("user_id", userId),
    supabase.from("participants").select("*").eq("user_id", userId),
    supabase.from("events").select("*").eq("user_id", userId),
  ]);
  if (teamsRes.error) throw teamsRes.error;
  if (participantsRes.error) throw participantsRes.error;
  if (eventsRes.error) throw eventsRes.error;

  const teams = ((teamsRes.data ?? []) as TeamRow[]).map(toTeam);
  const participants = ((participantsRes.data ?? []) as ParticipantRow[]).map(toParticipant);
  const events = ((eventsRes.data ?? []) as EventRow[]).map(toEvent);

  return {
    teams: teams.map((t) => ({ id: t.id, sport: t.sport, name: t.name, abbreviation: t.abbreviation })),
    participants: participants.map((p) => ({ id: p.id, sport: p.sport, name: p.name })),
    events: events.map((e) => ({
      id: e.id,
      sport: e.sport,
      league: e.league,
      name: e.name,
      startTimeUtc: e.startTimeUtc,
      homeTeamId: e.homeTeamId,
      awayTeamId: e.awayTeamId,
    })),
  };
}

export async function fetchDuplicateCandidates(
  supabase: SupabaseClient,
  userId: string,
): Promise<DuplicateTicketCandidate[]> {
  const { data, error } = await supabase.from("tickets").select("*").eq("user_id", userId);
  if (error) throw error;

  const tickets = ((data ?? []) as TicketRow[]).map(toTicket);
  return tickets.map((t) => ({
    id: t.id,
    sportsbookTicketId: t.sportsbookTicketId,
    sportsbook: t.sportsbook,
    stakeCents: t.stakeCents,
    toWinCents: t.toWinCents,
    placedAt: t.placedAt,
  }));
}
