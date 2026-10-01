import { describe, expect, it } from "vitest";
import { DfsLineupParseError, parseDfsLineupText } from "./parse-dfs-lineup";

const LINEUP = `DFS Lineup
Platform: DraftKings
Sport: football/NFL
Slate: Main Slate
Slot: QB
Player: T. Sparks
Salary: 8200
Points: 24.5
Slot: FLEX
Player: D. Egbuka
Salary: 5800
Points: 15.0
Contest: Millionaire Maker
Entry Fee: $20.00
Prize: $100000.00
Current Points: 39.5`;

describe("parseDfsLineupText", () => {
  it("parses platform/sport/slate and every slot with salary and points", () => {
    const [lineup] = parseDfsLineupText(LINEUP);
    expect(lineup.platform).toBe("DraftKings");
    expect(lineup.sport).toBe("football");
    expect(lineup.league).toBe("NFL");
    expect(lineup.slateName).toBe("Main Slate");
    expect(lineup.slots).toHaveLength(2);
    expect(lineup.slots[0]).toMatchObject({ slot: "QB", playerName: "T. Sparks", salary: 8200, points: 24.5 });
    expect(lineup.slots[1]).toMatchObject({ slot: "FLEX", playerName: "D. Egbuka", salary: 5800, points: 15.0 });
  });

  it("parses the entry fields", () => {
    const [lineup] = parseDfsLineupText(LINEUP);
    expect(lineup.contestName).toBe("Millionaire Maker");
    expect(lineup.entryFeeCents).toBe(2000);
    expect(lineup.potentialPrizeCents).toBe(10_000_000);
    expect(lineup.currentPoints).toBe(39.5);
  });

  it("parses multiple lineups pasted together", () => {
    const two = `${LINEUP}\nDFS Lineup\nPlatform: DraftKings\nSport: football/NFL\nSlot: QB\nPlayer: Someone Else\n`;
    const lineups = parseDfsLineupText(two);
    expect(lineups).toHaveLength(2);
    expect(lineups[1].slots[0].playerName).toBe("Someone Else");
  });

  it("throws on text with no DFS Lineup header", () => {
    expect(() => parseDfsLineupText("not a lineup at all")).toThrow(DfsLineupParseError);
  });

  it("throws when Platform or Sport is missing", () => {
    const bad = `DFS Lineup\nSlot: QB\nPlayer: T. Sparks`;
    expect(() => parseDfsLineupText(bad)).toThrow(DfsLineupParseError);
  });

  it("throws when a slot is missing Player", () => {
    const bad = `DFS Lineup\nPlatform: DraftKings\nSport: football/NFL\nSlot: QB\nSalary: 8200`;
    expect(() => parseDfsLineupText(bad)).toThrow(DfsLineupParseError);
  });

  it("throws when there are no Slot lines at all", () => {
    const bad = `DFS Lineup\nPlatform: DraftKings\nSport: football/NFL`;
    expect(() => parseDfsLineupText(bad)).toThrow(DfsLineupParseError);
  });

  it("normalizes CRLF line endings before parsing", () => {
    const crlf = LINEUP.replace(/\n/g, "\r\n");
    const [lineup] = parseDfsLineupText(crlf);
    expect(lineup.slots).toHaveLength(2);
  });
});
