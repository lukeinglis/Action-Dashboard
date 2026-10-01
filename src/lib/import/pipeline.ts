// Ties the Import Pipeline stages together (docs/PRD.md section 30):
// Parsing -> Participant Matching -> Event Matching -> Subject/Direction
// Proposal -> duplicate warning. Pure — callers fetch the extracted text and
// candidate Teams/Participants/Events/Tickets once and pass them in, then
// persist the ParseResult's review payload onto the ImportRecord themselves.
//
// parseSlipText throws SlipParseError on any structural problem; callers
// should catch that and mark the ImportRecord "failed" with the message
// (docs/PRD.md section 30: "The parser must never silently save imported
// data"), never call buildImportReview with unparseable text.

import { parseSlipText, type ParsedTicket } from "./parse-slip-text";
import { matchParsedLeg, type LegMatch, type MatchCandidates } from "./match-parsed-legs";
import { findDuplicateTicket, type DuplicateTicketCandidate } from "./duplicate-check";
import type { RootingDirection } from "@/lib/types/domain";

/** Phase 3 parses DraftKings slips only (docs/PRD.md section 30.1); the text format has no Sportsbook field. */
export const DEFAULT_SPORTSBOOK = "DraftKings";

export interface TicketReview {
  ticket: ParsedTicket;
  legMatches: LegMatch[];
  duplicateOfTicketId?: string;
}

export interface ImportReview {
  tickets: TicketReview[];
}

/**
 * Parses slip text into one or more tickets and, for each, proposes Event
 * matches and Subject/direction for every leg, and flags a likely duplicate
 * against the user's existing Tickets. Never writes anything — the caller
 * saves the result as ImportRecord.parsedPayload for the review screen and
 * only creates Tickets/BetLegs on explicit approval.
 */
export function buildImportReview(
  text: string,
  candidates: MatchCandidates,
  existingTickets: DuplicateTicketCandidate[],
  timeZone: string,
): ImportReview {
  const tickets = parseSlipText(text);

  const ticketReviews: TicketReview[] = tickets.map((ticket) => ({
    ticket,
    legMatches: ticket.legs.map((leg) => matchParsedLeg(leg, candidates, timeZone)),
    duplicateOfTicketId: findDuplicateTicket(
      {
        sportsbookTicketId: ticket.sportsbookTicketId,
        sportsbook: DEFAULT_SPORTSBOOK,
        stakeCents: ticket.stakeCents,
        toWinCents: ticket.toWinCents,
        placedAt: ticket.placedAt,
      },
      existingTickets,
    )?.id,
  }));

  return { tickets: ticketReviews };
}

/**
 * A user-edited review ticket, ready to save. Produced client-side from an
 * ImportReview after the user resolves unmatched legs, splits, or merges
 * (docs/PRD.md section 29: "user may split/merge parser results during
 * review"), and consumed by the approval Server Action to create exactly
 * one Ticket and its BetLegs.
 */
export interface ApprovedTicketGroup {
  sportsbookTicketId?: string;
  isBonusBet: boolean;
  stakeCents: number;
  toWinCents: number;
  totalReturnCents: number;
  placedAt?: string;
  promotionNote?: string;
  legs: ApprovedLeg[];
}

export interface ApprovedLeg {
  sport: string;
  league?: string;
  rawDescription: string;
  marketType: string;
  selection: string;
  line?: number;
  oddsAmerican?: number;
  eventId?: string;
  subjects: Array<{ teamId?: string; participantId?: string; direction: RootingDirection }>;
}
