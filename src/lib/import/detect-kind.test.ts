import { describe, expect, it } from "vitest";
import { detectImportKind, UnknownImportKindError } from "./detect-kind";

describe("detectImportKind", () => {
  it("detects a sportsbook Bet Slip", () => {
    expect(
      detectImportKind(`Bet Slip #DK-1001\nType: Straight\nLeg 1:\nMarket: moneyline\nSelection: Chiefs`),
    ).toBe("bet_slip");
  });

  it("detects a Bet Slip with no ticket id", () => {
    expect(detectImportKind(`Bet Slip\nType: Straight`)).toBe("bet_slip");
  });

  it("detects a DFS Lineup", () => {
    expect(
      detectImportKind(`DFS Lineup\nPlatform: DraftKings\nSport: football/NFL\nSlot: QB\nPlayer: T. Sparks`),
    ).toBe("dfs_lineup");
  });

  it("detects a Fantasy Matchup", () => {
    expect(
      detectImportKind(
        `Fantasy Matchup\nLeague: 2 Fast 2 Fantasy\nSport: football/NFL\nMy Team: A\nOpponent: B\nStarter: T. Sparks`,
      ),
    ).toBe("fantasy_matchup");
  });

  it("is tolerant of CRLF line endings and leading/trailing whitespace", () => {
    const crlf = `\r\n  Fantasy Matchup\r\nLeague: L\r\nSport: football/NFL\r\nMy Team: A\r\nOpponent: B\r\n  `;
    expect(detectImportKind(crlf)).toBe("fantasy_matchup");
  });

  it("throws UnknownImportKindError when no recognized header is present", () => {
    expect(() => detectImportKind("just some random pasted text")).toThrow(UnknownImportKindError);
  });

  it("throws UnknownImportKindError on empty text", () => {
    expect(() => detectImportKind("")).toThrow(UnknownImportKindError);
  });
});
