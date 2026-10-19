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

import { normalizeLineEndings, parseKeyValueLines, extractRepeatedField, parseSportField } from "./text-blocks";

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

  const userTeamName = fields.get("my team");
  const opponentTeamName = fields.get("opponent");
  if (!userTeamName || !opponentTeamName) {
    throw new FantasyMatchupParseError(
      `Missing "My Team" or Opponent in matchup:\n${matchupRaw}`,
    );
  }

  // League is optional because a fantasy *matchup* screen generally doesn't
  // show the league's name — it shows the two team names and the scores. The
  // extraction prompt's own general rule is to omit any line whose value isn't
  // visible, so demanding League here failed every real screenshot: the parser
  // required exactly what the prompt was told to leave out.
  //
  // The fallback is the user's own fantasy team name, not "<my team> vs
  // <opponent>", because FantasyLeague is a season-long container (§35: it
  // carries `season` and `userTeamName`, and the per-week entity is
  // FantasyMatchup). The user's team name is stable from week to week, so next
  // week's screenshot finds this same league; the opponent changes every week,
  // so a matchup-shaped name would mint a new "league" each time and scatter
  // one league's weeks across many rows.
  const leagueName = fields.get("league") || userTeamName;

  const { sport: sportName, league } = parseSportField(fields.get("sport"));

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
