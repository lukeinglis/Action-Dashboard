import { describe, expect, it } from "vitest";
import { FantasyMatchupParseError, parseFantasyMatchupText } from "./parse-fantasy-matchup";

const MATCHUP = `Fantasy Matchup
Platform: Sleeper
League: 2 Fast 2 Fantasy
Sport: football/NFL
Season: 2026
Week: 3
My Team: My Team
Opponent: Team DanCantDraft
My Score: 84.5
Opponent Score: 78.2
My Projected: 102.3
Opponent Projected: 95.0
Starter: T. Sparks
Starter: D. Egbuka
Opponent Starter: M. Reyes
Opponent Starter: Kyren Williams`;

describe("parseFantasyMatchupText", () => {
  it("parses the league/team/score header fields", () => {
    const [matchup] = parseFantasyMatchupText(MATCHUP);
    expect(matchup.platform).toBe("Sleeper");
    expect(matchup.leagueName).toBe("2 Fast 2 Fantasy");
    expect(matchup.sport).toBe("football");
    expect(matchup.league).toBe("NFL");
    expect(matchup.season).toBe("2026");
    expect(matchup.week).toBe(3);
    expect(matchup.userTeamName).toBe("My Team");
    expect(matchup.opponentTeamName).toBe("Team DanCantDraft");
    expect(matchup.userScore).toBe(84.5);
    expect(matchup.opponentScore).toBe(78.2);
    expect(matchup.userProjectedScore).toBe(102.3);
    expect(matchup.opponentProjectedScore).toBe(95.0);
  });

  it("parses starters and opponent starters separately, preserving order", () => {
    const [matchup] = parseFantasyMatchupText(MATCHUP);
    expect(matchup.starters.map((s) => s.playerName)).toEqual(["T. Sparks", "D. Egbuka"]);
    expect(matchup.opponentStarters.map((s) => s.playerName)).toEqual(["M. Reyes", "Kyren Williams"]);
  });

  it("parses multiple matchups pasted together", () => {
    const two = `${MATCHUP}\nFantasy Matchup\nLeague: Another League\nSport: football/NFL\nMy Team: A\nOpponent: B\nStarter: Someone\n`;
    const matchups = parseFantasyMatchupText(two);
    expect(matchups).toHaveLength(2);
    expect(matchups[1].leagueName).toBe("Another League");
  });

  it("throws on text with no Fantasy Matchup header", () => {
    expect(() => parseFantasyMatchupText("not a matchup at all")).toThrow(FantasyMatchupParseError);
  });

  it("throws when My Team or Opponent is missing", () => {
    const noTeam = `Fantasy Matchup\nLeague: L\nSport: football/NFL\nOpponent: B\nStarter: Someone`;
    expect(() => parseFantasyMatchupText(noTeam)).toThrow(FantasyMatchupParseError);

    const noOpponent = `Fantasy Matchup\nLeague: L\nSport: football/NFL\nMy Team: A\nStarter: Someone`;
    expect(() => parseFantasyMatchupText(noOpponent)).toThrow(FantasyMatchupParseError);
  });

  // A fantasy matchup screen shows the two team names, not the league's name,
  // and the extraction prompt is told to omit any line it can't see — so
  // requiring League failed every real screenshot.
  it("falls back to the user's team name when League is absent", () => {
    const noLeague = `Fantasy Matchup\nSport: football/NFL\nMy Team: 2 Fast 2 Fantasy\nOpponent: Kettering's Inbox\nStarter: Someone`;
    const [matchup] = parseFantasyMatchupText(noLeague);
    expect(matchup.leagueName).toBe("2 Fast 2 Fantasy");
    expect(matchup.userTeamName).toBe("2 Fast 2 Fantasy");
    expect(matchup.opponentTeamName).toBe("Kettering's Inbox");
  });

  // The fallback must not be matchup-shaped: the opponent changes every week,
  // so next week's screenshot has to land on the same league (§35).
  it("gives both weeks of a league the same fallback name as the opponent changes", () => {
    const week = (opponent: string) =>
      `Fantasy Matchup\nSport: football/NFL\nMy Team: 2 Fast 2 Fantasy\nOpponent: ${opponent}\nStarter: Someone`;
    const [a] = parseFantasyMatchupText(week("Kettering's Inbox"));
    const [b] = parseFantasyMatchupText(week("Bieg Ballers"));
    expect(a.leagueName).toBe(b.leagueName);
  });

  it("still prefers an explicit League line over the fallback", () => {
    const [matchup] = parseFantasyMatchupText(MATCHUP);
    expect(matchup.leagueName).toBe("2 Fast 2 Fantasy");
    expect(matchup.userTeamName).toBe("My Team");
  });

  it("throws when there are no starters at all", () => {
    const bad = `Fantasy Matchup\nLeague: L\nSport: football/NFL\nMy Team: A\nOpponent: B`;
    expect(() => parseFantasyMatchupText(bad)).toThrow(FantasyMatchupParseError);
  });

  it("normalizes CRLF line endings before parsing", () => {
    const crlf = MATCHUP.replace(/\n/g, "\r\n");
    const [matchup] = parseFantasyMatchupText(crlf);
    expect(matchup.starters).toHaveLength(2);
  });
});
