// Stamps and clears a Ticket's `settled_at`. See docs/PRD.md §25 and §8.
//
// §25 says `settledAt` "is set when a Ticket's displayed status, manual or
// derived, first becomes terminal", and "is cleared if the status returns to
// non-terminal". Nothing in the app did either, which is the second half of the
// bug behind "why are last Sunday's bets still on my dashboard": even once the
// legs graded, `ticketSection` reads a terminal Ticket with no `settledAt` as
// "settled" forever, so the card moved into the collapsed section and then
// never left at the rollover it was supposed to leave at.
//
// Ticket status itself stays derived and unwritten — `effectiveTicketStatus` is
// computed at read time from the legs, and duplicating it into a column would
// create a second answer that can disagree. `settledAt` is different: it records
// *when* the status first became terminal, which cannot be recomputed after the
// fact, so it has to be persisted at the moment it happens.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LegSettlement, TicketStatus } from "@/lib/types/domain";
import { effectiveTicketStatus, isTerminalTicketStatus } from "./derived-status";

export interface SyncTicketSettlementOptions {
  userId: string;
  /** Re-check the Tickets with legs riding on these Events, after a refresh. */
  eventIds?: string[];
  /** Re-check the Tickets owning these legs, after a manual leg status edit. */
  betLegIds?: string[];
  /** Re-check these Tickets directly, after a manual status edit. */
  ticketIds?: string[];
  now?: () => string;
}

export interface SyncTicketSettlementResult {
  /** Tickets that just became terminal and now carry a `settledAt`. */
  settled: number;
  /** Tickets whose status went back to non-terminal, so `settledAt` was cleared. */
  reopened: number;
}

/**
 * Brings `settled_at` back in line with each affected Ticket's displayed status.
 *
 * Idempotent and order-independent: it recomputes every candidate Ticket from
 * its full set of legs and writes only on a change. That matters because sports
 * refresh in parallel — a parlay spanning two sports gets this called twice,
 * and the call that happens to run after the last leg grades is the one that
 * stamps it.
 */
export async function syncTicketSettlement(
  supabase: SupabaseClient,
  options: SyncTicketSettlementOptions,
): Promise<SyncTicketSettlementResult> {
  const { userId } = options;
  const now = options.now ?? (() => new Date().toISOString());
  const result: SyncTicketSettlementResult = { settled: 0, reopened: 0 };

  const ticketIds = await candidateTicketIds(supabase, userId, options);
  if (ticketIds.length === 0) return result;

  // Every leg of every candidate Ticket, not just the ones this refresh
  // touched: a parlay is only won when *all* its legs are, so grading it off a
  // subset would settle it on the first leg to come in.
  const { data: legRows, error: legError } = await supabase
    .from("bet_legs")
    .select("ticket_id,manual_status,automatic_status")
    .eq("user_id", userId)
    .in("ticket_id", ticketIds);
  if (legError) throw legError;

  const legsByTicket = new Map<string, { manualStatus: LegSettlement | null; automaticStatus: LegSettlement | null }[]>();
  for (const row of (legRows ?? []) as LegStatusRow[]) {
    const legs = legsByTicket.get(row.ticket_id) ?? [];
    legs.push({ manualStatus: row.manual_status, automaticStatus: row.automatic_status });
    legsByTicket.set(row.ticket_id, legs);
  }

  const { data: ticketRows, error: ticketError } = await supabase
    .from("tickets")
    .select("id,manual_status,settled_at")
    .eq("user_id", userId)
    .in("id", ticketIds);
  if (ticketError) throw ticketError;

  for (const ticket of (ticketRows ?? []) as TicketStatusRow[]) {
    // `anyLinkedEventLive` only separates "pending" from "active", and neither
    // is terminal, so it cannot change the answer this function needs. Passing
    // false keeps a whole extra Event query off the refresh path.
    const status = effectiveTicketStatus(ticket.manual_status, legsByTicket.get(ticket.id) ?? [], false);
    const terminal = isTerminalTicketStatus(status);

    if (terminal === Boolean(ticket.settled_at)) continue;

    const { error } = await supabase
      .from("tickets")
      .update({ settled_at: terminal ? now() : null })
      .eq("id", ticket.id);
    if (error) throw error;

    if (terminal) result.settled += 1;
    else result.reopened += 1;
  }

  return result;
}

interface LegStatusRow {
  ticket_id: string;
  manual_status: LegSettlement | null;
  automatic_status: LegSettlement | null;
}

interface TicketStatusRow {
  id: string;
  manual_status: TicketStatus | null;
  settled_at: string | null;
}

async function candidateTicketIds(
  supabase: SupabaseClient,
  userId: string,
  options: SyncTicketSettlementOptions,
): Promise<string[]> {
  const ids = new Set(options.ticketIds ?? []);
  const legIds = new Set(options.betLegIds ?? []);

  const eventIds = [...new Set(options.eventIds ?? [])];
  if (eventIds.length > 0) {
    const { data: links, error: linkError } = await supabase
      .from("bet_leg_events")
      .select("bet_leg_id")
      .eq("user_id", userId)
      .in("event_id", eventIds);
    if (linkError) throw linkError;
    for (const link of (links ?? []) as { bet_leg_id: string }[]) legIds.add(link.bet_leg_id);
  }

  if (legIds.size > 0) {
    const { data: legs, error: legError } = await supabase
      .from("bet_legs")
      .select("ticket_id")
      .eq("user_id", userId)
      .in("id", [...legIds]);
    if (legError) throw legError;
    for (const leg of (legs ?? []) as { ticket_id: string }[]) ids.add(leg.ticket_id);
  }

  return [...ids];
}
