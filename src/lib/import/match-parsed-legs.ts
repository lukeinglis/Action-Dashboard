// Participant/Event matching and subject/direction proposal for a parsed
// leg (docs/PRD.md section 30: "Participant Matching", "Event Matching",
// "Subject and Direction Proposal"). Pure functions — callers fetch the
// candidate Teams/Participants/Events once and pass them in; nothing here
// touches the database, so unmatched legs/subjects are simply flagged for
// the review screen rather than silently created.

import { buildEventMatchKey, normalizeEventName } from "@/lib/events/match-key";
import { defaultSubjectDirection, marketCategory } from "@/lib/betting/subjects";
import type { RootingDirection } from "@/lib/types/domain";
import type { ParsedLeg } from "./parse-slip-text";

export interface TeamCandidate {
  id: string;
  sport: string;
  name: string;
  abbreviation?: string | null;
}

export interface ParticipantCandidate {
  id: string;
  sport: string;
  name: string;
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

export interface MatchCandidates {
  teams: TeamCandidate[];
  participants: ParticipantCandidate[];
  events: EventCandidate[];
}

export interface SubjectProposal {
  name: string;
  teamId?: string;
  participantId?: string;
  matched: boolean;
  direction: RootingDirection;
}

export interface LegMatch {
  /** True when the leg named two teams (a single-game leg), false for futures/cross-game matchups. */
  eventExpected: boolean;
  eventId?: string;
  eventMatched: boolean;
  subjects: SubjectProposal[];
}

function findTeam(name: string, sport: string, teams: TeamCandidate[]): TeamCandidate | undefined {
  const norm = normalizeEventName(name);
  return teams.find(
    (t) =>
      t.sport === sport &&
      (normalizeEventName(t.name) === norm || (t.abbreviation && normalizeEventName(t.abbreviation) === norm)),
  );
}

function findParticipant(
  name: string,
  sport: string,
  participants: ParticipantCandidate[],
): ParticipantCandidate | undefined {
  const norm = normalizeEventName(name);
  return participants.find((p) => p.sport === sport && normalizeEventName(p.name) === norm);
}

function sameName(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return normalizeEventName(a) === normalizeEventName(b);
}

export function matchParsedLeg(leg: ParsedLeg, candidates: MatchCandidates, timeZone: string): LegMatch {
  const category = marketCategory(leg.marketType);
  const eventExpected = Boolean(leg.awayTeamName && leg.homeTeamName);

  let eventId: string | undefined;
  if (eventExpected) {
    const awayTeam = findTeam(leg.awayTeamName!, leg.sport, candidates.teams);
    const homeTeam = findTeam(leg.homeTeamName!, leg.sport, candidates.teams);
    if (awayTeam && homeTeam) {
      const matchKey = buildEventMatchKey(
        {
          sport: leg.sport,
          league: leg.league,
          name: `${leg.awayTeamName} @ ${leg.homeTeamName}`,
          startTimeUtc: leg.startTimeUtc,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
        },
        timeZone,
      );
      if (matchKey) {
        eventId = candidates.events.find(
          (e) =>
            buildEventMatchKey(
              {
                sport: e.sport,
                league: e.league,
                name: e.name,
                startTimeUtc: e.startTimeUtc,
                homeTeamId: e.homeTeamId,
                awayTeamId: e.awayTeamId,
              },
              timeZone,
            ) === matchKey,
        )?.id;
      }
    }
  }

  const subjects: SubjectProposal[] = [];
  function propose(name: string | undefined, role: "primary" | "opponent") {
    if (!name) return;
    const team = findTeam(name, leg.sport, candidates.teams);
    const participant = team ? undefined : findParticipant(name, leg.sport, candidates.participants);
    subjects.push({
      name,
      teamId: team?.id,
      participantId: participant?.id,
      matched: Boolean(team || participant),
      direction: defaultSubjectDirection(leg.marketType, role, leg.overUnder),
    });
  }

  switch (category) {
    case "game_total":
      propose(leg.awayTeamName, "primary");
      propose(leg.homeTeamName, "primary");
      break;
    case "team_vs_opponent": {
      const primaryName = leg.subject ?? leg.selection;
      propose(primaryName, "primary");
      const opponentName = [leg.awayTeamName, leg.homeTeamName].find(
        (n) => n && !sameName(n, primaryName),
      );
      propose(opponentName, "opponent");
      break;
    }
    case "matchup": {
      const primaryName = leg.subject ?? leg.selection;
      propose(primaryName, "primary");
      const opponentName =
        leg.opponentSubject ?? [leg.awayTeamName, leg.homeTeamName].find((n) => n && !sameName(n, primaryName));
      propose(opponentName, "opponent");
      break;
    }
    case "team_total":
    case "player_over_under":
      propose(leg.subject, "primary");
      break;
    case "selection_only":
      propose(leg.subject ?? leg.selection, "primary");
      break;
    case "neutral":
    default:
      break;
  }

  return { eventExpected, eventId, eventMatched: Boolean(eventId), subjects };
}
