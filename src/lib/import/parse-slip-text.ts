// Deterministic parser for pasted/extracted sportsbook slip text.
//
// No real DraftKings export format is available (docs/phase-2.md notes the
// same gap for screenshots), so this parses a hand-authored, explicitly
// labeled "Bet Slip" text format designed to be realistic enough to stand
// in for a slip/receipt while staying unambiguous to parse. See
// docs/phase-3.md for the full format spec and the fixture for examples.
// The screenshot pipeline (extract-screenshot.ts) asks Claude to transcribe
// images into this same format, so this parser is the single source of
// parsing truth for both the "Paste Text" and "Upload Screenshot" inputs
// (docs/PRD.md section 30: Extraction -> ... -> Parsing).
//
// The parser never silently drops data (docs/PRD.md section 30): any
// structural problem throws a SlipParseError describing what went wrong,
// and the whole ImportRecord is marked failed rather than saving a partial
// or guessed result.

import { extractDollarCents, normalizeLineEndings, parseKeyValueLines } from "./text-blocks";

export class SlipParseError extends Error {}

export interface ParsedLeg {
  marketType: string;
  selection: string;
  subject?: string;
  opponentSubject?: string;
  awayTeamName?: string;
  homeTeamName?: string;
  sport: string;
  league?: string;
  startTimeUtc?: string;
  line?: number;
  overUnder?: "over" | "under" | "yes" | "no";
  oddsAmerican?: number;
  rawDescription: string;
}

export interface ParsedTicket {
  sportsbookTicketId?: string;
  isBonusBet: boolean;
  stakeCents: number;
  toWinCents: number;
  totalReturnCents: number;
  placedAt?: string;
  promotionNote?: string;
  legs: ParsedLeg[];
  raw: string;
}

function parseDollars(raw: string | undefined, field: string, ticketRaw: string): number {
  if (!raw) throw new SlipParseError(`Missing "${field}" in ticket:\n${ticketRaw}`);
  const cents = extractDollarCents(raw);
  if (cents === null) throw new SlipParseError(`Could not parse "${field}" value "${raw}" in ticket:\n${ticketRaw}`);
  return cents;
}

function parseOneLeg(legBlock: string, ticketRaw: string): ParsedLeg {
  const fields = parseKeyValueLines(legBlock);

  const marketType = fields.get("market");
  const selection = fields.get("selection");
  const sport = fields.get("sport");
  if (!marketType || !selection || !sport) {
    throw new SlipParseError(
      `Leg is missing Market, Selection, or Sport in ticket:\n${ticketRaw}`,
    );
  }

  const [sportName, league] = sport.split("/").map((s) => s.trim());

  let awayTeamName: string | undefined;
  let homeTeamName: string | undefined;
  const event = fields.get("event");
  if (event) {
    const parts = event.split("@").map((s) => s.trim());
    if (parts.length !== 2) {
      throw new SlipParseError(`Could not parse "Event" value "${event}" in ticket:\n${ticketRaw}`);
    }
    [awayTeamName, homeTeamName] = parts;
  }

  const lineRaw = fields.get("line");
  const line = lineRaw !== undefined ? parseFloat(lineRaw) : undefined;
  if (lineRaw !== undefined && Number.isNaN(line)) {
    throw new SlipParseError(`Could not parse "Line" value "${lineRaw}" in ticket:\n${ticketRaw}`);
  }

  const overUnderRaw = fields.get("overunder")?.toLowerCase();
  if (overUnderRaw && !["over", "under", "yes", "no"].includes(overUnderRaw)) {
    throw new SlipParseError(`Invalid "OverUnder" value "${overUnderRaw}" in ticket:\n${ticketRaw}`);
  }

  const oddsRaw = fields.get("odds");
  const oddsAmerican = oddsRaw !== undefined ? parseInt(oddsRaw, 10) : undefined;
  if (oddsRaw !== undefined && Number.isNaN(oddsAmerican)) {
    throw new SlipParseError(`Could not parse "Odds" value "${oddsRaw}" in ticket:\n${ticketRaw}`);
  }

  return {
    marketType: marketType.toLowerCase(),
    selection,
    subject: fields.get("subject"),
    opponentSubject: fields.get("opponent subject"),
    awayTeamName,
    homeTeamName,
    sport: sportName,
    league: league || undefined,
    startTimeUtc: fields.get("start"),
    line,
    overUnder: overUnderRaw as ParsedLeg["overUnder"],
    oddsAmerican,
    rawDescription: legBlock.trim(),
  };
}

function parseOneTicket(ticketRaw: string): ParsedTicket {
  const idMatch = ticketRaw.match(/^Bet Slip(?:\s*#(\S+))?\s*$/m);
  const sportsbookTicketId = idMatch?.[1];

  const isBonusBet = /^Bonus Bet\s*$/m.test(ticketRaw);

  const legBlocks = ticketRaw
    .split(/^Leg \d+:\s*$/m)
    .slice(1)
    .map((block) => block.split(/^(?:Wager|To Win|Payout|Placed|Promo):/m)[0]);

  if (legBlocks.length === 0) {
    throw new SlipParseError(`No "Leg N:" blocks found in ticket:\n${ticketRaw}`);
  }

  const legs = legBlocks.map((block) => parseOneLeg(block, ticketRaw));

  const tail = parseKeyValueLines(ticketRaw);
  const stakeCents = parseDollars(tail.get("wager"), "Wager", ticketRaw);
  const toWinCents = parseDollars(tail.get("to win"), "To Win", ticketRaw);
  const totalReturnCents = parseDollars(tail.get("payout"), "Payout", ticketRaw);

  return {
    sportsbookTicketId,
    isBonusBet,
    stakeCents,
    toWinCents,
    totalReturnCents,
    placedAt: tail.get("placed"),
    promotionNote: tail.get("promo"),
    legs,
    raw: ticketRaw.trim(),
  };
}

/**
 * Parses one or more "Bet Slip" blocks from pasted or extracted text. Throws
 * SlipParseError on any structural problem — callers should catch this and
 * mark the ImportRecord "failed" with the message, never save a guess.
 */
export function parseSlipText(text: string): ParsedTicket[] {
  const trimmed = normalizeLineEndings(text).trim();
  if (trimmed.length === 0) {
    throw new SlipParseError("No text to parse.");
  }

  const blocks = trimmed
    .split(/^(?=Bet Slip(?:\s*#\S+)?\s*$)/m)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length === 0 || !/^Bet Slip/.test(blocks[0])) {
    throw new SlipParseError('Text does not start with a "Bet Slip" header.');
  }

  return blocks.map(parseOneTicket);
}
