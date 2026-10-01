// Phase 5 exit-criteria coverage (docs/PRD.md section 65, "Fantasy and
// DFS") using the nfl-week-3 fixture's Fantasy/DFS data and "screenshot"
// text:
//   - the fixture's fantasy matchups and DFS lineup load and link to
//     Events
//   - the DFS lineup counts once in exposure despite having 3 entries
//   - Mark Final appears only once every linked Event is final, and never
//     changes status automatically
//   - the fixture's fantasy matchup and DFS lineup "screenshots" (pasted
//     text, see nfl-week-3.ts) parse correctly
//   - the parser tells a sportsbook ticket, a DFS lineup, and a fantasy
//     matchup apart, with no partial credit

import { describe, expect, it } from "vitest";
import { allLinkedEventsFinal, fantasyDfsSection } from "@/lib/dashboard/active-fantasy-dfs";
import { dfsExposureCount, dfsRootingSubjects, fantasyExposureCount, fantasyRootingSubjects } from "@/lib/dashboard/exposure";
import { detectImportKind } from "@/lib/import/detect-kind";
import { buildDfsLineupReview, buildFantasyMatchupReview } from "@/lib/import/pipeline";
import type { PlayerSlotCandidates } from "@/lib/import/match-fantasy-dfs";
import {
  dfsEntries,
  dfsLineupSlots,
  events,
  fantasyLeagues,
  fantasyMatchups,
  fantasyRosterSlots,
  importDfsLineupText,
  importFantasyMatchupText,
  importSlipTextSingleTicket,
  participants,
} from "./nfl-week-3";

function linkedEventStatusesForEventIds(eventIds: Array<string | null | undefined>) {
  return eventIds.map((eventId) => (eventId ? events.find((e) => e.id === eventId)?.automaticStatus ?? null : null));
}

describe("nfl-week-3 fixture: Fantasy matchups and DFS lineup load and link to Events", () => {
  it("fantasy-matchup-1's starters and opponent starter are linked to real fixture Events", () => {
    const slots = fantasyRosterSlots.filter((s) => s.fantasyMatchupId === "fantasy-matchup-1");
    expect(slots).toHaveLength(3);
    expect(slots.every((s) => s.eventId && events.some((e) => e.id === s.eventId))).toBe(true);
  });

  it("dfs-lineup-1's slots are linked to real fixture Events", () => {
    const slots = dfsLineupSlots.filter((s) => s.dfsLineupId === "dfs-lineup-1");
    expect(slots).toHaveLength(3);
    expect(slots.every((s) => s.eventId && events.some((e) => e.id === s.eventId))).toBe(true);
  });

  it("both FantasyMatchups belong to the fixture's one FantasyLeague", () => {
    expect(fantasyMatchups.every((m) => m.fantasyLeagueId === fantasyLeagues[0].id)).toBe(true);
  });
});

describe("nfl-week-3 fixture: the DFS lineup counts once in exposure despite having 3 entries", () => {
  it("dfs-lineup-1 is used in exactly 3 DFSEntries", () => {
    expect(dfsEntries.filter((e) => e.dfsLineupId === "dfs-lineup-1")).toHaveLength(3);
  });

  it("counts dfs-lineup-1's slots once per Event, not once per entry", () => {
    // event-hawks-wolves carries two dfs-lineup-1 slots (Sparks, Reyes); if
    // exposure were (wrongly) multiplied by the 3 entries this would be 6.
    const lineup1Slots = dfsLineupSlots.filter((s) => s.dfsLineupId === "dfs-lineup-1");
    const lineup1Entries = dfsEntries.filter((e) => e.dfsLineupId === "dfs-lineup-1");
    expect(dfsExposureCount("event-hawks-wolves", lineup1Slots, lineup1Entries)).toBe(2);
    expect(dfsExposureCount("event-comets-miners", lineup1Slots, lineup1Entries)).toBe(1);
  });

  it("across both DFSLineups, event-hawks-wolves' exposure counts dfs-lineup-2's slot too", () => {
    expect(dfsExposureCount("event-hawks-wolves", dfsLineupSlots, dfsEntries)).toBe(3);
  });

  it("DFS rooting is always 'for', deduplicated by active lineup rather than by entry count", () => {
    const subjects = dfsRootingSubjects(dfsLineupSlots, dfsEntries);
    const sparksSubjects = subjects.filter((s) => s.participantId === "participant-sparks");
    expect(sparksSubjects).toHaveLength(1);
    expect(sparksSubjects[0].direction).toBe("for");
  });

  it("an entry with a 'final' status is excluded from the active-lineup set used for exposure", () => {
    // dfs-entry-3 (final) alone would make dfs-lineup-1 inactive, but
    // dfs-entry-1/2 (upcoming/live) keep it active.
    const onlyFinalEntry = dfsEntries.filter((e) => e.id === "dfs-entry-3");
    expect(dfsExposureCount("event-hawks-wolves", dfsLineupSlots, onlyFinalEntry)).toBe(0);
  });
});

describe("nfl-week-3 fixture: Mark Final appears only once every linked Event is final; status never changes on its own", () => {
  it("fantasy-matchup-1 has a still-live linked Event, so Mark Final does not appear", () => {
    const linkedEventIds = fantasyRosterSlots.filter((s) => s.fantasyMatchupId === "fantasy-matchup-1").map((s) => s.eventId);
    expect(allLinkedEventsFinal(linkedEventStatusesForEventIds(linkedEventIds))).toBe(false);
    const matchup = fantasyMatchups.find((m) => m.id === "fantasy-matchup-1")!;
    expect(matchup.status).toBe("upcoming");
  });

  it("fantasy-matchup-2's only linked Event is already final, so Mark Final appears", () => {
    const linkedEventIds = fantasyRosterSlots.filter((s) => s.fantasyMatchupId === "fantasy-matchup-2").map((s) => s.eventId);
    expect(allLinkedEventsFinal(linkedEventStatusesForEventIds(linkedEventIds))).toBe(true);
    // The prompt condition is true, but the matchup's own status is
    // unchanged -- it only transitions on an explicit Mark Final action.
    const matchup = fantasyMatchups.find((m) => m.id === "fantasy-matchup-2")!;
    expect(matchup.status).toBe("upcoming");
  });

  it("dfs-lineup-1's still-live linked Event means none of its 3 entries show Mark Final", () => {
    const linkedEventIds = dfsLineupSlots.filter((s) => s.dfsLineupId === "dfs-lineup-1").map((s) => s.eventId);
    expect(allLinkedEventsFinal(linkedEventStatusesForEventIds(linkedEventIds))).toBe(false);
    for (const entry of dfsEntries.filter((e) => e.dfsLineupId === "dfs-lineup-1")) {
      expect(entry.status === "final" || entry.status === "upcoming" || entry.status === "live").toBe(true);
    }
  });

  it("dfs-lineup-2's only linked Event is already final, so its entry shows Mark Final", () => {
    const linkedEventIds = dfsLineupSlots.filter((s) => s.dfsLineupId === "dfs-lineup-2").map((s) => s.eventId);
    expect(allLinkedEventsFinal(linkedEventStatusesForEventIds(linkedEventIds))).toBe(true);
    const entry = dfsEntries.find((e) => e.id === "dfs-entry-4")!;
    expect(entry.status).toBe("upcoming");
  });

  it("a settled DFSEntry leaves the active section only after the rollover following its finalizedAt", () => {
    const beforeRollover = new Date("2026-09-18T01:00:00Z");
    const afterRollover = new Date("2026-09-19T12:00:00Z");
    const entry = dfsEntries.find((e) => e.id === "dfs-entry-3")!;
    expect(fantasyDfsSection(entry.status, entry.finalizedAt, beforeRollover, "America/New_York", 4)).toBe("settled");
    expect(fantasyDfsSection(entry.status, entry.finalizedAt, afterRollover, "America/New_York", 4)).toBe(null);
  });
});

describe("nfl-week-3 fixture: fantasy/DFS exposure and rooting combine with the betting fixture (docs/PRD.md section 17, 11.6)", () => {
  it("event-hawks-wolves' Fantasy exposure counts both roster-slot sides across both matchups", () => {
    // frs-1-sparks, frs-1-reyes, frs-2-sparks, frs-2-reyes all link to event-hawks-wolves.
    expect(fantasyExposureCount("event-hawks-wolves", fantasyRosterSlots)).toBe(4);
  });

  it("D. Egbuka is rostered 'for' in Fantasy on top of the betting MIXED exposure", () => {
    const subjects = fantasyRootingSubjects(fantasyRosterSlots);
    const egbuka = subjects.filter((s) => s.participantId === "participant-egbuka");
    expect(egbuka).toEqual([{ participantId: "participant-egbuka", direction: "for" }]);
  });
});

const candidates: PlayerSlotCandidates = {
  participants: participants.map((p) => ({ id: p.id, sport: p.sport, name: p.name, teamId: p.teamId })),
  events: events.map((e) => ({ id: e.id, homeTeamId: e.homeTeamId, awayTeamId: e.awayTeamId })),
};

describe("nfl-week-3 fixture: the fantasy matchup and DFS lineup 'screenshots' parse correctly", () => {
  it("parses the fantasy matchup text into one matchup with matched starters", () => {
    const review = buildFantasyMatchupReview(importFantasyMatchupText, candidates);
    expect(review.matchups).toHaveLength(1);
    const [{ matchup, starterMatches, opponentStarterMatches }] = review.matchups;
    expect(matchup.leagueName).toBe("Friends League");
    expect(matchup.userTeamName).toBe("Dynasty Crew");
    expect(matchup.opponentTeamName).toBe("Rival Squad");
    expect(starterMatches.map((m) => m.starter.playerName)).toEqual(["T. Sparks", "D. Egbuka"]);
    expect(starterMatches.every((m) => m.playerMatch.participantMatched)).toBe(true);
    expect(opponentStarterMatches.map((m) => m.starter.playerName)).toEqual(["M. Reyes"]);
    expect(opponentStarterMatches[0].playerMatch.eventId).toBe("event-hawks-wolves");
  });

  it("parses the DFS lineup text into one lineup with matched slots", () => {
    const review = buildDfsLineupReview(importDfsLineupText, candidates);
    expect(review.lineups).toHaveLength(1);
    const [{ lineup, slotMatches }] = review.lineups;
    expect(lineup.platform).toBe("DraftKings");
    expect(lineup.slateName).toBe("Sunday Main");
    expect(slotMatches.map((m) => m.slot.playerName)).toEqual(["T. Sparks", "D. Egbuka", "M. Reyes"]);
    expect(slotMatches.every((m) => m.playerMatch.participantMatched)).toBe(true);
    expect(slotMatches.find((m) => m.slot.playerName === "D. Egbuka")?.playerMatch.eventId).toBe("event-comets-miners");
  });
});

describe("nfl-week-3 fixture: the parser tells a sportsbook ticket, a DFS lineup, and a fantasy matchup apart (no partial credit)", () => {
  it("detects a sportsbook Bet Slip", () => {
    expect(detectImportKind(importSlipTextSingleTicket)).toBe("bet_slip");
  });

  it("detects a DFS Lineup", () => {
    expect(detectImportKind(importDfsLineupText)).toBe("dfs_lineup");
  });

  it("detects a Fantasy Matchup", () => {
    expect(detectImportKind(importFantasyMatchupText)).toBe("fantasy_matchup");
  });
});
