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

// A real DraftKings same-game parlay, transcribed from a screenshot. The slip
// prints "To Pay" and no profit figure at all, which is what every DK ticket
// looks like — the three-number format was never a real-world shape.
const DRAFTKINGS_SGP = `Bet Slip
Type: 3-Leg Same Game Parlay
Leg 1:
Market: spread
Selection: TB Buccaneers +9.5
Subject: TB Buccaneers
Event: TB @ DAL
Sport: football/NFL
Line: 9.5
OverUnder: over

Leg 2:
Market: receiving_yards
Selection: CeeDee Lamb Over 100+
Subject: CeeDee Lamb
Event: TB @ DAL
Sport: football/NFL
Line: 100
OverUnder: over

Leg 3:
Market: rushing_yards
Selection: Jalon Daniels Over 40+
Subject: Jalon Daniels
Event: TB @ DAL
Sport: football/NFL
Line: 40
OverUnder: over
Wager: $10.00
To Pay: $103.80
Promo: +50% Parlay Boost`;

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

  it('parses a DraftKings slip that labels the total "To Pay" and omits the profit', () => {
    const [ticket] = parseSlipText(DRAFTKINGS_SGP);
    expect(ticket.stakeCents).toBe(1000);
    expect(ticket.totalReturnCents).toBe(10380);
    // Not printed anywhere on the slip; the stake and the total give it.
    expect(ticket.toWinCents).toBe(9380);
    expect(ticket.promotionNote).toBe("+50% Parlay Boost");
    expect(ticket.legs.map((l) => l.subject)).toEqual([
      "TB Buccaneers",
      "CeeDee Lamb",
      "Jalon Daniels",
    ]);
  });

  it('reads a book\'s "N+" prop as the half-point line that means the same bet', () => {
    // "Over 100+" pays out at exactly 100 yards. Storing 100 against a strict
    // comparison would grade that game as a push.
    const [ticket] = parseSlipText(DRAFTKINGS_SGP);
    expect(ticket.legs[1]).toMatchObject({ selection: "CeeDee Lamb Over 100+", line: 99.5 });
    expect(ticket.legs[2].line).toBe(39.5);
  });

  it('leaves a "+9.5" spread alone, where the "+" is the handicap and not an "or more"', () => {
    const [ticket] = parseSlipText(DRAFTKINGS_SGP);
    expect(ticket.legs[0]).toMatchObject({ selection: "TB Buccaneers +9.5", line: 9.5 });
  });

  it("derives the payout from a slip that shows only the profit", () => {
    const toWinOnly = STRAIGHT.replace("Payout: $83.33\n", "");
    const [ticket] = parseSlipText(toWinOnly);
    expect(ticket.toWinCents).toBe(3333);
    expect(ticket.totalReturnCents).toBe(8333);
  });

  it("derives the profit from a slip that shows only the payout", () => {
    const payoutOnly = STRAIGHT.replace("To Win: $33.33\n", "");
    const [ticket] = parseSlipText(payoutOnly);
    expect(ticket.toWinCents).toBe(3333);
    expect(ticket.totalReturnCents).toBe(8333);
  });

  it("does not count a bonus bet's stake as returned when deriving", () => {
    // The stake is the book's money, so the payout is the whole profit — the
    // non-bonus arithmetic would under-report the win by the stake.
    const payoutOnly = BONUS.replace("To Win: $32.50\n", "");
    const [ticket] = parseSlipText(payoutOnly);
    expect(ticket.isBonusBet).toBe(true);
    expect(ticket.toWinCents).toBe(3250);
    expect(ticket.totalReturnCents).toBe(3250);

    const toWinOnly = BONUS.replace("Payout: $32.50\n", "");
    expect(parseSlipText(toWinOnly)[0].totalReturnCents).toBe(3250);
  });

  it("throws SlipParseError when neither To Win nor Payout is present", () => {
    const broken = STRAIGHT.replace("To Win: $33.33\n", "").replace("Payout: $83.33\n", "");
    expect(() => parseSlipText(broken)).toThrow(/Missing "To Win" or "Payout"/);
  });

  it("throws rather than storing a negative profit when the payout is below the stake", () => {
    // One of the two numbers was misread; deriving would record a loss as a win.
    const broken = STRAIGHT.replace("To Win: $33.33\n", "").replace("Payout: $83.33", "Payout: $8.33");
    expect(() => parseSlipText(broken)).toThrow(/less than "Wager"/);
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
