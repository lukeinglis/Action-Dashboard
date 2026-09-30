// Synthetic "NFL Week 3" fixture for Phase 2 exit-criteria tests.
//
// Placeholder data: the PRD (docs/PRD.md section 64.1) originally called for
// a fixture built from real Week 3 screenshots, but none were available
// while building Phase 2, so this fixture is hand-authored instead. See
// docs/phase-2.md for that decision.
//
// Exercises:
//   - every docs/PRD.md section 26.2 default-subject/direction market
//     category (team_vs_opponent, game_total, team_total, player_over_under,
//     selection_only, matchup, neutral/custom)
//   - a leg linked to two Events (ticket-g / leg-g1)
//   - a leg with no linked Event, i.e. a season-long future (leg-e2, leg-f1)
//   - a manually-set subject direction that must survive re-matching
//     (subj-b1-hawks, overridden from the "against" default to "neutral")
//   - every docs/PRD.md section 27 derived-status branch (lost, void, won,
//     active via a settled leg, active via a live linked Event, pending)

import type {
  BetLeg,
  BetLegEvent,
  BetLegSubject,
  Event,
  Participant,
  Team,
  Ticket,
  TicketStatus,
} from "@/lib/types/domain";

const USER_ID = "fixture-user";
const T0 = "2026-09-17T00:00:00.000Z";

function team(id: string, name: string, abbreviation: string): Team {
  return {
    id,
    userId: USER_ID,
    sport: "football",
    league: "nfl",
    name,
    abbreviation,
    createdAt: T0,
    updatedAt: T0,
  };
}

export const teams: Team[] = [
  team("team-hawks", "Northfield Hawks", "NFH"),
  team("team-wolves", "Sabertown Wolves", "SBW"),
  team("team-comets", "Crestview Comets", "CVC"),
  team("team-miners", "Milltown Miners", "MTM"),
  team("team-sharks", "Bayport Sharks", "BPS"),
  team("team-rams", "Highland Rams", "HLR"),
];

function participant(id: string, name: string, teamId: string): Participant {
  return {
    id,
    userId: USER_ID,
    type: "player",
    sport: "football",
    league: "nfl",
    name,
    teamId,
    createdAt: T0,
    updatedAt: T0,
  };
}

export const participants: Participant[] = [
  participant("participant-sparks", "T. Sparks", "team-hawks"),
  participant("participant-reyes", "M. Reyes", "team-wolves"),
];

function event(input: {
  id: string;
  name: string;
  homeTeamId: string;
  awayTeamId: string;
  startTimeUtc: string;
  automaticStatus: Event["automaticStatus"];
  automaticHomeScore?: number | null;
  automaticAwayScore?: number | null;
}): Event {
  return {
    id: input.id,
    userId: USER_ID,
    sport: "football",
    league: "nfl",
    name: input.name,
    startTimeUtc: input.startTimeUtc,
    startTimeTbd: false,
    endTimeUtc: null,
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    source: "manual",
    automaticStatus: input.automaticStatus,
    automaticHomeScore: input.automaticHomeScore ?? null,
    automaticAwayScore: input.automaticAwayScore ?? null,
    automaticPeriod: null,
    automaticClock: null,
    automaticChangedAt: T0,
    manualStatus: null,
    manualHomeScore: null,
    manualAwayScore: null,
    manualPeriod: null,
    manualClock: null,
    manualSetAt: null,
    isPinned: false,
    notes: null,
    createdAt: T0,
    updatedAt: T0,
  };
}

// Hawks beat Wolves 27-20 (final); Comets @ Miners is still live; Sharks @
// Rams hasn't started.
export const events: Event[] = [
  event({
    id: "event-hawks-wolves",
    name: "Hawks @ Wolves",
    homeTeamId: "team-wolves",
    awayTeamId: "team-hawks",
    startTimeUtc: "2026-09-20T17:00:00.000Z",
    automaticStatus: "final",
    automaticHomeScore: 20,
    automaticAwayScore: 27,
  }),
  event({
    id: "event-comets-miners",
    name: "Comets @ Miners",
    homeTeamId: "team-miners",
    awayTeamId: "team-comets",
    startTimeUtc: "2026-09-20T17:00:00.000Z",
    automaticStatus: "in_progress",
    automaticHomeScore: 10,
    automaticAwayScore: 14,
  }),
  event({
    id: "event-sharks-rams",
    name: "Sharks @ Rams",
    homeTeamId: "team-rams",
    awayTeamId: "team-sharks",
    startTimeUtc: "2026-09-21T20:20:00.000Z",
    automaticStatus: "scheduled",
  }),
];

function leg(input: {
  id: string;
  ticketId: string;
  marketType: string;
  selection?: string | null;
  rawDescription?: string | null;
  line?: number | null;
  oddsAmerican?: number | null;
  automaticStatus: BetLeg["automaticStatus"];
}): BetLeg {
  return {
    id: input.id,
    userId: USER_ID,
    ticketId: input.ticketId,
    sport: "football",
    league: "nfl",
    rawDescription: input.rawDescription ?? null,
    marketType: input.marketType,
    selection: input.selection ?? null,
    line: input.line ?? null,
    oddsAmerican: input.oddsAmerican ?? null,
    automaticStatus: input.automaticStatus,
    manualStatus: null,
    automaticLiveState: null,
    manualLiveState: null,
    liveDetail: null,
    automaticCurrentValue: null,
    manualCurrentValue: null,
    targetValue: null,
    progressUnit: null,
    automaticChangedAt: T0,
    manualSetAt: null,
    notes: null,
    createdAt: T0,
    updatedAt: T0,
  };
}

export const betLegs: BetLeg[] = [
  // ticket-a: moneyline (team_vs_opponent) -> won
  leg({
    id: "leg-a1",
    ticketId: "ticket-a",
    marketType: "moneyline",
    selection: "Hawks ML",
    oddsAmerican: -150,
    automaticStatus: "won",
  }),
  // ticket-b: spread (team_vs_opponent) -> lost
  leg({
    id: "leg-b1",
    ticketId: "ticket-b",
    marketType: "spread",
    selection: "Wolves +6.5",
    line: 6.5,
    oddsAmerican: -110,
    automaticStatus: "lost",
  }),
  // ticket-c: game_total, exact push -> void
  leg({
    id: "leg-c1",
    ticketId: "ticket-c",
    marketType: "game_total",
    selection: "Over 47",
    line: 47,
    oddsAmerican: -110,
    automaticStatus: "push",
  }),
  // ticket-d: team_total, still open, linked to a live Event -> active
  leg({
    id: "leg-d1",
    ticketId: "ticket-d",
    marketType: "team_total",
    selection: "Comets Over 20.5",
    line: 20.5,
    oddsAmerican: -115,
    automaticStatus: null,
  }),
  // ticket-e: player prop (player_over_under, settled) + a no-Event future
  // (selection_only, still open) -> active via the settled leg
  leg({
    id: "leg-e1",
    ticketId: "ticket-e",
    marketType: "passing_yards",
    selection: "T. Sparks Over 250.5",
    line: 250.5,
    oddsAmerican: -120,
    automaticStatus: "won",
  }),
  leg({
    id: "leg-e2",
    ticketId: "ticket-e",
    marketType: "season_future",
    selection: "Sharks to win division",
    oddsAmerican: 450,
    automaticStatus: null,
  }),
  // ticket-f: matchup prop, no linked Event, still open -> pending
  leg({
    id: "leg-f1",
    ticketId: "ticket-f",
    marketType: "matchup",
    selection: "Sparks over Reyes in receiving yards",
    automaticStatus: null,
  }),
  // ticket-g: custom market linked to two Events, one of them live -> active
  leg({
    id: "leg-g1",
    ticketId: "ticket-g",
    marketType: "custom",
    rawDescription: "Combined sacks: Hawks/Wolves + Comets/Miners",
    automaticStatus: null,
  }),
];

export const betLegEvents: BetLegEvent[] = [
  { id: "bev-a1", userId: USER_ID, betLegId: "leg-a1", eventId: "event-hawks-wolves", matchMethod: "auto", createdAt: T0 },
  { id: "bev-b1", userId: USER_ID, betLegId: "leg-b1", eventId: "event-hawks-wolves", matchMethod: "auto", createdAt: T0 },
  { id: "bev-c1", userId: USER_ID, betLegId: "leg-c1", eventId: "event-hawks-wolves", matchMethod: "auto", createdAt: T0 },
  { id: "bev-d1", userId: USER_ID, betLegId: "leg-d1", eventId: "event-comets-miners", matchMethod: "auto", createdAt: T0 },
  { id: "bev-e1", userId: USER_ID, betLegId: "leg-e1", eventId: "event-hawks-wolves", matchMethod: "auto", createdAt: T0 },
  // leg-e2 (season future) and leg-f1 (cross-game matchup) are intentionally
  // unlinked to any Event.
  { id: "bev-g1a", userId: USER_ID, betLegId: "leg-g1", eventId: "event-hawks-wolves", matchMethod: "auto", createdAt: T0 },
  { id: "bev-g1b", userId: USER_ID, betLegId: "leg-g1", eventId: "event-comets-miners", matchMethod: "auto", createdAt: T0 },
];

function subject(input: {
  id: string;
  betLegId: string;
  participantId?: string;
  teamId?: string;
  direction: BetLegSubject["direction"];
  directionSource: BetLegSubject["directionSource"];
  matchMethod?: BetLegSubject["matchMethod"];
}): BetLegSubject {
  return {
    id: input.id,
    userId: USER_ID,
    betLegId: input.betLegId,
    participantId: input.participantId ?? null,
    teamId: input.teamId ?? null,
    direction: input.direction,
    directionSource: input.directionSource,
    matchMethod: input.matchMethod ?? input.directionSource,
    createdAt: T0,
    updatedAt: T0,
  };
}

export const betLegSubjects: BetLegSubject[] = [
  // team_vs_opponent (moneyline): selected team for, opponent against.
  subject({ id: "subj-a1-hawks", betLegId: "leg-a1", teamId: "team-hawks", direction: "for", directionSource: "auto" }),
  subject({ id: "subj-a1-wolves", betLegId: "leg-a1", teamId: "team-wolves", direction: "against", directionSource: "auto" }),

  // team_vs_opponent (spread): same shape, but the opponent subject was
  // manually edited to "neutral" and must survive re-matching -- a fresh
  // "against" proposal (see betting/subjects.ts resolveSubjectDirection)
  // should leave it alone.
  subject({ id: "subj-b1-wolves", betLegId: "leg-b1", teamId: "team-wolves", direction: "for", directionSource: "auto" }),
  subject({
    id: "subj-b1-hawks",
    betLegId: "leg-b1",
    teamId: "team-hawks",
    direction: "neutral",
    directionSource: "manual",
    matchMethod: "auto",
  }),

  // game_total (Over): both teams for.
  subject({ id: "subj-c1-hawks", betLegId: "leg-c1", teamId: "team-hawks", direction: "for", directionSource: "auto" }),
  subject({ id: "subj-c1-wolves", betLegId: "leg-c1", teamId: "team-wolves", direction: "for", directionSource: "auto" }),

  // team_total (Over): the team for.
  subject({ id: "subj-d1-comets", betLegId: "leg-d1", teamId: "team-comets", direction: "for", directionSource: "auto" }),

  // player_over_under (Over): the player for, no team-level subject.
  subject({ id: "subj-e1-sparks", betLegId: "leg-e1", participantId: "participant-sparks", direction: "for", directionSource: "auto" }),

  // selection_only (season_future): the selection for.
  subject({ id: "subj-e2-sharks", betLegId: "leg-e2", teamId: "team-sharks", direction: "for", directionSource: "auto" }),

  // matchup: selection for, opponent against.
  subject({ id: "subj-f1-sparks", betLegId: "leg-f1", participantId: "participant-sparks", direction: "for", directionSource: "auto" }),
  subject({ id: "subj-f1-reyes", betLegId: "leg-f1", participantId: "participant-reyes", direction: "against", directionSource: "auto" }),

  // custom (neutral category): subjects stay neutral until set by hand.
  subject({ id: "subj-g1-hawks", betLegId: "leg-g1", teamId: "team-hawks", direction: "neutral", directionSource: "auto" }),
];

function ticket(input: {
  id: string;
  name: string;
  sortKey: string;
  stakeCents: number;
  toWinCents: number;
  totalReturnCents: number;
}): Ticket {
  return {
    id: input.id,
    userId: USER_ID,
    name: input.name,
    generatedName: null,
    sportsbook: "Placeholder Book",
    sportsbookTicketId: null,
    stakeCents: input.stakeCents,
    toWinCents: input.toWinCents,
    totalReturnCents: input.totalReturnCents,
    actualReturnCents: null,
    isBonusBet: false,
    oddsAmerican: null,
    placedAt: T0,
    notes: null,
    promotionNote: null,
    tags: [],
    manualStatus: null,
    settledAt: null,
    sortKey: input.sortKey,
    importRecordId: null,
    createdAt: T0,
    updatedAt: T0,
  };
}

export const tickets: Ticket[] = [
  ticket({ id: "ticket-a", name: "Moneyline Winner", sortKey: "a", stakeCents: 1000, toWinCents: 667, totalReturnCents: 1667 }),
  ticket({ id: "ticket-b", name: "Bad Beat Spread", sortKey: "b", stakeCents: 1000, toWinCents: 909, totalReturnCents: 1909 }),
  ticket({ id: "ticket-c", name: "Total Push Refund", sortKey: "c", stakeCents: 1000, toWinCents: 909, totalReturnCents: 1909 }),
  ticket({ id: "ticket-d", name: "Live Team Total", sortKey: "d", stakeCents: 1000, toWinCents: 869, totalReturnCents: 1869 }),
  ticket({ id: "ticket-e", name: "Parlay In Progress", sortKey: "e", stakeCents: 1000, toWinCents: 3500, totalReturnCents: 4500 }),
  ticket({ id: "ticket-f", name: "Season Future", sortKey: "f", stakeCents: 500, toWinCents: 2250, totalReturnCents: 2750 }),
  ticket({ id: "ticket-g", name: "Multi-Game Combo", sortKey: "g", stakeCents: 1000, toWinCents: 800, totalReturnCents: 1800 }),
];

/** Expected docs/PRD.md section 27 derived status for each Ticket above, ignoring manualStatus. */
export const expectedTicketStatuses: Record<string, TicketStatus> = {
  "ticket-a": "won",
  "ticket-b": "lost",
  "ticket-c": "void",
  "ticket-d": "active",
  "ticket-e": "active",
  "ticket-f": "pending",
  "ticket-g": "active",
};
