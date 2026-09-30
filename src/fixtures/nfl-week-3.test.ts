import { describe, expect, it } from "vitest";
import { effectiveTicketStatus, legSettlement } from "@/lib/betting/derived-status";
import { isLegLive } from "@/lib/tickets/bet-leg-events";
import { allowsTeamSubject, defaultSubjectDirection, marketCategory, resolveSubjectDirection } from "@/lib/betting/subjects";
import { hasReturnMismatch } from "@/lib/betting/money";
import {
  betLegEvents,
  betLegs,
  betLegSubjects,
  events,
  expectedTicketStatuses,
  tickets,
} from "./nfl-week-3";

function legsForTicket(ticketId: string) {
  return betLegs.filter((l) => l.ticketId === ticketId);
}

function linkedEventStatusesForLeg(betLegId: string) {
  return betLegEvents
    .filter((bev) => bev.betLegId === betLegId)
    .map((bev) => events.find((e) => e.id === bev.eventId)?.automaticStatus ?? null);
}

function anyLinkedEventLiveForTicket(ticketId: string) {
  return legsForTicket(ticketId).some((leg) =>
    isLegLive(legSettlement(leg), linkedEventStatusesForLeg(leg.id)),
  );
}

describe("nfl-week-3 fixture: derived Ticket status (docs/PRD.md section 27)", () => {
  for (const t of tickets) {
    it(`${t.id} (${t.name}) derives to "${expectedTicketStatuses[t.id]}"`, () => {
      const status = effectiveTicketStatus(
        null,
        legsForTicket(t.id),
        anyLinkedEventLiveForTicket(t.id),
      );
      expect(status).toBe(expectedTicketStatuses[t.id]);
    });
  }

  it("a manual Ticket status overrides the derived value", () => {
    const status = effectiveTicketStatus("cashed_out", legsForTicket("ticket-a"), false);
    expect(status).toBe("cashed_out");
  });
});

describe("nfl-week-3 fixture: BetLeg-Event links (docs/PRD.md section 26.1)", () => {
  it("leg-g1 is linked to two Events", () => {
    const links = betLegEvents.filter((bev) => bev.betLegId === "leg-g1");
    expect(links.map((l) => l.eventId).sort()).toEqual(
      ["event-comets-miners", "event-hawks-wolves"].sort(),
    );
  });

  it("leg-e2 (a season future) and leg-f1 (a cross-game matchup) have no linked Event", () => {
    expect(betLegEvents.filter((bev) => bev.betLegId === "leg-e2")).toHaveLength(0);
    expect(betLegEvents.filter((bev) => bev.betLegId === "leg-f1")).toHaveLength(0);
  });

  it("ticket-g is active only because one of its two linked Events is live", () => {
    expect(anyLinkedEventLiveForTicket("ticket-g")).toBe(true);
  });
});

describe("nfl-week-3 fixture: default subject/direction per market (docs/PRD.md section 26.2)", () => {
  it("covers every market category in the table", () => {
    const categories = new Set(betLegs.map((l) => marketCategory(l.marketType)));
    expect(categories).toEqual(
      new Set([
        "team_vs_opponent",
        "game_total",
        "team_total",
        "player_over_under",
        "selection_only",
        "matchup",
        "neutral",
      ]),
    );
  });

  it("moneyline (team_vs_opponent): selected team for, opponent against", () => {
    expect(defaultSubjectDirection("moneyline", "primary")).toBe("for");
    expect(defaultSubjectDirection("moneyline", "opponent")).toBe("against");
  });

  it("game_total: both teams for on Over, against on Under", () => {
    expect(defaultSubjectDirection("game_total", "primary", "over")).toBe("for");
    expect(defaultSubjectDirection("game_total", "primary", "under")).toBe("against");
  });

  it("team_total: the team for on Over, against on Under", () => {
    expect(defaultSubjectDirection("team_total", "primary", "over")).toBe("for");
    expect(defaultSubjectDirection("team_total", "primary", "under")).toBe("against");
  });

  it("player props never propose a team-level subject", () => {
    expect(allowsTeamSubject("passing_yards")).toBe(false);
    const teamSubjectsOnPlayerLeg = betLegSubjects.filter(
      (s) => s.betLegId === "leg-e1" && s.teamId,
    );
    expect(teamSubjectsOnPlayerLeg).toHaveLength(0);
  });

  it("selection_only (season_future): the selection for", () => {
    expect(defaultSubjectDirection("season_future", "primary")).toBe("for");
  });

  it("matchup: selection for, opponent against", () => {
    expect(defaultSubjectDirection("matchup", "primary")).toBe("for");
    expect(defaultSubjectDirection("matchup", "opponent")).toBe("against");
  });

  it("custom (neutral): subjects stay neutral regardless of role", () => {
    expect(defaultSubjectDirection("custom", "primary")).toBe("neutral");
    expect(defaultSubjectDirection("custom", "opponent")).toBe("neutral");
  });

  it("a manually-set direction survives re-matching", () => {
    const existing = betLegSubjects.find((s) => s.id === "subj-b1-hawks")!;
    expect(existing.direction).toBe("neutral");
    expect(existing.directionSource).toBe("manual");

    const proposed = defaultSubjectDirection("spread", "opponent");
    expect(proposed).toBe("against");

    const resolved = resolveSubjectDirection(
      { direction: existing.direction, directionSource: existing.directionSource },
      proposed,
    );
    expect(resolved).toEqual({ direction: "neutral", directionSource: "manual" });
  });
});

describe("nfl-week-3 fixture: money (docs/PRD.md section 25)", () => {
  it("every Ticket's totalReturnCents matches stake + to-win (no mismatch in this fixture)", () => {
    for (const t of tickets) {
      expect(hasReturnMismatch(t)).toBe(false);
    }
  });
});
