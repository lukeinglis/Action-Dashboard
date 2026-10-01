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
//   - a Phase 4 docs/PRD.md section 17 MIXED rooting scenario: a player
//     (Egbuka) with one open "for" leg and one open "against" leg, both
//     linked to the live Comets @ Miners Event (ticket-h)

import type {
  BetLeg,
  BetLegEvent,
  BetLegSubject,
  DFSEntry,
  DFSLineup,
  DFSLineupSlot,
  Event,
  FantasyLeague,
  FantasyMatchup,
  FantasyRosterSlot,
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
  participant("participant-egbuka", "D. Egbuka", "team-comets"),
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
  automaticChangedAt?: string;
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
    automaticChangedAt: input.automaticChangedAt ?? T0,
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
    // Went final ~3 hours after kickoff, same day -- used by the Phase 4
    // Schedule Rail "went final today" eligibility rule.
    automaticChangedAt: "2026-09-20T20:00:00.000Z",
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
  // ticket-h: two open legs on the same live-linked player, one "for" one
  // "against" -> MIXED rooting context (docs/PRD.md section 17).
  leg({
    id: "leg-h1",
    ticketId: "ticket-h",
    marketType: "player_over_under",
    selection: "D. Egbuka Over 5.5 Receptions",
    line: 5.5,
    oddsAmerican: -120,
    automaticStatus: null,
  }),
  leg({
    id: "leg-h2",
    ticketId: "ticket-h",
    marketType: "player_over_under",
    selection: "D. Egbuka Under 65.5 Receiving Yards",
    line: 65.5,
    oddsAmerican: -110,
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
  { id: "bev-h1", userId: USER_ID, betLegId: "leg-h1", eventId: "event-comets-miners", matchMethod: "auto", createdAt: T0 },
  { id: "bev-h2", userId: USER_ID, betLegId: "leg-h2", eventId: "event-comets-miners", matchMethod: "auto", createdAt: T0 },
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

  // player_over_under (Over then Under on the same player, both open): for
  // then against -> MIXED (docs/PRD.md section 17).
  subject({ id: "subj-h1-egbuka", betLegId: "leg-h1", participantId: "participant-egbuka", direction: "for", directionSource: "auto" }),
  subject({ id: "subj-h2-egbuka", betLegId: "leg-h2", participantId: "participant-egbuka", direction: "against", directionSource: "auto" }),
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
  ticket({ id: "ticket-h", name: "Egbuka Over/Under Hedge", sortKey: "h", stakeCents: 2000, toWinCents: 1800, totalReturnCents: 3800 }),
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
  "ticket-h": "active",
};

// Phase 3 slice (docs/PRD.md section 64.1): DraftKings "Bet Slip" text for
// the fixture's existing Teams/Events, standing in for real screenshots —
// none were available (see docs/phase-2.md, "Fixture"), and the screenshot
// pipeline transcribes into this same text format before parsing, so pasted
// text exercises the identical downstream code path.

/** A single straight bet matching the existing Hawks @ Wolves Event and both Teams. */
export const importSlipTextSingleTicket = `Bet Slip #DK-9001
Type: Straight
Leg 1:
Market: moneyline
Selection: Northfield Hawks
Event: Northfield Hawks @ Sabertown Wolves
Sport: football/NFL
Start: 2026-09-20T17:00:00Z
Odds: -150
Wager: $20.00
To Win: $13.33
Payout: $33.33
Placed: 2026-09-19T12:00:00Z`;

/** A 3-leg parlay spanning moneyline, game_total, and a player prop, all matching existing fixture data. */
export const importSlipTextParlay = `Bet Slip #DK-9002
Type: 3-Leg Parlay
Leg 1:
Market: moneyline
Selection: Sabertown Wolves
Event: Northfield Hawks @ Sabertown Wolves
Sport: football/NFL
Start: 2026-09-20T17:00:00Z
Odds: -110
Leg 2:
Market: game_total
Selection: Over 47.5
OverUnder: over
Event: Crestview Comets @ Milltown Miners
Sport: football/NFL
Start: 2026-09-20T17:00:00Z
Odds: -110
Leg 3:
Market: passing_yards
Selection: T. Sparks Over 250.5
Subject: T. Sparks
OverUnder: over
Sport: football/NFL
Odds: -120
Wager: $10.00
To Win: $60.00
Payout: $70.00
Placed: 2026-09-19T12:05:00Z`;

/** A leg naming teams that don't exist as fixture Teams — exercises "unmatched Event, flagged". */
export const importSlipTextUnmatchedEvent = `Bet Slip #DK-9003
Type: Straight
Leg 1:
Market: moneyline
Selection: Some Other Team
Event: Some Other Team @ Another Team
Sport: football/NFL
Odds: +120
Wager: $5.00
To Win: $6.00
Payout: $11.00`;

/** Structurally broken text — no "Bet Slip" header — exercises the parse-failure path. */
export const importSlipTextMalformed = `Just some random pasted text that isn't a slip at all.`;

/** Three independent tickets pasted (or transcribed from one screenshot) together, standing in for "one screenshot with 3 Tickets" (docs/PRD.md section 64.1). */
export const importSlipTextThreeTickets = `Bet Slip #DK-9004
Type: Straight
Leg 1:
Market: moneyline
Selection: Northfield Hawks
Event: Northfield Hawks @ Sabertown Wolves
Sport: football/NFL
Start: 2026-09-20T17:00:00Z
Odds: -150
Wager: $20.00
To Win: $13.33
Payout: $33.33
Placed: 2026-09-19T12:00:00Z
Bet Slip #DK-9005
Type: Straight
Leg 1:
Market: game_total
Selection: Over 47.5
OverUnder: over
Event: Crestview Comets @ Milltown Miners
Sport: football/NFL
Start: 2026-09-20T17:00:00Z
Odds: -110
Wager: $15.00
To Win: $13.64
Payout: $28.64
Placed: 2026-09-19T12:02:00Z
Bet Slip #DK-9006
Type: Straight
Leg 1:
Market: season_future
Selection: Sharks to win division
Subject: Bayport Sharks
Sport: football/NFL
Odds: +450
Wager: $10.00
To Win: $45.00
Payout: $55.00
Placed: 2026-09-19T12:03:00Z`;

// Phase 5 slice (docs/PRD.md section 64.1): fantasy matchups, a DFS lineup
// used in 3 entries, and the fantasy-matchup / DFS-lineup "screenshot" text
// (pasted text standing in for a transcribed screenshot, same rationale as
// the Phase 3 importSlipText* fixtures above). Reuses this file's existing
// Teams/Participants/Events so Fantasy/DFS exposure and rooting combine
// with the betting fixture above (docs/PRD.md section 17: Mixed Rooting
// Context spans all three domains).
//
// Exercises:
//   - one FantasyLeague with two FantasyMatchups: fantasy-matchup-1 has a
//     still-live linked Event (not all linked Events final -> no Mark
//     Final prompt); fantasy-matchup-2's only linked Event is already
//     final (all linked Events final -> Mark Final prompt appears).
//   - one DFSLineup (dfs-lineup-1) used in 3 DFSEntries with different
//     statuses (upcoming, live, final) -> the lineup's exposure counts
//     once per linked Event regardless of entry count, and a still-live
//     linked Event means none of its entries show Mark Final.
//   - a second DFSLineup (dfs-lineup-2) with a single entry whose only
//     linked Event is already final -> Mark Final prompt appears.

function fantasyLeague(input: {
  id: string;
  name: string;
  platform?: string | null;
  season: string;
  userTeamName?: string | null;
}): FantasyLeague {
  return {
    id: input.id,
    userId: USER_ID,
    name: input.name,
    platform: input.platform ?? null,
    sport: "football",
    season: input.season,
    userTeamName: input.userTeamName ?? null,
    createdAt: T0,
    updatedAt: T0,
  };
}

export const fantasyLeagues: FantasyLeague[] = [
  fantasyLeague({ id: "fantasy-league-1", name: "Friends League", platform: "ESPN", season: "2026", userTeamName: "Dynasty Crew" }),
];

function fantasyMatchup(input: {
  id: string;
  fantasyLeagueId: string;
  week?: number | null;
  userTeamName: string;
  opponentTeamName: string;
  sortKey: string;
}): FantasyMatchup {
  return {
    id: input.id,
    userId: USER_ID,
    fantasyLeagueId: input.fantasyLeagueId,
    week: input.week ?? null,
    userTeamName: input.userTeamName,
    opponentTeamName: input.opponentTeamName,
    automaticUserScore: null,
    automaticOpponentScore: null,
    manualUserScore: null,
    manualOpponentScore: null,
    userProjectedScore: null,
    opponentProjectedScore: null,
    automaticChangedAt: null,
    manualSetAt: null,
    status: "upcoming",
    finalizedAt: null,
    sortKey: input.sortKey,
    importRecordId: null,
    createdAt: T0,
    updatedAt: T0,
  };
}

export const fantasyMatchups: FantasyMatchup[] = [
  // Starters link to both the final Hawks @ Wolves Event and the still-live
  // Comets @ Miners Event -> not every linked Event is final yet.
  fantasyMatchup({
    id: "fantasy-matchup-1",
    fantasyLeagueId: "fantasy-league-1",
    week: 3,
    userTeamName: "Dynasty Crew",
    opponentTeamName: "Rival Squad",
    sortKey: "a",
  }),
  // Both sides' only linked Event (Hawks @ Wolves) is already final.
  fantasyMatchup({
    id: "fantasy-matchup-2",
    fantasyLeagueId: "fantasy-league-1",
    week: 2,
    userTeamName: "Dynasty Crew",
    opponentTeamName: "Early Finishers",
    sortKey: "b",
  }),
];

function fantasyRosterSlot(input: {
  id: string;
  fantasyMatchupId: string;
  side: FantasyRosterSlot["side"];
  slot: string;
  participantId: string;
  playerName: string;
  eventId?: string | null;
}): FantasyRosterSlot {
  return {
    id: input.id,
    userId: USER_ID,
    fantasyMatchupId: input.fantasyMatchupId,
    side: input.side,
    slot: input.slot,
    participantId: input.participantId,
    participantMatchMethod: "auto",
    playerName: input.playerName,
    projectedPoints: null,
    automaticActualPoints: null,
    manualActualPoints: null,
    automaticChangedAt: null,
    manualSetAt: null,
    eventId: input.eventId ?? null,
    eventMatchMethod: input.eventId ? "auto" : null,
    createdAt: T0,
    updatedAt: T0,
  };
}

export const fantasyRosterSlots: FantasyRosterSlot[] = [
  // fantasy-matchup-1: user side has one starter on each of the final and
  // the still-live Event.
  fantasyRosterSlot({
    id: "frs-1-sparks",
    fantasyMatchupId: "fantasy-matchup-1",
    side: "user",
    slot: "QB",
    participantId: "participant-sparks",
    playerName: "T. Sparks",
    eventId: "event-hawks-wolves",
  }),
  fantasyRosterSlot({
    id: "frs-1-egbuka",
    fantasyMatchupId: "fantasy-matchup-1",
    side: "user",
    slot: "WR",
    participantId: "participant-egbuka",
    playerName: "D. Egbuka",
    eventId: "event-comets-miners",
  }),
  fantasyRosterSlot({
    id: "frs-1-reyes",
    fantasyMatchupId: "fantasy-matchup-1",
    side: "opponent",
    slot: "RB",
    participantId: "participant-reyes",
    playerName: "M. Reyes",
    eventId: "event-hawks-wolves",
  }),
  // fantasy-matchup-2: both sides' only linked Event is already final.
  fantasyRosterSlot({
    id: "frs-2-sparks",
    fantasyMatchupId: "fantasy-matchup-2",
    side: "user",
    slot: "QB",
    participantId: "participant-sparks",
    playerName: "T. Sparks",
    eventId: "event-hawks-wolves",
  }),
  fantasyRosterSlot({
    id: "frs-2-reyes",
    fantasyMatchupId: "fantasy-matchup-2",
    side: "opponent",
    slot: "RB",
    participantId: "participant-reyes",
    playerName: "M. Reyes",
    eventId: "event-hawks-wolves",
  }),
];

function dfsLineup(input: { id: string; platform: string; slateName?: string | null }): DFSLineup {
  return {
    id: input.id,
    userId: USER_ID,
    platform: input.platform,
    sport: "football",
    slateName: input.slateName ?? null,
    importRecordId: null,
    createdAt: T0,
    updatedAt: T0,
  };
}

export const dfsLineups: DFSLineup[] = [
  dfsLineup({ id: "dfs-lineup-1", platform: "DraftKings", slateName: "Sunday Main" }),
  dfsLineup({ id: "dfs-lineup-2", platform: "FanDuel", slateName: "Showdown" }),
];

function dfsLineupSlot(input: {
  id: string;
  dfsLineupId: string;
  slot: string;
  participantId: string;
  playerName: string;
  salary?: number | null;
  eventId?: string | null;
}): DFSLineupSlot {
  return {
    id: input.id,
    userId: USER_ID,
    dfsLineupId: input.dfsLineupId,
    slot: input.slot,
    participantId: input.participantId,
    participantMatchMethod: "auto",
    playerName: input.playerName,
    salary: input.salary ?? null,
    automaticActualPoints: null,
    manualActualPoints: null,
    automaticChangedAt: null,
    manualSetAt: null,
    eventId: input.eventId ?? null,
    eventMatchMethod: input.eventId ? "auto" : null,
    createdAt: T0,
    updatedAt: T0,
  };
}

export const dfsLineupSlots: DFSLineupSlot[] = [
  // dfs-lineup-1: one slot on the still-live Comets @ Miners Event, so none
  // of this lineup's entries have every linked Event final yet.
  dfsLineupSlot({
    id: "dls-1-sparks",
    dfsLineupId: "dfs-lineup-1",
    slot: "QB",
    participantId: "participant-sparks",
    playerName: "T. Sparks",
    salary: 7500,
    eventId: "event-hawks-wolves",
  }),
  dfsLineupSlot({
    id: "dls-1-egbuka",
    dfsLineupId: "dfs-lineup-1",
    slot: "WR",
    participantId: "participant-egbuka",
    playerName: "D. Egbuka",
    salary: 6200,
    eventId: "event-comets-miners",
  }),
  dfsLineupSlot({
    id: "dls-1-reyes",
    dfsLineupId: "dfs-lineup-1",
    slot: "FLEX",
    participantId: "participant-reyes",
    playerName: "M. Reyes",
    salary: 5400,
    eventId: "event-hawks-wolves",
  }),
  // dfs-lineup-2: single slot, only linked Event is already final.
  dfsLineupSlot({
    id: "dls-2-reyes",
    dfsLineupId: "dfs-lineup-2",
    slot: "QB",
    participantId: "participant-reyes",
    playerName: "M. Reyes",
    salary: 8200,
    eventId: "event-hawks-wolves",
  }),
];

function dfsEntry(input: {
  id: string;
  dfsLineupId: string;
  contestName?: string | null;
  status: DFSEntry["status"];
  finalizedAt?: string | null;
  sortKey: string;
}): DFSEntry {
  return {
    id: input.id,
    userId: USER_ID,
    dfsLineupId: input.dfsLineupId,
    contestName: input.contestName ?? null,
    entryFeeCents: 2000,
    potentialPrizeCents: 50000,
    automaticCurrentPoints: null,
    manualCurrentPoints: null,
    automaticChangedAt: null,
    manualSetAt: null,
    status: input.status,
    finalizedAt: input.finalizedAt ?? null,
    sortKey: input.sortKey,
    createdAt: T0,
    updatedAt: T0,
  };
}

export const dfsEntries: DFSEntry[] = [
  // dfs-lineup-1 used in 3 entries (docs/PRD.md section 64.1) -- exposure
  // must count the lineup's slots once per Event, not three times.
  dfsEntry({ id: "dfs-entry-1", dfsLineupId: "dfs-lineup-1", contestName: "Main Slate GPP", status: "upcoming", sortKey: "a" }),
  dfsEntry({ id: "dfs-entry-2", dfsLineupId: "dfs-lineup-1", contestName: "Double Up", status: "live", sortKey: "b" }),
  dfsEntry({
    id: "dfs-entry-3",
    dfsLineupId: "dfs-lineup-1",
    contestName: "Satellite",
    status: "final",
    finalizedAt: "2026-09-18T00:00:00.000Z",
    sortKey: "c",
  }),
  // dfs-lineup-2: a single entry whose lineup's only linked Event is final.
  dfsEntry({ id: "dfs-entry-4", dfsLineupId: "dfs-lineup-2", contestName: "Showdown GPP", status: "upcoming", sortKey: "d" }),
];

/** "Fantasy Matchup" screenshot/paste text (docs/PRD.md section 64.1) matching fantasy-matchup-1 above. */
export const importFantasyMatchupText = `Fantasy Matchup
League: Friends League
Platform: ESPN
Sport: football/NFL
Season: 2026
Week: 3
My Team: Dynasty Crew
Opponent: Rival Squad
Starter: T. Sparks
Starter: D. Egbuka
Opponent Starter: M. Reyes`;

/** "DFS Lineup" screenshot/paste text (docs/PRD.md section 64.1) matching dfs-lineup-1 above. */
export const importDfsLineupText = `DFS Lineup
Platform: DraftKings
Sport: football/NFL
Slate: Sunday Main
Slot: QB
Player: T. Sparks
Salary: 7500
Slot: WR
Player: D. Egbuka
Salary: 6200
Slot: FLEX
Player: M. Reyes
Salary: 5400
Contest: Main Slate GPP
Entry Fee: $20.00
Prize: $500.00`;
