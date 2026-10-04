import { describe, expect, it } from "vitest";
import { SlipParseError, parseSlipText } from "./parse-slip-text";

const STRAIGHT = `Bet Slip #DK-1001
Type: Straight
Leg 1:
Market: moneyline
Selection: Kansas City Chiefs
Event: Kansas City Chiefs @ Buffalo Bills
Sport: football/NFL
Start: 2026-09-21T17:00:00Z
Odds: -150
Wager: $50.00
To Win: $33.33
Payout: $83.33
Placed: 2026-09-21T15:03:00Z`;

const PARLAY = `Bet Slip #DK-1002
Type: 3-Leg Parlay
Leg 1:
Market: moneyline
Selection: Kansas City Chiefs
Event: Kansas City Chiefs @ Buffalo Bills
Sport: football/NFL
Odds: -150

Leg 2:
Market: game_total
Selection: Over 47.5
Line: 47.5
OverUnder: over
Event: Kansas City Chiefs @ Buffalo Bills
Sport: football/NFL
Odds: -110

Leg 3:
Market: passing_yards
Selection: Patrick Mahomes Over 275.5
Subject: Patrick Mahomes
Line: 275.5
OverUnder: over
Sport: football/NFL
Odds: -115
Wager: $10.00
To Win: $45.00
Payout: $55.00`;

const BONUS = `Bet Slip #DK-1003
Type: Straight
Bonus Bet
Leg 1:
Market: moneyline
Selection: Buffalo Bills
Event: Kansas City Chiefs @ Buffalo Bills
Sport: football/NFL
Odds: +130
Wager: $25.00
To Win: $32.50
Payout: $32.50
Promo: Bonus Bet`;

const FUTURE = `Bet Slip #DK-1004
Type: Straight
Leg 1:
Market: season_future
Selection: Kansas City Chiefs to win Super Bowl
Sport: football/NFL
Odds: +800
Wager: $20.00
To Win: $160.00
Payout: $180.00`;

describe("parseSlipText", () => {
  it("parses a single straight bet", () => {
    const [ticket] = parseSlipText(STRAIGHT);
    expect(ticket.sportsbookTicketId).toBe("DK-1001");
    expect(ticket.isBonusBet).toBe(false);
    expect(ticket.stakeCents).toBe(5000);
    expect(ticket.toWinCents).toBe(3333);
    expect(ticket.totalReturnCents).toBe(8333);
    expect(ticket.placedAt).toBe("2026-09-21T15:03:00Z");
    expect(ticket.legs).toHaveLength(1);
    expect(ticket.legs[0]).toMatchObject({
      marketType: "moneyline",
      selection: "Kansas City Chiefs",
      awayTeamName: "Kansas City Chiefs",
      homeTeamName: "Buffalo Bills",
      sport: "football",
      league: "NFL",
      oddsAmerican: -150,
    });
  });

  it("parses text with CRLF line endings, as a native <textarea> form submits it", () => {
    const [ticket] = parseSlipText(STRAIGHT.replace(/\n/g, "\r\n"));
    expect(ticket.sportsbookTicketId).toBe("DK-1001");
    expect(ticket.legs).toHaveLength(1);
    expect(ticket.legs[0]).toMatchObject({ marketType: "moneyline", selection: "Kansas City Chiefs" });
  });

  it("parses a 3-leg parlay with over/under and player-prop legs", () => {
    const [ticket] = parseSlipText(PARLAY);
    expect(ticket.legs).toHaveLength(3);
    expect(ticket.legs[1]).toMatchObject({ marketType: "game_total", line: 47.5, overUnder: "over" });
    expect(ticket.legs[2]).toMatchObject({
      marketType: "passing_yards",
      subject: "Patrick Mahomes",
      line: 275.5,
      overUnder: "over",
      awayTeamName: undefined,
    });
    expect(ticket.stakeCents).toBe(1000);
  });

  it("parses a bonus bet with a promotion note", () => {
    const [ticket] = parseSlipText(BONUS);
    expect(ticket.isBonusBet).toBe(true);
    expect(ticket.promotionNote).toBe("Bonus Bet");
  });

  it("parses a season future leg with no linked Event", () => {
    const [ticket] = parseSlipText(FUTURE);
    expect(ticket.legs[0].awayTeamName).toBeUndefined();
    expect(ticket.legs[0].homeTeamName).toBeUndefined();
  });

  it("parses multiple tickets pasted together, in order", () => {
    const tickets = parseSlipText([STRAIGHT, PARLAY, BONUS].join("\n\n"));
    expect(tickets.map((t) => t.sportsbookTicketId)).toEqual(["DK-1001", "DK-1002", "DK-1003"]);
  });

  it("throws SlipParseError on empty text", () => {
    expect(() => parseSlipText("")).toThrow(SlipParseError);
  });

  it("throws SlipParseError on text with no Bet Slip header", () => {
    expect(() => parseSlipText("just some random text")).toThrow(SlipParseError);
  });

  it("throws SlipParseError when a required leg field is missing", () => {
    const broken = STRAIGHT.replace("Market: moneyline\n", "");
    expect(() => parseSlipText(broken)).toThrow(SlipParseError);
  });

  it("throws SlipParseError when Wager is missing", () => {
    const broken = STRAIGHT.replace(/Wager: \$50\.00\n/, "");
    expect(() => parseSlipText(broken)).toThrow(SlipParseError);
  });

  it("does not throw when Sport is missing from a leg (extraction can't always determine it)", () => {
    const noSport = STRAIGHT.replace("Sport: football/NFL\n", "");
    const [ticket] = parseSlipText(noSport);
    expect(ticket.legs[0].sport).toBe("");
  });
});
