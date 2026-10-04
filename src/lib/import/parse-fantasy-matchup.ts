// Deterministic parser for pasted/extracted fantasy matchup text
// (docs/PRD.md section 38: Fantasy Experience, section 43: DFS Input —
// "Fantasy matchups use the same entry methods"). No real fantasy-platform
// export format is available, so this parses a hand-authored "Fantasy
// Matchup" text format, structurally consistent with "Bet Slip"
// (parse-slip-text.ts) and sharing its helpers (text-blocks.ts). The
// screenshot pipeline transcribes fantasy matchup screenshots into this
// same format.
//
// docs/PRD.md section 34: only starters/opponent starters are required for
// MVP — benches are not part of the format.
//
// Never silently drops data: any structural problem throws
// FantasyMatchupParseError, and the whole ImportRecord is marked failed.

import { normalizeLineEndings, parseKeyValueLines, extractRepeatedField } from "./text-blocks";

export class FantasyMatchupParseError extends Error {}

export interface ParsedFantasyStarter {
  playerName: string;
}

export interface ParsedFantasyMatchup {
  leagueName: string;
  platform?: string;
  sport: string;
  league?: string;
  season?: string;
  week?: number;
  userTeamName: string;
  opponentTeamName: string;
  userScore?: number;
  opponentScore?: number;
  userProjectedScore?: number;
  opponentProjectedScore?: number;
  starters: ParsedFantasyStarter[];
  opponentStarters: ParsedFantasyStarter[];
  raw: string;
}

function parseStarters(block: string, key: string): ParsedFantasyStarter[] {
  return extractRepeatedField(block, key).map((playerName) => ({ playerName }));
}

function parseOneMatchup(matchupRaw: string): ParsedFantasyMatchup {
  const fields = parseKeyValueLines(matchupRaw);

  const leagueName = fields.get("league");
  const userTeamName = fields.get("my team");
  const opponentTeamName = fields.get("opponent");
  if (!leagueName || !userTeamName || !opponentTeamName) {
    throw new FantasyMatchupParseError(
      `Missing League, "My Team", or Opponent in matchup:\n${matchupRaw}`,
    );
  }

  // Sport isn't always determinable from extraction (docs/PRD.md section 30
  // Sport inference note); fall back to empty and let matching proceed by
  // name alone rather than failing the whole import.
  const sportRaw = fields.get("sport") ?? "";
  const [sportName, league] = sportRaw.split("/").map((s) => s.trim());

  const weekRaw = fields.get("week");
  const week = weekRaw !== undefined ? parseInt(weekRaw, 10) : undefined;
  if (weekRaw !== undefined && Number.isNaN(week)) {
    throw new FantasyMatchupParseError(`Could not parse "Week" value "${weekRaw}" in matchup:\n${matchupRaw}`);
  }

  function parseScore(key: string): number | undefined {
    const raw = fields.get(key);
    if (raw === undefined) return undefined;
    const value = parseFloat(raw);
    if (Number.isNaN(value)) {
      throw new FantasyMatchupParseError(`Could not parse "${key}" value "${raw}" in matchup:\n${matchupRaw}`);
    }
    return value;
  }

  const starters = parseStarters(matchupRaw, "Starter");
  const opponentStarters = parseStarters(matchupRaw, "Opponent Starter");
  if (starters.length === 0 && opponentStarters.length === 0) {
    throw new FantasyMatchupParseError(`No "Starter:" or "Opponent Starter:" lines found in matchup:\n${matchupRaw}`);
  }

  return {
    leagueName,
    platform: fields.get("platform"),
    sport: sportName,
    league: league || undefined,
    season: fields.get("season"),
    week,
    userTeamName,
    opponentTeamName,
    userScore: parseScore("my score"),
    opponentScore: parseScore("opponent score"),
    userProjectedScore: parseScore("my projected"),
    opponentProjectedScore: parseScore("opponent projected"),
    starters,
    opponentStarters,
    raw: matchupRaw.trim(),
  };
}

/**
 * Parses one or more "Fantasy Matchup" blocks from pasted or extracted
 * text. Throws FantasyMatchupParseError on any structural problem —
 * callers should catch this and mark the ImportRecord "failed", never
 * save a guess.
 */
export function parseFantasyMatchupText(text: string): ParsedFantasyMatchup[] {
  const trimmed = normalizeLineEndings(text).trim();
  if (trimmed.length === 0) {
    throw new FantasyMatchupParseError("No text to parse.");
  }

  const blocks = trimmed
    .split(/^(?=Fantasy Matchup\s*$)/m)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length === 0 || !/^Fantasy Matchup/.test(blocks[0])) {
    throw new FantasyMatchupParseError('Text does not start with a "Fantasy Matchup" header.');
  }

  return blocks.map(parseOneMatchup);
}
