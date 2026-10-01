// Distinguishes a sportsbook Ticket, a DFS Lineup, and a Fantasy Matchup
// in pasted/extracted text (docs/PRD.md section 43: "Screenshot parsing
// should distinguish: sportsbook Ticket, DFS Lineup, Fantasy Matchup" —
// this is docs/PRD.md section 65's Phase 5 exit criterion with no partial
// credit). Each of the three deterministic text formats starts every
// block with its own unique, unambiguous header line ("Bet Slip",
// "DFS Lineup", "Fantasy Matchup"), so detection is a simple, cheap,
// line-anchored check run before the kind-specific parser — callers use
// the result to route to parseSlipText / parseDfsLineupText /
// parseFantasyMatchupText without guessing inside any of those parsers.

import { normalizeLineEndings } from "./text-blocks";

export type ImportKind = "bet_slip" | "dfs_lineup" | "fantasy_matchup";

export class UnknownImportKindError extends Error {}

const HEADER_PATTERNS: Array<{ kind: ImportKind; pattern: RegExp }> = [
  { kind: "bet_slip", pattern: /^Bet Slip(?:\s*#\S+)?\s*$/m },
  { kind: "dfs_lineup", pattern: /^DFS Lineup\s*$/m },
  { kind: "fantasy_matchup", pattern: /^Fantasy Matchup\s*$/m },
];

/**
 * Detects which of the three import formats `text` is, by its first
 * recognized header line. Throws UnknownImportKindError if none of the
 * three headers appear anywhere in the text, so the ImportRecord is
 * marked failed rather than guessed at (docs/PRD.md section 30).
 */
export function detectImportKind(text: string): ImportKind {
  const trimmed = normalizeLineEndings(text).trim();

  let earliestIndex = Infinity;
  let earliestKind: ImportKind | null = null;
  for (const { kind, pattern } of HEADER_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match.index !== undefined && match.index < earliestIndex) {
      earliestIndex = match.index;
      earliestKind = kind;
    }
  }

  if (!earliestKind) {
    throw new UnknownImportKindError(
      'Could not tell whether this is a Bet Slip, DFS Lineup, or Fantasy Matchup — no recognized header found.',
    );
  }
  return earliestKind;
}
