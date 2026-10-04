// Deterministic parser for pasted/extracted DFS lineup text (docs/PRD.md
// section 43: DFS Input, Phase 5). No real DraftKings export format is
// available, so this parses a hand-authored "DFS Lineup" text format,
// structurally consistent with the "Bet Slip" format (parse-slip-text.ts)
// and sharing its helpers (text-blocks.ts). The screenshot pipeline
// (extract-screenshot.ts) transcribes DFS lineup screenshots into this
// same format, so paste-text and screenshot inputs share this one parser.
//
// One text block maps to exactly one DFSLineup plus one DFSEntry (the
// contest the screenshot/paste shows). A lineup used across multiple
// entries is represented by creating additional DFSEntries against an
// already-approved DFSLineup, not by this parser.
//
// Never silently drops data: any structural problem throws
// DfsLineupParseError, and the whole ImportRecord is marked failed.

import { extractDollarCents, normalizeLineEndings, parseKeyValueLines } from "./text-blocks";

export class DfsLineupParseError extends Error {}

export interface ParsedDfsSlot {
  slot: string;
  playerName: string;
  salary?: number;
  points?: number;
  rawDescription: string;
}

export interface ParsedDfsLineup {
  platform: string;
  sport: string;
  league?: string;
  slateName?: string;
  slots: ParsedDfsSlot[];
  contestName?: string;
  entryFeeCents?: number;
  potentialPrizeCents?: number;
  currentPoints?: number;
  raw: string;
}

function parseOneSlot(slotName: string, slotBlock: string, lineupRaw: string): ParsedDfsSlot {
  const fields = parseKeyValueLines(slotBlock);

  const playerName = fields.get("player");
  if (!playerName) {
    throw new DfsLineupParseError(`Slot "${slotName}" is missing Player in lineup:\n${lineupRaw}`);
  }

  const salaryRaw = fields.get("salary");
  const salary = salaryRaw !== undefined ? parseInt(salaryRaw.replace(/,/g, ""), 10) : undefined;
  if (salaryRaw !== undefined && Number.isNaN(salary)) {
    throw new DfsLineupParseError(`Could not parse "Salary" value "${salaryRaw}" in lineup:\n${lineupRaw}`);
  }

  const pointsRaw = fields.get("points");
  const points = pointsRaw !== undefined ? parseFloat(pointsRaw) : undefined;
  if (pointsRaw !== undefined && Number.isNaN(points)) {
    throw new DfsLineupParseError(`Could not parse "Points" value "${pointsRaw}" in lineup:\n${lineupRaw}`);
  }

  return { slot: slotName.trim(), playerName, salary, points, rawDescription: slotBlock.trim() };
}

function parseOneLineup(lineupRaw: string): ParsedDfsLineup {
  const header = parseKeyValueLines(lineupRaw.split(/^Slot: /m)[0]);

  const platform = header.get("platform");
  if (!platform) {
    throw new DfsLineupParseError(`Missing Platform in lineup:\n${lineupRaw}`);
  }

  // Sport isn't always determinable from extraction (docs/PRD.md section 30
  // Sport inference note); fall back to empty and let matching proceed by
  // name alone rather than failing the whole import.
  const sportRaw = header.get("sport") ?? "";
  const [sportName, league] = sportRaw.split("/").map((s) => s.trim());

  const parts = lineupRaw.split(/^Slot: (.+)$/m);
  if (parts.length < 3) {
    throw new DfsLineupParseError(`No "Slot:" lines found in lineup:\n${lineupRaw}`);
  }

  const slots: ParsedDfsSlot[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    slots.push(parseOneSlot(parts[i], parts[i + 1], lineupRaw));
  }

  const tail = parseKeyValueLines(lineupRaw);
  const entryFeeRaw = tail.get("entry fee");
  const prizeRaw = tail.get("prize");
  const currentPointsRaw = tail.get("current points");

  const entryFeeCents = entryFeeRaw !== undefined ? extractDollarCents(entryFeeRaw) ?? undefined : undefined;
  if (entryFeeRaw !== undefined && entryFeeCents === undefined) {
    throw new DfsLineupParseError(`Could not parse "Entry Fee" value "${entryFeeRaw}" in lineup:\n${lineupRaw}`);
  }
  const potentialPrizeCents = prizeRaw !== undefined ? extractDollarCents(prizeRaw) ?? undefined : undefined;
  if (prizeRaw !== undefined && potentialPrizeCents === undefined) {
    throw new DfsLineupParseError(`Could not parse "Prize" value "${prizeRaw}" in lineup:\n${lineupRaw}`);
  }
  const currentPoints = currentPointsRaw !== undefined ? parseFloat(currentPointsRaw) : undefined;
  if (currentPointsRaw !== undefined && Number.isNaN(currentPoints)) {
    throw new DfsLineupParseError(
      `Could not parse "Current Points" value "${currentPointsRaw}" in lineup:\n${lineupRaw}`,
    );
  }

  return {
    platform,
    sport: sportName,
    league: league || undefined,
    slateName: header.get("slate"),
    slots,
    contestName: tail.get("contest"),
    entryFeeCents,
    potentialPrizeCents,
    currentPoints,
    raw: lineupRaw.trim(),
  };
}

/**
 * Parses one or more "DFS Lineup" blocks from pasted or extracted text.
 * Throws DfsLineupParseError on any structural problem — callers should
 * catch this and mark the ImportRecord "failed", never save a guess.
 */
export function parseDfsLineupText(text: string): ParsedDfsLineup[] {
  const trimmed = normalizeLineEndings(text).trim();
  if (trimmed.length === 0) {
    throw new DfsLineupParseError("No text to parse.");
  }

  const blocks = trimmed
    .split(/^(?=DFS Lineup\s*$)/m)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length === 0 || !/^DFS Lineup/.test(blocks[0])) {
    throw new DfsLineupParseError('Text does not start with a "DFS Lineup" header.');
  }

  return blocks.map(parseOneLineup);
}
