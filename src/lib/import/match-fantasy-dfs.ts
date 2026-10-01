// Participant/Event matching for Fantasy roster slots and DFS lineup
// slots (docs/PRD.md section 30: "Participant Matching", "Event
// Matching"). Pure — callers fetch the candidate Participants/Events once
// and pass them in; nothing here touches the database, so an unmatched
// player is simply flagged for the review screen rather than silently
// created (same pattern as match-parsed-legs.ts for bet legs).
//
// Unlike a bet leg, the text format names only the player, not their
// opponent team — so once a player is matched to a Participant, their
// Event is found via the Participant's Team among the candidate Events
// (docs/PRD.md section 18: Team is shared across domains).

import { normalizeEventName } from "@/lib/events/match-key";

export interface PlayerParticipantCandidate {
  id: string;
  sport: string;
  name: string;
  teamId?: string | null;
}

export interface PlayerEventCandidate {
  id: string;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
}

export interface PlayerSlotCandidates {
  participants: PlayerParticipantCandidate[];
  events: PlayerEventCandidate[];
}

export interface PlayerMatch {
  participantId?: string;
  participantMatched: boolean;
  eventId?: string;
  eventMatched: boolean;
}

/** Matches one player name (a fantasy starter or DFS lineup slot) to a Participant and, through their Team, an Event. */
export function matchPlayerToParticipantAndEvent(
  playerName: string,
  sport: string,
  candidates: PlayerSlotCandidates,
): PlayerMatch {
  const norm = normalizeEventName(playerName);
  const participant = candidates.participants.find(
    (p) => p.sport === sport && normalizeEventName(p.name) === norm,
  );
  if (!participant) {
    return { participantMatched: false, eventMatched: false };
  }

  let eventId: string | undefined;
  if (participant.teamId) {
    eventId = candidates.events.find(
      (e) => e.homeTeamId === participant.teamId || e.awayTeamId === participant.teamId,
    )?.id;
  }

  return {
    participantId: participant.id,
    participantMatched: true,
    eventId,
    eventMatched: Boolean(eventId),
  };
}
