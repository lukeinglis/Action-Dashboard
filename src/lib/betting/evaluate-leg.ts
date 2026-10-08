// Turns a live Event score into "is this leg winning or losing". See
// docs/PRD.md §26.1 (live leg state) and §27 (settlement).
//
// §22 gives the user one button that pulls provider data, but refreshing a
// scoreline is only half of what they asked for: what they want to know is
// whether their *ticket* is winning. Nothing computed that, so a refresh moved
// the numbers on an Event and left every leg reading "unknown".
//
// One signed margin drives both answers. The margin is positive when the bet is
// ahead, negative when behind, and exactly zero when it sits on the number:
//
//   moneyline    backed - opponent
//   spread       backed + line - opponent      (line is the backed side's handicap)
//   game_total   (home + away) - line          negated for Under
//   team_total   team - line                   negated for Under
//
// Mid-game that sign is the live state; at final it is the settlement. Deriving
// them from one number is what guarantees the chip a user watched all game
// agrees with the result they are paid on.
//
// Over vs Under is read from the subject's rooting *direction*, not re-parsed
// from the selection text. §26.2 stores "for" for Over and "against" for Under,
// and lets the user correct it by hand — so a direction the user fixed flows
// into the live state instead of being overridden by a second guess at the
// wording.

import type {
  EventStatus,
  LegSettlement,
  LiveLegState,
  RootingDirection,
} from "@/lib/types/domain";
import { marketCategory } from "./subjects";

export interface EvaluationSubject {
  teamId?: string | null;
  direction: RootingDirection;
}

export interface EvaluationEvent {
  status: EventStatus | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeScore: number | null;
  awayScore: number | null;
}

export interface EvaluationLeg {
  marketType: string;
  line?: number | null;
}

export interface LegEvaluation {
  liveState: LiveLegState;
  /** "open" until the Event is final; never invents a settled result. */
  settlement: LegSettlement;
  /** Short human phrase for the leg row, e.g. "covering by 3.5". */
  detail: string | null;
}

/** Nothing can be said yet: no score, no market we model, or no linked Event. */
const UNKNOWN: LegEvaluation = { liveState: "unknown", settlement: "open", detail: null };

/**
 * A leg's live state and settlement from the Event it is linked to.
 *
 * Returns UNKNOWN rather than guessing whenever the inputs cannot support an
 * answer — an unmodelled market, a missing score, a leg whose backed team is
 * not in the Event. §45 makes the automatic value only ever a *proposal* that a
 * manual value outranks, so a wrong automatic state is worse than none: it
 * would show a user a losing chip on a bet that is winning.
 */
export function evaluateLeg(
  leg: EvaluationLeg,
  subjects: EvaluationSubject[],
  event: EvaluationEvent | null,
): LegEvaluation {
  if (!event) return UNKNOWN;

  // A game that never happened settles no bet. The book voids these, but that
  // is the book's call and not something a scoreboard proves, so it is left to
  // the user rather than asserted here.
  if (event.status === "cancelled" || event.status === "postponed") return UNKNOWN;

  // Scores are suppressed before kickoff (the provider reports 0-0 for a
  // scheduled game), so absent scores mean "not started", not "0-0".
  if (event.homeScore == null || event.awayScore == null) return UNKNOWN;

  const margin = marginFor(leg, subjects, event);
  if (margin == null) return UNKNOWN;

  const final = event.status === "final";

  return {
    liveState: liveStateFor(margin.value),
    settlement: final ? settlementFor(margin.value) : "open",
    detail: margin.detail,
  };
}

interface Margin {
  /** >0 bet ahead, <0 behind, 0 exactly on the number. */
  value: number;
  detail: string;
}

function marginFor(
  leg: EvaluationLeg,
  subjects: EvaluationSubject[],
  event: EvaluationEvent,
): Margin | null {
  const home = event.homeScore!;
  const away = event.awayScore!;

  switch (marketCategory(leg.marketType)) {
    case "team_vs_opponent": {
      // The side the user is rooting for, which for a spread is also the side
      // the line applies to.
      const backed = scoreForBackedTeam(subjects, event);
      if (backed == null) return null;

      const line = leg.line ?? 0;
      const value = backed.score + line - backed.opponentScore;
      const raw = backed.score - backed.opponentScore;

      if (leg.line == null) {
        // Moneyline: the scoreline itself is the whole story.
        return { value, detail: raw > 0 ? `ahead by ${raw}` : raw < 0 ? `behind by ${-raw}` : "tied" };
      }
      return {
        value,
        detail:
          value > 0
            ? `covering by ${value}`
            : value < 0
              ? `short by ${-value}`
              : "on the number",
      };
    }

    case "game_total": {
      if (leg.line == null) return null;
      const over = isOver(subjects);
      if (over == null) return null;
      const total = home + away;
      const value = over ? total - leg.line : leg.line - total;
      return { value, detail: `${total} of ${leg.line}` };
    }

    case "team_total": {
      if (leg.line == null) return null;
      const over = isOver(subjects);
      if (over == null) return null;
      // Not scoreForBackedTeam: on a team total the direction already means
      // Over/Under, so it cannot also mean "which side". An "Under 20.5" leg
      // carries direction "against" on the very team whose score is needed.
      const score = teamScore(subjects, event);
      if (score == null) return null;
      const value = over ? score - leg.line : leg.line - score;
      return { value, detail: `${score} of ${leg.line}` };
    }

    // Player props need per-player stats, not a scoreline; futures and
    // head-to-head matchups need standings or a second subject's result.
    // Honest silence until those arrive.
    default:
      return null;
  }
}

/**
 * The score of the team the user is rooting for, plus its opponent's.
 *
 * Reads the "for" subject and requires it to be one of the Event's two teams —
 * a leg mis-linked to the wrong game produces no state rather than a confident
 * wrong one.
 */
function scoreForBackedTeam(
  subjects: EvaluationSubject[],
  event: EvaluationEvent,
): { score: number; opponentScore: number } | null {
  const backedTeamId = subjects.find((s) => s.direction === "for" && s.teamId)?.teamId;
  if (!backedTeamId) return null;

  if (backedTeamId === event.homeTeamId) {
    return { score: event.homeScore!, opponentScore: event.awayScore! };
  }
  if (backedTeamId === event.awayTeamId) {
    return { score: event.awayScore!, opponentScore: event.homeScore! };
  }
  return null;
}

/**
 * The score of whichever of the Event's teams a subject names, ignoring
 * direction. Used by team totals, where direction carries the Over/Under and
 * so cannot also pick a side.
 */
function teamScore(subjects: EvaluationSubject[], event: EvaluationEvent): number | null {
  for (const { teamId } of subjects) {
    if (teamId && teamId === event.homeTeamId) return event.homeScore!;
    if (teamId && teamId === event.awayTeamId) return event.awayScore!;
  }
  return null;
}

/**
 * Over or Under, from the stored rooting direction (§26.2 maps Over/Yes to
 * "for" and Under/No to "against"). Null when every subject is neutral, which
 * is what an unparsed leg looks like.
 */
function isOver(subjects: EvaluationSubject[]): boolean | null {
  if (subjects.some((s) => s.direction === "for")) return true;
  if (subjects.some((s) => s.direction === "against")) return false;
  return null;
}

function liveStateFor(margin: number): LiveLegState {
  if (margin > 0) return "winning";
  if (margin < 0) return "losing";
  return "even";
}

function settlementFor(margin: number): LegSettlement {
  if (margin > 0) return "won";
  if (margin < 0) return "lost";
  // Landing exactly on the number refunds the stake.
  return "push";
}
